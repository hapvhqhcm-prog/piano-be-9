import { isFutureData, migrate } from './migrations';
import { isValidPitch, samePitch } from '../piano/pitchTable';
import { COMPACT_WINDOW_DAYS, EMERGENCY_WINDOW_DAYS, compactData, recordMonotonicStickers } from './compaction';
import { RATING_STARS, bumpDataRev, hist, sessionCount } from './history';
import { confirmSelfChallenge, recordChallenges } from '../lessons/challenges';
import { upsertConcert } from '../lessons/concert';
import {
  defaultData,
  localDateStr,
  validateAppData,
  type AppData,
  type ChecklistKey,
  type Composition,
  type ConcertEntry,
  type GameScore,
  type ParentSong,
  type ParentResult,
  type Session,
  type SelfRating,
  type SongRun,
  type Settings,
} from './schema';
import {
  FUTURE_VERSION_MESSAGE,
  QUOTA_ESTIMATE_CHARS,
  STORAGE_KEY,
  errText,
  isQuotaError,
  makeStatus,
  usedChars,
  type KeyValueStorage,
  type StorageStatus,
} from './storage';
import {
  archiveCorrupt,
  archiveCurrent,
  archivedKeys,
  dropOldestArchive,
  loadStored,
  pruneArchives,
  pruneUnreadableCorrupt,
} from './storedData';

// Giữ nguyên API cũ (app + tests import từ './ProgressStore'): kho khóa–giá trị, hằng số, tình trạng lưu trữ — storage.ts;
// đọc dữ liệu / bản hỏng / bản cất — storedData.ts
export {
  FUTURE_VERSION_MESSAGE,
  MAX_ARCHIVES,
  MAX_UNREADABLE_CORRUPT,
  MemoryStorage,
  QUOTA_ESTIMATE_CHARS,
  STORAGE_FULL_MESSAGE,
  STORAGE_KEY,
  isQuotaError,
  type KeyValueStorage,
  type StorageStatus,
} from './storage';

/** Ghi xuống localStorage sau ngần này ms kể từ lần đổi cuối (gộp nhiều lần bấm thành một lần ghi). */
export const SAVE_DEBOUNCE_MS = 400;

export { RATING_STARS };

/** Kết quả nhập JSON / đặt lại. archiveFailed = không cất được bản hiện tại → chưa làm gì (gọi lại với { force: true }). */
export type ReplaceResult = { ok: true } | { ok: false; error: string; archiveFailed?: true };

export interface StoreOptions {
  /** Trễ ghi (ms). Mặc định SAVE_DEBOUNCE_MS trong trình duyệt, 0 (ghi ngay) ngoài trình duyệt (test). */
  saveDelayMs?: number;
  /** Gộp lịch sử khi mở và sau mỗi buổi (mặc định bật) */
  autoCompact?: boolean;
  /** Cửa sổ giữ buổi đầy đủ (ngày) — mặc định COMPACT_WINDOW_DAYS */
  compactWindowDays?: number;
  /** Ghi ngay khi trang bị ẩn / đóng (visibilitychange, pagehide). Mặc định bật trong trình duyệt. */
  pageEvents?: boolean;
  /**
   * (+ 2026-10-08) Bản sao thứ hai (IndexedDB — mirror.ts): nhận chuỗi JSON sau MỖI lần ghi localStorage thành công.
   * Phải tự nuốt lỗi, không chặn giao diện.
   */
  mirror?: { save(json: string): void; flush?(): void };
}

export function isEmptySession(s: Session): boolean {
  return (
    !s.completed &&
    s.selfRating === null &&
    s.parentAssessments.length === 0 &&
    s.appAssessments.length === 0 &&
    s.micAssessments.length === 0 &&
    s.songRuns.length === 0
  );
}

/** Store đang chạy (app chỉ có một) — cho storageStatus() dùng ở mọi màn. */
let activeStore: ProgressStore | null = null;

/** Tình trạng lưu trữ của store đang chạy (giao diện hiện băng khi !ok / full / futureVersion). */
export function storageStatus(): StorageStatus {
  return (
    activeStore?.storageStatus() ??
    makeStatus({
      ok: true,
      usedChars: 0,
      quotaEstimate: QUOTA_ESTIMATE_CHARS,
      lastError: null,
      full: false,
      futureVersion: false,
      pending: false,
    })
  );
}

