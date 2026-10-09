/**
 * Màn bài hát — TRẠNG THÁI DÙNG CHUNG (SongCtx) + các hàm nhỏ mọi phần đều cần (nhóm nốt, tay, thanh nút, ghi lượt…).
 * song.ts dựng `SongCtx` một lần cho mỗi lần mở màn; songWait / songTempo / songResult / songFocus đọc + ghi qua nó.
 * Không import các phần khác của màn bài hát (tránh vòng import) — gọi chéo qua `c.act`.
 */
import type { HandNoteResult, TwoHandRun } from '../../music/handGrade';
import { tallyHands } from '../../music/handGrade';
import type { HandsSpec } from '../../audio/twoHand';
import { TWO_HAND_DEFAULT } from '../../audio/twoHand';
import { pulseDropWindow, type TIMING_WINDOWS } from '../../music/timing';
import {
  DYN_VOLUME,
  accompaniment,
  beatsPerMeasure,
  dynAtBeat,
  handOnsets,
  otherHandNotes,
  pitchesOf,
  slice,
  totalBeats,
  type Onset,
  type Tune,
} from '../../music/tune';
import type { RunReview, TeacherPoint, WaitLog, FocusStep } from '../../music/teacher';
import type { Hand } from '../../piano/fingering';
import type { PianoKeyboard, KeyTarget } from '../../piano/PianoKeyboard';
import { midiToFreq, pitchToMidi } from '../../piano/pitchTable';
import type { SongRun } from '../../progress/schema';
import type { App } from '../App';
import { h } from '../components/dom';
import { StaffView } from '../components/staffView';
import type { HandOverlay } from '../components/demo';
import type { MicHonestyWatch } from '../components/micHonesty';
import type { SongHead } from './songHead';
import type { TakeReplay } from './songTake';
import { LOOP_TARGET, type HandSel, type SongOptions } from './songShared';

export interface SongHooks {
  onRun(run: Omit<SongRun, 'ts'>): void;
  onDone(): void;
  onBack(): void;
}

export type State = 'idle' | 'demo' | 'countin' | 'playing' | 'rate' | 'result';

/** (+ 2026-10-09) Màn kết quả của lượt chính — để "🎯 Luyện ngay chỗ này" quay về đúng chỗ */
export interface ResultBack {
  s: number;
  text: string;
  mode: SongOptions['mode'];
  phrase: [number, number] | null;
  bpm: number;
  review: RunReview;
  point: TeacherPoint;
}
/** (+ 2026-10-09) "🎯 Luyện ngay chỗ này": chậm trước, rồi đúng tốc độ (teacher.focusPlan), xong quay về kết quả */
export interface FocusRun {
  steps: FocusStep[];
  i: number;
  /** Chỗ luyện (ô nhịp CẢ BÀI) và tên gọi ("Câu 2", "Ô 5–6") */
  range: [number, number];
  place: string;
  back: ResultBack;
  /** Lời nhắn nhỏ giữa hai bước ("✓ Xong lượt chậm!") */
  note: string;
  /** Lượt đàn gần nhất có sạch không (null = không biết — micro tắt) */
  clean: boolean | null;
}

/** Các thao tác "gốc" của màn (song.ts / songFocus.ts định nghĩa) — các phần khác gọi qua đây để không vòng import */
export interface SongActions {
  reset(): void;
  start(): Promise<void>;
  demo(after?: () => void): Promise<void>;
  /** v5.1 — "🔁 Lặp câu khó" */
  openHard(range: [number, number]): void;
  /** "🎯 Luyện ngay chỗ này" */
  startFocus(back: ResultBack, local: [number, number], place: string): void;
}

/** Trạng thái của MỘT lần mở màn bài hát (song.ts dựng) */
export interface SongCtx {
  readonly app: App;
  readonly full: Tune;
  readonly opts: SongOptions;
  readonly hooks: SongHooks;
  readonly settings: App['store']['settings'];
  /** Độ khắt khe chấm nhịp (Cài đặt → mặc định "dễ") */
  readonly win: (typeof TIMING_WINDOWS)[keyof typeof TIMING_WINDOWS];
  /** Tập tách tay — chỉ bài hai tay (có bè lh) */
  readonly twoHand: boolean;
  /** Bài MỚI (chưa chơi lượt nào): nhắc hát tên nốt theo thầy khi xem mẫu */
  readonly firstTime: boolean;
  readonly kb: PianoKeyboard;
  readonly overlay: HandOverlay;
  readonly head: SongHead;
  readonly staffBox: HTMLElement;
  readonly status: HTMLElement;
  readonly bar: HTMLElement;
  readonly take: TakeReplay;
  readonly honesty: MicHonestyWatch;
  readonly act: SongActions;

