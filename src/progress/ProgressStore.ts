import { migrate } from './migrations';
import { isValidPitch, samePitch } from '../piano/pitchTable';
import {
  defaultData,
  localDateStr,
  validateAppData,
  type AppData,
  type ChecklistKey,
  type ParentResult,
  type Session,
  type SelfRating,
  type SongRun,
  type Settings,
} from './schema';

/** Giao diện tối thiểu của localStorage — tiêm vào để test không cần DOM. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Liệt kê khóa (localStorage có sẵn qua length/key) — để tìm bản sao lưu "corrupt-*" */
  readonly length?: number;
  key?(index: number): string | null;
}

export const STORAGE_KEY = 'piano-be-9';
/** Giữ tối đa bao nhiêu bản "archived-*" (mỗi bản vài chục KB — localStorage chỉ ~5 MB). */
export const MAX_ARCHIVES = 3;

/**
 * Sao thưởng cho việc HOÀN THÀNH buổi — bằng nhau cho mọi câu trả lời: bé nói thật "khó quá" không bị ít sao hơn.
 * Câu bé tự chọn chỉ là thông tin cho bố mẹ (màn Phụ huynh).
 */
export const RATING_STARS: Record<SelfRating, number> = { all: 3, some: 3, hard: 3 };

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

export class MemoryStorage implements KeyValueStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export class ProgressStore {
  private data: AppData;
  /** Lỗi lưu gần nhất (vd hết dung lượng) — màn phụ huynh hiển thị. */
  lastSaveError: string | null = null;
  /** Dữ liệu cũ bị hỏng và đã được sao lưu sang khóa khác khi khởi động. */
  recoveredFromCorrupt = false;
  /** Đã tự khôi phục tiến độ từ bản sao lưu nội bộ khi khởi động */
  recoveredFromBackup = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly kv: KeyValueStorage,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.load();
  }

  private parse(raw: string | null): AppData | null {
    if (!raw) return null;
    try {
      const d = migrate(JSON.parse(raw));
      return validateAppData(d).length === 0 ? d : null;
    } catch {
      return null;
    }
  }

  /** Các bản dữ liệu từng bị coi là hỏng (đã cất ở khóa "piano-be-9:corrupt-<thời điểm>"), mới nhất trước. */
  private corruptBackups(): Array<{ key: string; data: AppData }> {
    const out: Array<{ key: string; data: AppData; ts: number }> = [];
    for (const k of this.corruptKeys()) {
      const d = this.parse(this.kv.getItem(k));
      if (d) out.push({ key: k, data: d, ts: Number(k.split('-').pop()) || 0 });
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  /** Các khóa "corrupt-*" hiện có (cả bản đọc được lẫn không). */
  private corruptKeys(): string[] {
    const keys: string[] = [];
    const n = this.kv.length ?? 0;
    for (let i = 0; i < n; i++) {
      const k = this.kv.key?.(i);
      if (k && k.startsWith(`${STORAGE_KEY}:corrupt-`)) keys.push(k);
    }
    return keys;
  }

  /**
   * Cất bản sao lưu "corrupt-*" sang "archived-*": không bao giờ tự khôi phục nữa nhưng vẫn giữ lại
   * (không mất gì). Tránh bản cũ đè lên dữ liệu sau khi đặt lại / nhập JSON.
   */
  private archiveCorrupt(keys: string[] = this.corruptKeys()): void {
    for (const k of keys) {
      try {
        const v = this.kv.getItem(k);
        if (v !== null) this.kv.setItem(k.replace(`${STORAGE_KEY}:corrupt-`, `${STORAGE_KEY}:archived-`), v);
        this.kv.removeItem(k);
      } catch {
        /* bỏ qua */
      }
    }
  }

  /** Các khóa "archived-*", mới nhất trước. */
  archivedKeys(): string[] {
    const keys: string[] = [];
    const n = this.kv.length ?? 0;
    for (let i = 0; i < n; i++) {
      const k = this.kv.key?.(i);
      if (k && k.startsWith(`${STORAGE_KEY}:archived-`)) keys.push(k);
    }
    const ts = (k: string) => Number(k.split('-').pop()) || 0;
    return keys.sort((a, b) => ts(b) - ts(a));
  }

  /** Chỉ giữ MAX_ARCHIVES bản mới nhất. */
  private pruneArchives(): void {
    for (const k of this.archivedKeys().slice(MAX_ARCHIVES)) {
      try {
        this.kv.removeItem(k);
      } catch {
        /* bỏ qua */
      }
    }
  }

  /**
   * Trước khi GHI ĐÈ dữ liệu (nhập JSON / đặt lại): cất bản hiện tại sang "archived-<thời điểm>" để lỡ tay còn cứu được.
   * Dữ liệu trống (chưa học buổi nào) thì không cần cất. Trả về khóa đã cất (null nếu không cất / không ghi được).
   */
  private archiveCurrent(): string | null {
    if (this.data.sessions.length === 0 && !this.data.learner.name) return null;
    let ts = this.now().getTime();
    while (this.kv.getItem(`${STORAGE_KEY}:archived-${ts}`) !== null) ts++;
    const key = `${STORAGE_KEY}:archived-${ts}`;
    // Bớt bản cũ TRƯỚC để còn chỗ (localStorage đầy thì setItem lỗi)
    for (const k of this.archivedKeys().slice(MAX_ARCHIVES - 1)) {
      try {
        this.kv.removeItem(k);
      } catch {
        /* bỏ qua */
      }
    }
    try {
      this.kv.setItem(key, JSON.stringify(this.data));
      return key;
    } catch {
      return null; // hết chỗ → vẫn cho nhập/đặt lại (ý muốn của phụ huynh), chỉ là không có bản cất
    }
  }

  private load(): AppData {
    const raw = this.kv.getItem(STORAGE_KEY);
    const main = this.parse(raw);
    // Tự khôi phục (chỉ một lần): dữ liệu chính trống/ít hơn một bản từng bị đặt lại do lỗi kiểm tra cũ
    // (vd lỗi tuần 9) → dùng bản đó. Các bản đọc được còn lại coi như cũ → cất sang "archived-*" để sau này
    // không đè lên dữ liệu thật (đặt lại / nhập JSON). Bản chưa đọc được giữ nguyên chờ bản sửa lỗi sau.
    const backups = this.corruptBackups();
    const best = backups.find((b) => b.data.sessions.length > (main?.sessions.length ?? 0));
    if (best) {
      this.recoveredFromBackup = true;
      try {
        // Dữ liệu chính đang hỏng → vẫn cất lại trước khi ghi đè
        if (raw && !main) this.kv.setItem(`${STORAGE_KEY}:corrupt-${this.now().getTime()}`, raw);
        this.kv.setItem(STORAGE_KEY, JSON.stringify(best.data));
        this.archiveCorrupt(backups.map((b) => b.key));
      } catch {
        /* bỏ qua — chưa ghi được thì để nguyên, lần mở sau thử lại */
      }
      return best.data;
    }
    this.archiveCorrupt(backups.map((b) => b.key));
    if (main) return main;
    if (!raw) return defaultData(this.now());
    try {
      this.kv.setItem(`${STORAGE_KEY}:corrupt-${this.now().getTime()}`, raw);
    } catch {
      /* bỏ qua */
    }
    this.recoveredFromCorrupt = true;
    return defaultData(this.now());
  }

  private save(): void {
    try {
      this.kv.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this.lastSaveError = null;
    } catch (e) {
      this.lastSaveError = e instanceof Error ? e.message : String(e);
    }
    this.listeners.forEach((fn) => fn());
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
  }

  setLearnerName(name: string): void {
    this.data.learner.name = name;
    this.save();
  }

  setCurrentWeek(week: number): void {
    this.data.progress.currentWeek = week;
    this.save();
  }

  startSession(lessonId: string): Session {
    const now = this.now();
    const s: Session = {
      id: `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
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
  }

  finishSession(sessionId: string): void {
    const s = this.session(sessionId);
    s.completed = true;
    s.endedAt = this.now().getTime();
    this.touch(s);
    this.save();
  }

  setChecklist(sessionId: string, key: ChecklistKey, value: boolean): void {
    this.session(sessionId).checklist[key] = value;
    this.save();
  }

  markLessonCompleted(lessonId: string): void {
    if (!this.data.progress.lessonsCompleted.includes(lessonId)) {
      this.data.progress.lessonsCompleted.push(lessonId);
      this.save();
    }
  }

  /** practiceDays luôn suy ra từ sessions → không lệch nhau. */
  recomputePracticeDays(): void {
    const days: AppData['progress']['practiceDays'] = {};
    for (const s of this.data.sessions) {
      if (s.minutes === 0 && !s.selfRating) continue;
      const d = (days[s.date] ??= { minutes: 0, stars: 0 });
      d.minutes += s.minutes;
      if (s.selfRating) d.stars += RATING_STARS[s.selfRating];
    }
    this.data.progress.practiceDays = days;
  }

  exportJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importJSON(text: string): { ok: true } | { ok: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'File không phải JSON hợp lệ' };
    }
    let d: AppData;
    try {
      d = migrate(parsed);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const errs = validateAppData(d);
    if (errs.length) return { ok: false, error: `Dữ liệu sai cấu trúc: ${errs.slice(0, 3).join('; ')}` };
    this.archiveCurrent(); // dữ liệu đang có được cất lại trước khi bị thay
    this.data = d;
    this.recomputePracticeDays();
    this.archiveCorrupt(); // dữ liệu nhập là ý muốn của phụ huynh → bản sao lưu cũ không được đè lên
    this.pruneArchives();
    this.save();
    return { ok: true };
  }

  resetAll(): void {
    this.archiveCurrent(); // lỡ tay "Xóa hết" vẫn còn bản cất
    this.data = defaultData(this.now());
    this.archiveCorrupt(); // đặt lại có chủ ý → lần mở sau không được tự khôi phục bản cũ
    this.pruneArchives();
    this.save();
  }
}