const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

export class ProgressStore {
  private data: AppData;
  /** Lỗi lưu gần nhất (vd hết dung lượng) — màn phụ huynh hiển thị. */
  lastSaveError: string | null = null;
  /** Hết chỗ lưu dù đã gộp lịch sử + bỏ bản cất (xem storageStatus). */
  storageFull = false;
  /** Dữ liệu cũ bị hỏng và đã được sao lưu sang khóa khác khi khởi động. */
  recoveredFromCorrupt = false;
  /** Đã tự khôi phục tiến độ từ bản sao lưu nội bộ khi khởi động */
  recoveredFromBackup = false;
  /** (+ 2026-10-08) Đã khôi phục từ bản sao IndexedDB (mirror.ts) lúc mở app — main.ts đặt */
  recoveredFromMirror = false;
  /**
   * (+ 2026-10-06) Dữ liệu trong máy do bản app MỚI HƠN ghi: KHÔNG đặt lại, KHÔNG ghi đè (mọi lần lưu bị bỏ qua).
   * App chạy với dữ liệu tạm trống — giao diện phải hiện FUTURE_VERSION_MESSAGE.
   */
  futureVersion = false;
  /** Khóa bản cất ("archived-*") vừa tạo ở lần nhập JSON / đặt lại gần nhất */
  lastArchiveKey: string | null = null;
  private listeners = new Set<() => void>();
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly saveDelayMs: number;
  private readonly autoCompact: boolean;
  private readonly windowDays: number;
  private detach: (() => void) | null = null;
  private readonly mirror: StoreOptions['mirror'] | null;

  constructor(
    private readonly kv: KeyValueStorage,
    private readonly now: () => Date = () => new Date(),
    opts: StoreOptions = {},
  ) {
    this.saveDelayMs = opts.saveDelayMs ?? (inBrowser() ? SAVE_DEBOUNCE_MS : 0);
    this.autoCompact = opts.autoCompact ?? true;
    this.windowDays = opts.compactWindowDays ?? COMPACT_WINDOW_DAYS;
    this.mirror = opts.mirror ?? null;
    this.data = this.load();
    pruneUnreadableCorrupt(this.kv);
    bumpDataRev(this.data);
    if (this.compact()) this.writeNow();
    // Bản sao IndexedDB có ngay từ lần mở đầu (không chờ tới lần đổi đầu tiên). Dữ liệu mới tinh (chưa học buổi nào,
    // chưa có tên) thì KHÔNG gửi: không có gì để giữ, mà có thể đè mất bản sao tốt khi localStorage vừa bị xóa.
    if (!this.recoveredFromCorrupt && !this.futureVersion && (sessionCount(this.data) > 0 || this.data.learner.name)) this.mirrorNow();
    activeStore = this;
    if (opts.pageEvents ?? inBrowser()) this.listenPageEvents();
  }