  mode: SongOptions['mode'];
  hints: SongOptions['hints'];
  level: 2 | 3;
  bpm: number;
  phrase: [number, number] | null;
  handSel: HandSel;
  /** "Lặp câu này 3 lần đúng liên tiếp" (chế độ chờ, đang chọn một câu) */
  loop3: boolean;
  streak: number;
  /** v5.1 — Đang lặp "câu khó" (mở từ màn kết quả): nhớ cách chơi / câu cũ để quay về cả bài */
  hardBack: { mode: SongOptions['mode']; phrase: [number, number] | null; range: [number, number] } | null;
  /** v5.1 — Số lỗi theo ô nhịp của lượt đang chơi (chờ: đàn sai; theo nhịp: nốt trượt) */
  readonly missByMeasure: Map<number, number>;
  /**
   * (+ 2026-10-09) NHẬN XÉT KIỂU THẦY GIÁO (src/music/teacher.ts): sổ ghi từng nhóm nốt của lượt "Từng nốt" đang chơi,
   * nhận xét từng nốt của lượt vừa xong (chỉ trong bộ nhớ — không lưu), lời nhắn của lượt trước (khen "tiến bộ").
   */
  wLog: WaitLog[];
  /**
   * (+ 2026-10-09) CHẤM HAI TAY BẰNG MICRO (src/audio/twoHand.ts, OWNER duyệt): kết quả từng tay, từng nhóm của lượt
   * vừa chơi (null = lượt không chấm hai tay). Màn kết quả / nhận xét đọc được ở đây; SongRun.hands lưu bản tổng hợp.
   */
  lastHands: TwoHandRun | null;
  /** Chế độ chờ: kết quả từng tay ở lần đàn ĐẦU của mỗi nhóm hai tay (chỉ số = chỉ số nhóm) */
  wHands: HandNoteResult[][];
  review: RunReview | null;
  lastPoint: { key: string; point: TeacherPoint } | null;
  /** 🎯 Đang "Luyện ngay chỗ này" (mở từ màn kết quả): các bước, bước hiện tại, màn kết quả để quay về */
  focus: FocusRun | null;
  tune: Tune;
  state: State;
  token: number;
  /** Lượt theo nhịp vừa chơi có thử thách "máy im" không (cho lời khen khi bố mẹ chấm) */
  lastDrop: [number, number] | null;
  raf: number;
  disposed: boolean;
  staff: StaffView;
  /** Bỏ nghe micro của lượt "theo nhịp" đang chạy (gọi khi dừng / rời màn) */
  unTempo: () => void;
  /** (+ 2026-10-09) Lượt "theo nhịp" đang chạy: nốt đơn quanh phách của lần gõ — cho micro tự học lệch dây */
  tempoExpect: ((at: number) => number[]) | null;
  /**
   * (+ 2026-10-08) MICRO NÓI THẬT (chế độ chờ): bé có vẻ đang đàn mà micro không nhận ra nốt nào 3 lần liền →
   * "Micro nghe chưa rõ — không phải lỗi của con" + "👪 Bố mẹ chấm giúp" (cả lượt này chuyển sang bố mẹ chấm).
   */
  parentRun: boolean;
  demoRun: { cancel: () => void; done: Promise<void> } | null;
  /** Ghi nhớ nhóm nốt theo (bài, tay): follow() gọi mỗi khung hình — không dựng lại cả dòng thời gian mỗi lần */
  gMemo: { tune: Tune; hand: Hand | null; gs: Onset[] } | null;
  /** Nhóm nốt đang sáng trên phím (follow() gọi mỗi khung hình → chỉ vẽ lại phím khi đổi nhóm) */
  litOnset: Onset | undefined | null;

  // ----- Từng nốt (chờ) -----
  wIdx: number;
  wHits: number;
  wWrongThis: number;
  /** Số lần đàn sai trong cả lượt (micro nghe sai / chạm sai phím ảo) — cho "Lặp 3 lần đúng" */
  wWrongPass: number;
  /** (+ 2026-10-09) Số lần liền micro chưa nghe đủ hai tay ở nhóm đang chờ (≥ 3 → nút "👪 Bố mẹ: tiếp" nổi bật) */
  wHandFails: number;
  /** Nốt micro nghe được gần nhất ở nhóm hai tay (dự phòng: kiểm tra hai tay không kết luận được → cách cũ) */
  lastHeard: { midi: number; at: number } | null;
  /** Lần gõ đã hỏi kiểm tra hai tay (lần gõ + nốt nghe được của cùng lần gõ → chỉ hỏi một lần) */
  handsAskedAt: number;
  /** Lần gõ phím đã hỏi kiểm tra hợp âm — một lần gõ có thể cho nhiều nốt nghe được */
  chordAskedAt: number;
}

