import { migrate } from './migrations';
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
}

export const STORAGE_KEY = 'piano-be-9';

export const RATING_STARS: Record<SelfRating, number> = { all: 3, some: 2, hard: 1 };

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
  private listeners = new Set<() => void>();

  constructor(
    private readonly kv: KeyValueStorage,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.load();
  }

  private load(): AppData {
    const raw = this.kv.getItem(STORAGE_KEY);
    if (!raw) return defaultData(this.now());
    try {
      const d = migrate(JSON.parse(raw));
      if (validateAppData(d).length === 0) return d;
    } catch {
      /* rơi xuống nhánh dưới */
    }
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
    s.appAssessments.push({ expected, actual, correct: expected === actual, ts: this.now().getTime() });
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
    this.data = d;
    this.recomputePracticeDays();
    this.save();
    return { ok: true };
  }

  resetAll(): void {
    this.data = defaultData(this.now());
    this.save();
  }
}