  private listenPageEvents(): void {
    try {
      const onHide = () => {
        if (document.visibilityState !== 'hidden') return;
        this.flush();
        this.flushMirror();
      };
      const onPageHide = () => {
        this.flush();
        this.flushMirror();
      };
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onPageHide);
      this.detach = () => {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onPageHide);
      };
    } catch {
      /* môi trường không có DOM */
    }
  }

  /** Gửi dữ liệu hiện tại sang bản sao IndexedDB. Không bao giờ ném lỗi. */
  private mirrorNow(): void {
    if (!this.mirror) return;
    try {
      this.mirror.save(JSON.stringify(this.data));
    } catch {
      /* bỏ qua */
    }
  }

  /** Đẩy bản sao IndexedDB đang chờ (trang sắp ẩn / đóng). Không bao giờ ném lỗi. */
  private flushMirror(): void {
    try {
      this.mirror?.flush?.();
    } catch {
      /* bản sao phụ — lỗi không ảnh hưởng gì */
    }
  }

  /** Ghi nốt thay đổi còn chờ và gỡ sự kiện trang (test / khi thay store). */
  dispose(): void {
    this.flush();
    this.detach?.();
    this.detach = null;
    if (activeStore === this) activeStore = null;
  }

  /** Các khóa "archived-*", mới nhất trước. */
  archivedKeys(): string[] {
    return archivedKeys(this.kv);
  }

  /** Đọc dữ liệu chính khi mở app (storedData.loadStored: tự khôi phục / cất bản hỏng) + đặt các cờ khôi phục. */
  private load(): AppData {
    const r = loadStored(this.kv, this.now);
    if (r.futureVersion) this.futureVersion = true;
    if (r.recoveredFromBackup) this.recoveredFromBackup = true;
    if (r.recoveredFromCorrupt) this.recoveredFromCorrupt = true;
    return r.data;
  }

  /** Gộp lịch sử cũ (compaction.ts). Trả về true nếu có gộp. */
  private compact(windowDays: number = this.windowDays): boolean {
    if (!this.autoCompact || this.futureVersion) return false;
    try {
      return compactData(this.data, this.now(), windowDays).folded > 0;
    } catch {
      return false; // gộp lỗi không được làm hỏng việc lưu
    }
  }

  /** Chuỗi JSON vừa ghi thành công (cho bản sao IndexedDB) */
  private lastWritten: string | null = null;

  /** Thử ghi một lần. null = thành công, ngược lại là lỗi. */
  private tryWrite(): unknown {
    try {
      const json = JSON.stringify(this.data);
      this.kv.setItem(STORAGE_KEY, json);
      this.lastWritten = json;
      return null;
    } catch (e) {
      return e ?? new Error('setItem');
    }
  }

  /**
   * Ghi xuống localStorage NGAY. Hết chỗ → gộp lịch sử & thử lại → gộp mạnh hơn (4 tuần) & thử lại → bỏ bản "corrupt-*" rác → bỏ dần bản cất
   * (cũ nhất trước) & thử lại → vẫn lỗi: storageFull (giao diện hiện băng chặn). Trả về tình trạng.
   */
  private writeNow(): StorageStatus {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.dirty = false;
    if (this.futureVersion) return this.storageStatus(); // không bao giờ ghi đè dữ liệu của bản mới hơn
    const wasOk = !this.lastSaveError;
    let err = this.tryWrite();
    if (err !== null && isQuotaError(err)) {
      if (this.compact()) err = this.tryWrite();
      if (err !== null && this.compact(Math.min(this.windowDays, EMERGENCY_WINDOW_DAYS))) err = this.tryWrite();
      // (+ 2026-10-08) Vẫn đầy → bỏ các bản "corrupt-*" không đọc được TRƯỚC (rác, không cứu được gì), rồi mới tới bản cất
      if (err !== null && isQuotaError(err) && pruneUnreadableCorrupt(this.kv, 0)) err = this.tryWrite();
      while (err !== null && isQuotaError(err) && dropOldestArchive(this.kv)) err = this.tryWrite();
    }
    if (err === null) {
      this.lastSaveError = null;
      this.storageFull = false;
      // Dữ liệu chính vừa hỏng (recoveredFromCorrupt) → KHÔNG ghi đè bản sao IndexedDB (có thể là bản tốt duy nhất)
      if (this.mirror && this.lastWritten !== null && !this.recoveredFromCorrupt) {
        try {
          this.mirror.save(this.lastWritten); // bản sao thứ hai (IndexedDB) — ngầm, không chặn
        } catch {
          /* bỏ qua */
        }
      }
      this.lastWritten = null;
    } else {
      this.lastSaveError = errText(err);
      this.storageFull = isQuotaError(err);
    }
    if (wasOk !== !this.lastSaveError) this.listeners.forEach((fn) => fn());
    return this.storageStatus();
  }

  /** Ghi ngay mọi thay đổi còn chờ (cuối hoạt động, ẩn trang, xong buổi). Trả về tình trạng lưu. */
  flush(): StorageStatus {
    if (this.dirty) return this.writeNow();
    return this.storageStatus();
  }

  /** Đánh dấu dữ liệu đã đổi: tăng phiên bản (bỏ ghi nhớ cũ), hẹn ghi (debounce) và báo cho giao diện. */
  private save(): void {
    bumpDataRev(this.data);
    this.dirty = true;
    if (this.saveDelayMs <= 0) this.writeNow();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), this.saveDelayMs);
    this.listeners.forEach((fn) => fn());
  }

  /** Tình trạng lưu trữ hiện tại. */
  storageStatus(): StorageStatus {
    const used = usedChars(this.kv);
    return makeStatus({
      ok: !this.lastSaveError && !this.futureVersion,
      usedChars: used,
      quotaEstimate: QUOTA_ESTIMATE_CHARS,
      lastError: this.futureVersion ? FUTURE_VERSION_MESSAGE : this.lastSaveError,
      full: this.storageFull,
      futureVersion: this.futureVersion,
      pending: this.dirty,
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get(): Readonly<AppData> {
    return this.data;
  }

  get settings(): Readonly<Settings> {
    return this.data.settings;
  }

  today(): string {
    return localDateStr(this.now());
  }

  private session(id: string): Session {
    const s = this.data.sessions.find((x) => x.id === id);
    if (!s) throw new Error(`Không thấy buổi ${id}`);
    return s;
  }

  /** Buổi gần nhất CÓ dữ liệu (bỏ qua buổi vừa mở rồi thoát ngay). */
  latestSession(): Session | null {
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      if (!isEmptySession(this.data.sessions[i])) return this.data.sessions[i];
    }
    return null;
  }

  /** Bé mở buổi rồi Quay lại ngay, chưa có kết quả gì → không tính là một buổi. */
  discardSessionIfEmpty(sessionId: string): void {
    const i = this.data.sessions.findIndex((s) => s.id === sessionId);
    if (i < 0 || !isEmptySession(this.data.sessions[i])) return;
    this.data.sessions.splice(i, 1);
    this.recomputePracticeDays();
    this.save();
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
    this.flush();
  }

  setLearnerName(name: string): void {
    this.data.learner.name = name;
    this.save();
    this.flush();
  }

  setCurrentWeek(week: number): void {
    // (+ 2026-10-06) Lùi tuần: lưu lại sticker đảo / huy chương đã nhận để không bị mất
    if (week < this.data.progress.currentWeek) recordMonotonicStickers(this.data);
    this.data.progress.currentWeek = week;
    this.save();
    this.flush();
  }

  startSession(lessonId: string): Session {
    const now = this.now();
    // Mã buổi phải DUY NHẤT: addSongRun/finishSession… tìm buổi theo mã (find → buổi ĐẦU TIÊN trùng mã). Hai buổi mở cùng
    // một mili-giây mà số ngẫu nhiên trùng (hoặc Math.random bị thay trong test) → lượt chơi ghi nhầm sang buổi cũ.
    let id = `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    for (let k = 1; this.data.sessions.some((x) => x.id === id); k++) id = `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}${k.toString(36)}`;
    const s: Session = {
      id,
      date: localDateStr(now),
      lessonId,
      parentAssessments: [],
      appAssessments: [],
      micAssessments: [],
      songRuns: [],
      selfRating: null,
      startedAt: now.getTime(),
      endedAt: null,
      minutes: 0,
      completed: false,
      checklist: {},
    };
    this.data.sessions.push(s);
    this.save();
    return s;
  }

  private touch(s: Session): void {
    const elapsed = this.now().getTime() - s.startedAt;
    s.minutes = Math.max(1, Math.round(elapsed / 60000));
    this.recomputePracticeDays();
  }

  /** PARENT_ASSESSMENT: chỉ lưu nút người lớn bấm. */
  addParentAssessment(sessionId: string, note: string, result: ParentResult): void {
    const s = this.session(sessionId);
    s.parentAssessments.push({ note, result, ts: this.now().getTime() });
    this.touch(s);
    this.save();
  }

  /** "Sửa": đổi kết quả PARENT_ASSESSMENT vừa bấm. */
  amendLastParentAssessment(sessionId: string, result: ParentResult): void {
    const s = this.session(sessionId);
    const last = s.parentAssessments[s.parentAssessments.length - 1];
    if (!last) return;
    last.result = result;
    this.save();
  }

  /** Sửa một kết quả bất kỳ trong buổi (màn phụ huynh). */
  setParentAssessment(sessionId: string, index: number, result: ParentResult): void {
    const s = this.session(sessionId);
    const a = s.parentAssessments[index];
    if (!a) return;
    a.result = result;
    this.save();
  }

  /** APP_ASSESSMENT: trò chơi tai nghe — app biết chính xác phím nào. */
  addAppAssessment(sessionId: string, expected: string, actual: string): void {
    const s = this.session(sessionId);
    // Bb4 ≡ A#4: so theo cao độ khi cả hai là tên nốt
    let correct = expected === actual;
    if (!correct && isValidPitch(expected) && isValidPitch(actual)) correct = samePitch(expected, actual);
    s.appAssessments.push({ expected, actual, correct, ts: this.now().getTime() });
    this.touch(s);
    this.save();
  }

  /** MIC_ASSESSMENT: micro nghe bé đàn xong một nốt trên đàn cơ. */
  addMicAssessment(
    sessionId: string,
    rec: { expected: string; firstHeard: string; wrongCount: number },
  ): void {
    const s = this.session(sessionId);
    s.micAssessments.push({ ...rec, firstTry: rec.wrongCount === 0, ts: this.now().getTime() });
    this.touch(s);
    this.save();
  }

  /** Lượt chơi bài hát (theo nhịp / chế độ chờ). */
  addSongRun(sessionId: string, run: Omit<SongRun, 'ts'>): void {
    const s = this.session(sessionId);
    s.songRuns.push({ ...run, ts: this.now().getTime() });
    this.touch(s);
    this.save();
    this.flush(); // hết một lượt chơi = hết một hoạt động nhỏ → ghi ngay
  }

  /** "Sửa" sau khi micro chấm: bố/mẹ ghi đè kết quả của bản ghi micro gần nhất. */
  overrideLastMic(sessionId: string, result: ParentResult): void {
    const s = this.session(sessionId);
    const last = s.micAssessments[s.micAssessments.length - 1];
    if (!last) return;
    last.parentOverride = result;
    this.save();
  }

  setSelfRating(sessionId: string, rating: SelfRating): void {
    const s = this.session(sessionId);
    s.selfRating = rating;
    this.touch(s);
    this.save();
    this.flush();
  }

  finishSession(sessionId: string): void {
    const s = this.session(sessionId);
    s.completed = true;
    s.endedAt = this.now().getTime();
    this.touch(s);
    // (+ 2026-10-07) 🏆 Lưu tuần vừa hoàn thành thử thách (đánh dấu dữ liệu mới trước — bỏ ghi nhớ cũ)
    bumpDataRev(this.data);
    recordChallenges(this.data, this.today(), s.endedAt);
    // Gộp lịch sử cũ (nếu có) rồi ghi ngay
    this.compact();
    this.save();
    this.flush();
  }

  setChecklist(sessionId: string, key: ChecklistKey, value: boolean): void {
    this.session(sessionId).checklist[key] = value;
    this.save();
  }

  /** (v5) Bài bé tự sáng tác — trò "Sáng tác"; hiện trong Thư viện mục "Bài của con". */
  addComposition(c: Composition): void {
    const list = (this.data.compositions ??= []);
    const i = list.findIndex((x) => x.id === c.id);
    const copy: Composition = { ...c, notes: c.notes.map((n) => ({ ...n })) };
    if (i >= 0) list[i] = copy;
    else list.push(copy);
    this.save();
    this.flush();
  }

  /** Các bài bé sáng tác (cũ → mới). */
  compositions(): readonly Composition[] {
    return this.data.compositions ?? [];
  }

  findComposition(id: string): Composition | undefined {
    return this.data.compositions?.find((c) => c.id === id);
  }

  // ---------------- (+ 2026-10-06) Bài bố mẹ thêm — chỉ lưu trên iPad này ----------------

  private static copySong(c: ParentSong): ParentSong {
    return {
      ...c,
      notes: c.notes.map((n) => ({ ...n })),
      ...(c.lh ? { lh: c.lh.map((n) => ({ ...n })) } : {}),
      ...(c.phrases ? { phrases: [...c.phrases] } : {}),
    };
  }

  /** Thêm bài mới (trùng id → thay bài cũ). */
  addParentSong(c: ParentSong): void {
    const list = (this.data.parentSongs ??= []);
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = ProgressStore.copySong(c);
    else list.push(ProgressStore.copySong(c));
    this.save();
    this.flush();
  }

  /** Sửa bài đã có (giữ createdAt, ghi updatedAt). Không có bài → false. */
  updateParentSong(id: string, patch: Partial<Omit<ParentSong, 'id' | 'createdAt'>>): boolean {
    const list = this.data.parentSongs ?? [];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    list[i] = ProgressStore.copySong({ ...list[i], ...patch, id, createdAt: list[i].createdAt, updatedAt: this.now().getTime() });
    this.save();
    this.flush();
    return true;
  }

  /** Xóa bài (các lượt chơi đã ghi vẫn giữ trong lịch sử). Không có bài → false. */
  deleteParentSong(id: string): boolean {
    const list = this.data.parentSongs ?? [];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    this.save();
    this.flush();
    return true;
  }

  /** Các bài bố mẹ thêm (cũ → mới). */
  parentSongs(): readonly ParentSong[] {
    return this.data.parentSongs ?? [];
  }

  findParentSong(id: string): ParentSong | undefined {
    return this.data.parentSongs?.find((c) => c.id === id);
  }

  // ---------------- (+ 2026-10-07) 🎮 Trò chơi — kỷ lục riêng, không đụng tới sessions ----------------

  /** Kỷ lục của một trò (undefined = chưa chơi). */
  gameScore(id: string): Readonly<GameScore> | undefined {
    return this.data.games?.[id];
  }

  /**
   * Ghi một lượt chơi xong: +1 lượt, cập nhật kỷ lục. `record` = điểm > kỷ lục cũ (và > 0) → "Kỷ lục mới!".
   * Ghi ngay (flush) — trò chơi ngắn, bé có thể tắt app ngay sau đó.
   */
  recordGame(id: string, score: number): { best: number; prevBest: number; record: boolean } {
    const s = Number.isFinite(score) ? Math.max(0, score) : 0;
    const games = (this.data.games ??= {});
    const prev = games[id];
    const prevBest = prev?.best ?? 0;
    const best = Math.max(prevBest, s);
    games[id] = { best, plays: (prev?.plays ?? 0) + 1, lastAt: this.now().getTime() };
    this.save();
    this.flush();
    return { best, prevBest, record: s > prevBest && s > 0 };
  }

  /**
   * (+ 2026-10-08) 🎤 Lưu (thêm / cập nhật cùng id) một buổi "Biểu diễn cho cả nhà" — mỗi tuần giáo trình tối đa MỘT buổi.
   * Lưu riêng ở AppData.concerts (không trong sessions) → gộp lịch sử không đụng tới. Trả về false nếu không lưu.
   */
  saveConcert(c: ConcertEntry): boolean {
    if (!upsertConcert(this.data, c)) return false;
    this.save();
    this.flush();
    return true;
  }

  /**
   * (+ 2026-10-07) 🏆 Lưu thử thách tuần đã xong / chụp mốc kỷ lục trò chơi khi sang tuần mới (màn chính gọi).
   * Chỉ ghi khi có đổi.
   */
  recordChallenges(): void {
    if (this.futureVersion) return;
    if (recordChallenges(this.data, this.today(), this.now().getTime())) {
      this.save();
      this.flush();
    }
  }

  /** (+ 2026-10-08) 👪 Bố mẹ xác nhận thử thách "ngoài đời" của tuần này (chỉ thêm). true = đã ghi. */
  confirmChallenge(id: string): boolean {
    if (this.futureVersion) return false;
    if (!confirmSelfChallenge(this.data, this.today(), id, this.now().getTime())) return false;
    this.save();
    this.flush();
    return true;
  }

  /** Đánh dấu xong bài / xong một hoạt động ("<bài>#<i>") — cuối hoạt động → ghi ngay. */
  markLessonCompleted(lessonId: string): void {
    if (!this.data.progress.lessonsCompleted.includes(lessonId)) {
      this.data.progress.lessonsCompleted.push(lessonId);
      this.save();
    }
    this.flush();
  }

  /** practiceDays luôn suy ra từ sessions (+ phần của các buổi đã gộp — history.practiceDays) → không lệch nhau. */
  recomputePracticeDays(): void {
    const days: AppData['progress']['practiceDays'] = {};
    for (const [date, [minutes, stars]] of Object.entries(hist(this.data).practiceDays)) days[date] = { minutes, stars };
    for (const s of this.data.sessions) {
      if (s.minutes === 0 && !s.selfRating) continue;
      const d = (days[s.date] ??= { minutes: 0, stars: 0 });
      d.minutes += s.minutes;
      if (s.selfRating) d.stars += RATING_STARS[s.selfRating];
    }
    this.data.progress.practiceDays = days;
    bumpDataRev(this.data);
  }

  exportJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Thay toàn bộ dữ liệu bằng JSON nhập vào. Dữ liệu hiện tại được CẤT ("archived-*") trước; không cất được (hết chỗ)
   * → TỪ CHỐI ({ ok: false, archiveFailed: true }) trừ khi `force` (phụ huynh xác nhận chấp nhận mất bản hiện tại).
   */
  importJSON(text: string, opts: { force?: boolean } = {}): ReplaceResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'File không phải JSON hợp lệ' };
    }
    if (isFutureData(parsed)) return { ok: false, error: FUTURE_VERSION_MESSAGE };
    let d: AppData;
    try {
      d = migrate(parsed);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const errs = validateAppData(d);
    if (errs.length) return { ok: false, error: `Dữ liệu sai cấu trúc: ${errs.slice(0, 3).join('; ')}` };
    const arch = archiveCurrent(this.kv, this.data, this.futureVersion, this.now); // dữ liệu đang có được cất lại trước khi bị thay
    if (arch.needed && !arch.key && !opts.force) {
      return { ok: false, error: 'Không cất được bản dữ liệu hiện tại (bộ nhớ đầy) — hãy xuất JSON sao lưu trước.', archiveFailed: true };
    }
    this.lastArchiveKey = arch.key;
    const prev = this.beginReplace();
    this.data = d;
    this.recomputePracticeDays();
    this.compact();
    archiveCorrupt(this.kv); // dữ liệu nhập là ý muốn của phụ huynh → bản sao lưu cũ không được đè lên
    pruneArchives(this.kv);
    return this.commitReplace(prev);
  }

  /** Giữ dữ liệu đang dùng trước khi thay (để trả lại nếu không ghi được). */
  private beginReplace(): { data: AppData; futureVersion: boolean; recoveredFromCorrupt: boolean } {
    const prev = { data: this.data, futureVersion: this.futureVersion, recoveredFromCorrupt: this.recoveredFromCorrupt };
    this.futureVersion = false;
    this.recoveredFromCorrupt = false; // dữ liệu mới là ý muốn của phụ huynh → bản sao IndexedDB theo nó
    return prev;
  }

  /**
   * (+ 2026-10-08) Ghi dữ liệu vừa thay. Ghi KHÔNG được (hết chỗ…) → trả lỗi (trước đây vẫn báo { ok: true } trong khi
   * localStorage còn dữ liệu cũ → mở lại app thấy "mất" dữ liệu vừa nhập) và dùng lại dữ liệu cũ cho khớp với bộ nhớ.
   */
  private commitReplace(prev: { data: AppData; futureVersion: boolean; recoveredFromCorrupt: boolean }): ReplaceResult {
    this.save();
    const st = this.flush();
    if (st.ok) return { ok: true };
    const why = st.full ? 'bộ nhớ của iPad cho app đã đầy' : st.lastError ?? 'lỗi ghi';
    this.data = prev.data;
    this.futureVersion = prev.futureVersion;
    this.recoveredFromCorrupt = prev.recoveredFromCorrupt;
    bumpDataRev(this.data);
    this.dirty = true; // bộ nhớ vẫn giữ bản cũ; lần ghi sau (ẩn trang…) thử ghi lại cho chắc
    this.listeners.forEach((fn) => fn());
    return { ok: false, error: `Chưa lưu được (${why}) — dữ liệu cũ vẫn giữ nguyên.` };
  }

  /**
   * Xóa hết (về dữ liệu mới). Cất bản hiện tại trước; không cất được → TỪ CHỐI trừ khi `force`.
   */
  resetAll(opts: { force?: boolean } = {}): ReplaceResult {
    const arch = archiveCurrent(this.kv, this.data, this.futureVersion, this.now); // lỡ tay "Xóa hết" vẫn còn bản cất
    if (arch.needed && !arch.key && !opts.force) {
      return { ok: false, error: 'Không cất được bản dữ liệu hiện tại (bộ nhớ đầy) — hãy xuất JSON sao lưu trước.', archiveFailed: true };
    }
    this.lastArchiveKey = arch.key;
    const prev = this.beginReplace();
    this.data = defaultData(this.now());
    archiveCorrupt(this.kv); // đặt lại có chủ ý → lần mở sau không được tự khôi phục bản cũ
    pruneArchives(this.kv);
    return this.commitReplace(prev);
  }
}