// ---------------- Hàm thuần: nhóm nốt / hai tay ----------------

/** Nhóm có cả hai tay đàn cùng lúc */
export const together = (g: Onset): boolean => g.notes.some((n) => n.hand === 'RH') && g.notes.some((n) => n.hand === 'LH');
export const handMidis = (g: Onset, hand: Hand): number[] => g.notes.filter((n) => n.hand === hand).flatMap(pitchesOf).map(pitchToMidi);
export const handSpec = (g: Onset): HandsSpec => ({ RH: handMidis(g, 'RH'), LH: handMidis(g, 'LH') });
export const handParts = (g: Onset) =>
  (['RH', 'LH'] as const)
    .map((hand) => ({ hand, midis: handMidis(g, hand), indices: g.notes.filter((n) => n.hand === hand).map((n) => n.index) }))
    .filter((p) => p.midis.length);
/** Kết quả một nhóm, mọi tay cùng một kết luận (nhóm một tay / bố mẹ bấm "tiếp") */
export const sameVerdict = (g: Onset, verdict: HandNoteResult['verdict'], offset?: number): HandNoteResult[] =>
  handParts(g).map((p) => ({ ...p, beat: g.start, measure: g.notes[0].measure, together: together(g), verdict, ...(offset !== undefined ? { offset } : {}) }));
export const handsRun = (m: 'wait' | 'tempo', notes: HandNoteResult[]): TwoHandRun => ({ mode: m, notes, ...tallyHands(notes) });
export const handsLine = (r: TwoHandRun): string => ` · 🫱 tay phải ${r.RH.hits}/${r.RH.total} · 🫲 tay trái ${r.LH.hits}/${r.LH.total}`;
/** Nhóm đang ở phách `beat` (nhóm cuối cùng đã bắt đầu, dung sai 0,05 phách) */
export const groupAt = (gs: Onset[], beat: number): Onset | undefined => {
  let cur: Onset | undefined;
  for (const g of gs) if (g.start <= beat + 0.05) cur = g;
  return cur;
};

// ---------------- Hàm theo trạng thái màn ----------------

export const micOn = (c: SongCtx): boolean => c.app.mic.state === 'on';
/** Tay đang tập riêng (null = hai tay) */
export const solo = (c: SongCtx): Hand | null => (c.twoHand && c.handSel !== 'BOTH' ? c.handSel : null);
/** (+ 2026-10-09) Micro chấm RIÊNG từng tay: bài hai tay, đàn cả hai tay, micro bật, Cài đặt cho phép (thử nghiệm) */
export const handsOn = (c: SongCtx): boolean =>
  c.twoHand && !solo(c) && micOn(c) && (c.app.store.settings.micTwoHand ?? TWO_HAND_DEFAULT);
export const setBar = (c: SongCtx, ...b: (HTMLElement | null | false)[]) => c.bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));
export const addMiss = (c: SongCtx, o: Onset | undefined) => {
  if (!o) return;
  const m = o.notes[0].measure;
  c.missByMeasure.set(m, (c.missByMeasure.get(m) ?? 0) + 1);
};

/**
 * (OWNER duyệt 2026-10-08) GIỮ NHỊP TRONG ĐẦU — chỉ theo nhịp, không ở sân khấu: bài học bật cờ `pulseDrop`, hoặc
 * từ tuần 5 bài đã có lượt theo nhịp ĐẠT (cả bài, hai tay) → các lượt sau máy gõ nhịp im 2 ô giữa bài.
 */
const pulseOn = (c: SongCtx): boolean => {
  if (c.mode !== 'tempo' || c.opts.stage) return false;
  if (c.opts.pulseDrop) return true;
  const d = c.app.store.get();
  if (d.progress.currentWeek < 5) return false;
  return d.sessions.some((x) => x.songRuns.some((r) => r.songId === c.full.id && r.mode === 'tempo' && r.passed && !r.phrase && !r.hand));
};
/** Khoảng phách máy im của bài/câu đang mở (null = không thử: tắt, hoặc bài quá ngắn) */
export const pulseWindow = (c: SongCtx): [number, number] | null =>
  pulseOn(c) ? pulseDropWindow(totalBeats(c.tune), beatsPerMeasure(c.tune)) : null;

/** Nhóm nốt BÉ phải đàn: tập tách tay → chỉ nốt của tay đó (nhóm không còn nốt nào thì bỏ). */
export const groups = (c: SongCtx): Onset[] => {
  const hand = solo(c);
  if (!c.gMemo || c.gMemo.tune !== c.tune || c.gMemo.hand !== hand) c.gMemo = { tune: c.tune, hand, gs: handOnsets(c.tune, hand) };
  return c.gMemo.gs;
};

