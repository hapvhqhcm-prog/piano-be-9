import { isFutureData, migrate } from './migrations';
import { isValidPitch, samePitch } from '../piano/pitchTable';
import { COMPACT_WINDOW_DAYS, EMERGENCY_WINDOW_DAYS, compactData, recordMonotonicStickers } from './compaction';
import { RATING_STARS, bumpDataRev, hist, sessionCount } from './history';
import {
  defaultData,
  localDateStr,
  validateAppData,
  type AppData,
  type ChecklistKey,
  type Composition,
  type ParentSong,
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
/**
 * Giữ tối đa bao nhiêu bản "archived-*" (2026-10-06: 3 → 1 — rà soát độ bền: 3 bản đầy đủ làm localStorage ~5 MB
 * đầy sau ~1,3 năm). Bản cất là dữ liệu ĐÃ GỘP (compaction.ts) nên nhỏ.
 */
export const MAX_ARCHIVES = 1;
/** Ước lượng dung lượng localStorage của Safari theo KÝ TỰ (~5 MiB, mỗi ký tự UTF-16 = 2 byte). */
export const QUOTA_ESTIMATE_CHARS = 2_621_440;
/** Ghi xuống localStorage sau ngần này ms kể từ lần đổi cuối (gộp nhiều lần bấm thành một lần ghi). */
export const SAVE_DEBOUNCE_MS = 400;
/** Lời báo khi dữ liệu do bản app MỚI HƠN ghi (không đặt lại, không ghi đè — chờ cập nhật app). */
export const FUTURE_VERSION_MESSAGE = 'Dữ liệu từ phiên bản mới hơn — hãy cập nhật app';
/** Lời báo khi hết chỗ lưu (giao diện hiện băng chặn). */
export const STORAGE_FULL_MESSAGE = 'Bộ nhớ của iPad cho app đã đầy — tiến độ mới CHƯA được lưu. Hãy sao lưu (xuất JSON) rồi báo người cài app.';

export { RATING_STARS };

/** Tình trạng lưu trữ — giao diện hiện băng cảnh báo khi !ok hoặc futureVersion. */
export interface StorageStatus {
  /** Lần ghi gần nhất thành công (và không ở chế độ "dữ liệu mới hơn") */
  ok: boolean;
  /** Tổng số ký tự (khóa + giá trị) trong localStorage của app */
  usedChars: number;
  /** Ước lượng giới hạn (ký tự) — QUOTA_ESTIMATE_CHARS */
  quotaEstimate: number;
  /** Lỗi ghi gần nhất (null = không lỗi) */
  lastError: string | null;
  /** Hết chỗ: đã gộp lịch sử + bỏ bản cất mà vẫn không ghi được → giao diện phải hiện băng CHẶN */
  full: boolean;
  /** Dữ liệu trong máy do bản app mới hơn ghi → giữ nguyên, không ghi gì; hiện FUTURE_VERSION_MESSAGE */
  futureVersion: boolean;
  /** Còn thay đổi chưa ghi xuống (đang chờ debounce) */
  pending: boolean;
  /** usedChars × 2 (UTF-16) / quotaEstimate × 2 / phần trăm đã dùng — cho dòng "Bộ nhớ dữ liệu" ở màn phụ huynh */
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  /** Một câu cho phụ huynh: dung lượng, hoặc lời báo hết chỗ / dữ liệu bản mới hơn */
  text: string;
}

const sizeText = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function makeStatus(s: Omit<StorageStatus, 'usedBytes' | 'quotaBytes' | 'percent' | 'text'>): StorageStatus {
  const usedBytes = s.usedChars * 2;
  const quotaBytes = s.quotaEstimate * 2;
  const percent = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
  const text = s.futureVersion
    ? FUTURE_VERSION_MESSAGE
    : s.full
      ? STORAGE_FULL_MESSAGE
      : s.lastError
        ? `Lỗi lưu dữ liệu: ${s.lastError}`
        : `Bộ nhớ dữ liệu: ${sizeText(usedBytes)} / ${sizeText(quotaBytes)} (${percent}%)`;
  return { ...s, usedBytes, quotaBytes, percent, text };
}

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

/** Lỗi "hết chỗ" của localStorage (Safari: QuotaExceededError, mã 22; Firefox: 1014). */
export function isQuotaError(e: unknown): boolean {
  const x = e as { name?: string; code?: number } | null;
  return !!x && (x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22 || x.code === 1014);
}

const errText = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));

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

  constructor(
    private readonly kv: KeyValueStorage,
    private readonly now: () => Date = () => new Date(),
    opts: StoreOptions = {},
  ) {
    this.saveDelayMs = opts.saveDelayMs ?? (inBrowser() ? SAVE_DEBOUNCE_MS : 0);
    this.autoCompact = opts.autoCompact ?? true;
    this.windowDays = opts.compactWindowDays ?? COMPACT_WINDOW_DAYS;
    this.data = this.load();
    bumpDataRev(this.data);
    if (this.compact()) this.writeNow();
    activeStore = this;
    if (opts.pageEvents ?? inBrowser()) this.listenPageEvents();
  }

  private listenPageEvents(): void {
    try {
      const onHide = () => {
        if (document.visibilityState === 'hidden') this.flush();
      };
      const onPageHide = () => this.flush();
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

  /** Ghi nốt thay đổi còn chờ và gỡ sự kiện trang (test / khi thay store). */
  dispose(): void {
    this.flush();
    this.detach?.();
    this.detach = null;
    if (activeStore === this) activeStore = null;
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

  /** Có ít nhất một bản cất "archived-*" (để giao diện nói "đã cất bản cũ"). */
  hasArchive(): boolean {
    return this.archivedKeys().length > 0;
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

  /** Bỏ bản cất CŨ NHẤT (trừ `keep`). Trả về false nếu không còn bản nào để bỏ. */
  private dropOldestArchive(keep?: string): boolean {
    const k = this.archivedKeys()
      .filter((x) => x !== keep)
      .pop();
    if (!k) return false;
    try {
      this.kv.removeItem(k);
    } catch {
      return false;
    }
    return true;
  }

  /**
   * Trước khi GHI ĐÈ dữ liệu (nhập JSON / đặt lại): cất bản hiện tại sang "archived-<thời điểm>" để lỡ tay còn cứu được.
   * Dữ liệu trống (chưa học buổi nào) thì không cần cất. Dữ liệu "bản mới hơn" → cất nguyên chuỗi gốc.
   * Ghi bản mới TRƯỚC; hết chỗ thì bỏ dần bản cất cũ rồi thử lại. Thành công → chỉ giữ MAX_ARCHIVES bản mới nhất.
   */
  private archiveCurrent(): { needed: boolean; key: string | null } {
    const raw = this.futureVersion ? this.kv.getItem(STORAGE_KEY) : null;
    const needed = this.futureVersion ? raw !== null : sessionCount(this.data) > 0 || !!this.data.learner.name;
    if (!needed) return { needed: false, key: null };
    const payload = raw ?? JSON.stringify(this.data);
    let ts = this.now().getTime();
    while (this.kv.getItem(`${STORAGE_KEY}:archived-${ts}`) !== null) ts++;
    const key = `${STORAGE_KEY}:archived-${ts}`;
    for (;;) {
      try {
        this.kv.setItem(key, payload);
        break;
      } catch {
        if (!this.dropOldestArchive(key)) return { needed: true, key: null };
      }
    }
    // Bản vừa cất luôn được giữ (kể cả khi đồng hồ lùi làm nó không "mới nhất")
    const rest = this.archivedKeys().filter((k) => k !== key);
    for (const k of rest.slice(Math.max(0, MAX_ARCHIVES - 1))) {
      try {
        this.kv.removeItem(k);
      } catch {
        /* bỏ qua */
      }
    }
    return { needed: true, key };
  }

  private load(): AppData {
    const raw = this.kv.getItem(STORAGE_KEY);
    // (+ 2026-10-06) Dữ liệu của bản app MỚI HƠN: giữ NGUYÊN (không coi là hỏng, không khôi phục bản khác đè lên)
    if (raw) {
      try {
        if (isFutureData(JSON.parse(raw))) {
          this.futureVersion = true;
          return defaultData(this.now());
        }
      } catch {
        /* không phải JSON → xử lý như dữ liệu hỏng bên dưới */
      }
    }
    const main = this.parse(raw);
    // Tự khôi phục (chỉ một lần): dữ liệu chính trống/ít hơn một bản từng bị đặt lại do lỗi kiểm tra cũ
    // (vd lỗi tuần 9) → dùng bản đó. Các bản đọc được còn lại coi như cũ → cất sang "archived-*" để sau này
    // không đè lên dữ liệu thật (đặt lại / nhập JSON). Bản chưa đọc được giữ nguyên chờ bản sửa lỗi sau.
    // So TỔNG số buổi (gồm buổi đã gộp vào history) — dữ liệu đã gộp có ít buổi "còn giữ" hơn.
    const backups = this.corruptBackups();
    const best = backups.find((b) => sessionCount(b.data) > (main ? sessionCount(main) : 0));
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

  /** Gộp lịch sử cũ (compaction.ts). Trả về true nếu có gộp. */
  private compact(windowDays: number = this.windowDays): boolean {
    if (!this.autoCompact || this.futureVersion) return false;
    try {
      return compactData(this.data, this.now(), windowDays).folded > 0;
    } catch {
      return false; // gộp lỗi không được làm hỏng việc lưu
    }
  }

  /** Thử ghi một lần. null = thành công, ngược lại là lỗi. */
  private tryWrite(): unknown {
    try {
      this.kv.setItem(STORAGE_KEY, JSON.stringify(this.data));
      return null;
    } catch (e) {
      return e ?? new Error('setItem');
    }
  }

  /**
   * Ghi xuống localStorage NGAY. Hết chỗ → gộp lịch sử & thử lại → gộp mạnh hơn (4 tuần) & thử lại → bỏ dần bản cất
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
      while (err !== null && isQuotaError(err) && this.dropOldestArchive()) err = this.tryWrite();
    }
    if (err === null) {
      this.lastSaveError = null;
      this.storageFull = false;
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
    let used = 0;
    const n = this.kv.length ?? 0;
    for (let i = 0; i < n; i++) {
      const k = this.kv.key?.(i);
      if (!k) continue;
      try {
        used += k.length + (this.kv.getItem(k)?.length ?? 0);
      } catch {
        /* bỏ qua */
      }
    }
    if (!n) used = (this.kv.getItem(STORAGE_KEY)?.length ?? 0) + STORAGE_KEY.length;
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
    const arch = this.archiveCurrent(); // dữ liệu đang có được cất lại trước khi bị thay
    if (arch.needed && !arch.key && !opts.force) {
      return { ok: false, error: 'Không cất được bản dữ liệu hiện tại (bộ nhớ đầy) — hãy xuất JSON sao lưu trước.', archiveFailed: true };
    }
    this.lastArchiveKey = arch.key;
    this.futureVersion = false;
    this.data = d;
    this.recomputePracticeDays();
    this.compact();
    this.archiveCorrupt(); // dữ liệu nhập là ý muốn của phụ huynh → bản sao lưu cũ không được đè lên
    this.pruneArchives();
    this.save();
    this.flush();
    return { ok: true };
  }

  /**
   * Xóa hết (về dữ liệu mới). Cất bản hiện tại trước; không cất được → TỪ CHỐI trừ khi `force`.
   */
  resetAll(opts: { force?: boolean } = {}): ReplaceResult {
    const arch = this.archiveCurrent(); // lỡ tay "Xóa hết" vẫn còn bản cất
    if (arch.needed && !arch.key && !opts.force) {
      return { ok: false, error: 'Không cất được bản dữ liệu hiện tại (bộ nhớ đầy) — hãy xuất JSON sao lưu trước.', archiveFailed: true };
    }
    this.lastArchiveKey = arch.key;
    this.futureVersion = false;
    this.data = defaultData(this.now());
    this.archiveCorrupt(); // đặt lại có chủ ý → lần mở sau không được tự khôi phục bản cũ
    this.pruneArchives();
    this.save();
    this.flush();
    return { ok: true };
  }
}