export function buildStaff(c: SongCtx, pageMode = false): void {
  c.tune = c.phrase ? slice(c.full, c.phrase[0], c.phrase[1]) : c.full;
  c.staff = new StaffView(c.tune, {
    names: c.hints !== 'staff',
    fingers: c.hints === 'full',
    // Màn kết quả có nhận xét từng nốt: luôn từng trang (lật trang xem lại cả bài), kể cả sau băng chuyền
    mode: c.mode === 'tempo' && c.level === 3 && !pageMode ? 'scroll' : 'page',
    // Tập tách tay: bè kia vẽ mờ (app đàn thay)
    dimHand: solo(c) ? (solo(c) === 'RH' ? 'LH' : 'RH') : null,
  });
  c.staffBox.replaceChildren(c.staff.el);
}

/** Tập tách tay: app đàn khẽ nốt tay KIA bắt đầu trong [fromBeat, toBeat) — chỉ khi micro tắt */
export function playOther(c: SongCtx, fromBeat: number, toBeat: number, t0: number, spb: number, mute: [number, number] | null = null): void {
  if (micOn(c)) return; // micro bật: tiếng app đàn sẽ lẫn vào tiếng bé
  for (const n of otherHandNotes(c.tune, solo(c))) {
    if (n.start < fromBeat - 1e-6 || n.start >= toBeat - 1e-6) continue;
    if (mute && n.start >= mute[0] - 1e-6 && n.start < mute[1] - 1e-6) continue; // máy im: tay kia cũng nghỉ
    for (const p of pitchesOf(n)) {
      void c.app.audio.scheduleFreq(midiToFreq(pitchToMidi(p)), t0 + (n.start - fromBeat) * spb, n.beats * spb * 0.9, 0.35, false);
    }
  }
}

export function lightOnset(c: SongCtx, o: Onset | undefined, force = false): void {
  c.litOnset = o;
  c.kb.setTargets([]);
  if (!o || (c.hints !== 'full' && !force)) return;
  const ts: KeyTarget[] = [];
  for (const n of o.notes) {
    ts.push({ pitch: n.pitch!, finger: n.finger, hand: n.hand });
    for (const a of n.also ?? []) ts.push({ pitch: a.pitch, finger: a.finger, hand: n.hand });
  }
  c.kb.setTargets(ts);
}

/** Dừng mọi thứ đang chạy (lượt chơi, mẫu, nhạc) — dùng khi dựng lại màn và khi rời màn. */
export function halt(c: SongCtx): void {
  c.token++;
  cancelAnimationFrame(c.raf);
  c.unTempo();
  c.demoRun?.cancel();
  c.demoRun = null;
}

export function scheduleAccomp(c: SongCtx, t0: number, spb: number, mute: [number, number] | null = null): void {
  if (!c.settings.accompaniment || micOn(c)) return;
  for (const a of accompaniment(c.tune)) {
    // Giữ nhịp trong đầu: 2 ô máy im thì nhạc đệm cũng im (nhạc đệm cũng "gõ nhịp" hộ bé)
    if (mute && a.start >= mute[0] - 1e-6 && a.start < mute[1] - 1e-6) continue;
    // v4: bè đệm to/nhỏ theo sắc thái của giai điệu (mf = như cũ)
    const d = dynAtBeat(c.tune, a.start);
    const vol = 0.45 * (d ? DYN_VOLUME[d] / DYN_VOLUME.mf : 1);
    void c.app.audio.scheduleFreq(midiToFreq(a.midi), t0 + a.start * spb, a.beats * spb * 0.9, vol, false);
  }
}

/** Ghi một lượt (SongRun) qua hooks.onRun */
export function record(c: SongCtx, r: Pick<SongRun, 'mode' | 'total' | 'hits' | 'source' | 'passed' | 'checklist'>): void {
  const sh = solo(c);
  // (+ 2026-10-09) Micro chấm hai tay → lưu thêm số nốt đúng của từng tay (trường tùy chọn)
  const hs = r.source === 'mic' && c.lastHands ? { hands: { RH: c.lastHands.RH, LH: c.lastHands.LH } } : {};
  c.hooks.onRun({ songId: c.full.id, ...r, level: r.mode === 'tempo' ? c.level : undefined, bpm: c.bpm, hints: c.hints, phrase: c.phrase, ...(sh ? { hand: sh } : {}), ...hs });
}

export const streakDots = (c: SongCtx) =>
  h(
    'span',
    { class: 'loop-dots', 'aria-label': `${c.streak}/${LOOP_TARGET}` },
    '🔁 ',
    '●'.repeat(c.streak),
    h('span', { class: 'loop-off' }, '○'.repeat(Math.max(0, LOOP_TARGET - c.streak))),
  );
