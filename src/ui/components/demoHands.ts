/**
 * 🎬 "BÀN TAY MẪU ĐÀN CẢ BÀI" (+ 2026-10-15): khi bé bấm "Xem mẫu" (và thầy đàn mẫu ở màn Từng nốt…), chính BÀN TAY MỜ
 * trên bàn phím (keyboardHand.ts) đàn bài như một video thầy dạy — đúng NGÓN nhấn đúng PHÍM ngay lúc nốt kêu.
 *
 * ── LỊCH HÌNH (hàm thuần — có test) ──────────────────────────────────────────────────────────────────────────────────
 * demoSchedule() suy ra TỪ CHÍNH kế hoạch tiếng (soundPlan trong demo.ts) — cùng giờ AudioContext → hình không trôi:
 * - mỗi nốt → một lần NHẤN (ngón dìm xuống, phím lún, mu bàn tay hơi dồn sức nặng cánh tay) đúng `when` của nốt đó;
 * - NHẢ: theo độ dài giữ phím (key): ngắt tiếng (staccato) nhấc sớm + nảy nhẹ; luyến (legato) giữ tới khi nốt sau đã
 *   kêu thêm LEGATO_OVERLAP_S (hai phím chồng nhau một chút); nốt lặp cùng ngón luôn nhấc trước nốt sau;
 * - ĐỔI THẾ / luồn ngón cái / vắt ngón: tay bắt đầu đi trước ANTICIPATE_S (≤ nửa khoảng cách hai nốt) để tới nơi đúng lúc
 *   nốt kêu; luồn / vắt: ngón luồn đi trước, cả bàn tay theo sau ngay lúc nốt kêu (follow);
 * - pedal (Cấp 4): chân đạp / nhả đúng các mốc pedal của kế hoạch tiếng.
 *
 * ── CHẠY ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * DemoHands.tick(t) được vòng requestAnimationFrame DUY NHẤT của playDemo gọi với t = giờ AudioContext − độ trễ ra loa
 * (+ một khung hình) → chạy mọi "cue" đã tới giờ (chậm thì đuổi kịp). Chỉ đổi class / transform (GPU).
 * Giảm chuyển động (prefers-reduced-motion): CSS bỏ dìm ngón / trượt — chỉ còn ngón + phím sáng.
 * stop(): nhả mọi phím, tắt chân pedal, trả bàn tay mờ về chế độ thường.
 */
import { framesForSequence, type Crossing, type FingerNote, type HandFrame } from './keyboardHand';
import { KeyboardHand } from './keyboardHand';
import type { Hand } from '../../piano/fingering';
import type { PianoKeyboard } from '../../piano/PianoKeyboard';
import { pitchToMidi, type Pitch } from '../../piano/pitchTable';
import type { DemoEvent, PlannedNote } from './demo';

/** Tay đi trước nốt đổi thế (giây) — tối đa; nốt dày thì ≤ nửa khoảng cách hai nốt */
export const ANTICIPATE_S = 0.15;
/** Luyến: phím trước còn giữ sau khi nốt sau đã kêu (giây) */
export const LEGATO_OVERLAP_S = 0.05;
/** Nhấn ngắn nhất vẫn nhìn thấy (giây) */
export const MIN_PRESS_S = 0.09;
/** Nốt lặp cùng ngón: nhấc trước nốt sau ít nhất (giây) */
export const REPEAT_LIFT_S = 0.03;
/** Luồn / vắt ngón: cả bàn tay theo sau trong (giây) */
export const FOLLOW_S = 0.28;

export interface PressCue {
  hand: Hand;
  /** 0 = nốt không ghi ngón (chỉ phím sáng) */
  finger: number;
  pitch: Pitch;
  midi: number;
  on: number;
  off: number;
  stac: boolean;
  legato: boolean;
  /** chỉ số sự kiện (nhóm nốt) */
  ev: number;
}

export interface MoveCue {
  hand: Hand;
  /** Bắt đầu đi (giây) */
  at: number;
  /** Thời gian đi (giây) — tới nơi đúng lúc nốt kêu */
  dur: number;
  frame: HandFrame;
  cross: Crossing;
  /** Ngón luồn / vắt (ngón đàn nốt đổi thế) */
  finger: number;
  /** Lúc cả bàn tay theo sau (= lúc nốt kêu) */
  follow: number;
}

export interface DemoSchedule {
  presses: PressCue[];
  moves: MoveCue[];
  /** [đạp, nhả] (giây) — đúng như kế hoạch tiếng */
  pedals: Array<[number, number]>;
  captions: Array<{ at: number; text: string; ev: number }>;
  /** Thế tay lúc bắt đầu (đặt sẵn, không trượt) */
  start: Partial<Record<Hand, HandFrame>>;
  end: number;
}

const sameFrame = (a: HandFrame, b: HandFrame) => a.every((m, i) => m === b[i]);

/**
 * Lịch hình của bài mẫu từ kế hoạch tiếng `plan` (soundPlan(events, spb, t0, pedal)) — cùng thứ tự nốt.
 */
export function demoSchedule(
  events: DemoEvent[],
  plan: { notes: ReadonlyArray<Pick<PlannedNote, 'when'>>; pedals: ReadonlyArray<readonly [number, number]> },
  spb: number,
): DemoSchedule {
  const presses: PressCue[] = [];
  const captions: DemoSchedule['captions'] = [];
  const evOn: number[] = [];
  let k = 0;
  let end = 0;
  events.forEach((ev, i) => {
    const on = plan.notes[k]?.when ?? 0;
    evOn.push(on);
    if (ev.caption) captions.push({ at: on, text: ev.caption, ev: i });
    for (const n of ev.notes) {
      const when = plan.notes[k++]?.when ?? on;
      let midi: number;
      try {
        midi = pitchToMidi(n.pitch);
      } catch {
        continue;
      }
      const key = n.key ?? Math.min(ev.dur * 0.9, n.len ?? ev.dur);
      const stac = !!n.stac;
      presses.push({
        hand: n.hand,
        finger: n.finger && n.finger >= 1 && n.finger <= 5 ? n.finger : 0,
        pitch: n.pitch,
        midi,
        on: when,
        off: when + Math.max(MIN_PRESS_S, key * spb),
        stac,
        legato: !stac && key >= ev.dur - 1e-9,
        ev: i,
      });
    }
    end = Math.max(end, on + ev.dur * spb);
  });
  // Nhả phím: luyến chồng nhẹ lên nốt sau; nốt lặp cùng ngón / cùng phím nhấc trước nốt sau
  for (const hand of ['RH', 'LH'] as const) {
    const ps = presses.filter((p) => p.hand === hand);
    for (const p of ps) {
      const after = ps.filter((q) => q.on > p.on + 1e-6);
      const nextOn = after.length ? Math.min(...after.map((q) => q.on)) : Infinity;
      if (p.legato && nextOn <= p.off + 1e-6) p.off = nextOn + LEGATO_OVERLAP_S;
      const clash = after.find((q) => (p.finger && q.finger === p.finger) || q.midi === p.midi);
      if (clash && p.off > clash.on - REPEAT_LIFT_S) p.off = Math.max(p.on + 0.05, clash.on - REPEAT_LIFT_S);
    }
  }
  // Thế tay từng tay (dùng chung cách chia thế của bàn tay mờ)
  const moves: MoveCue[] = [];
  const start: DemoSchedule['start'] = {};
  for (const hand of ['RH', 'LH'] as const) {
    const groups: FingerNote[][] = [];
    const times: number[] = [];
    events.forEach((_ev, i) => {
      const ns = presses.filter((p) => p.ev === i && p.hand === hand && p.finger);
      if (!ns.length) return;
      groups.push(ns.map((p) => ({ midi: p.midi, finger: p.finger, pitch: p.pitch })));
      times.push(evOn[i]);
    });
    if (!groups.length) continue;
    const fr = framesForSequence(groups, hand);
    let prev: HandFrame | null = null;
    let prevT = -Infinity;
    fr.forEach((f, j) => {
      if (!f.frame) return;
      if (!prev) start[hand] = f.frame;
      else if (!sameFrame(prev, f.frame)) {
        const t = times[j];
        const antic = Math.min(ANTICIPATE_S, Math.max(0, (t - prevT) * 0.5));
        moves.push({ hand, at: t - antic, dur: antic, frame: f.frame, cross: f.cross, finger: groups[j][0].finger, follow: t });
      }
      prev = f.frame;
      prevT = times[j];
    });
  }
  moves.sort((a, b) => a.at - b.at);
  const pedals = plan.pedals.map(([a, b]): [number, number] => [a, b]);
  for (const p of presses) end = Math.max(end, p.off);
  for (const [, b] of pedals) end = Math.max(end, b);
  return { presses, moves, pedals, captions, start, end };
}

// ======================================================================================================================
// Chạy lịch hình
// ======================================================================================================================

/** Phần bàn tay mờ mà DemoHands điều khiển (KeyboardHand — tách ra để test không cần DOM). */
export interface DemoHandTarget {
  demoBegin(start: Partial<Record<Hand, HandFrame>>, pedal: boolean): void;
  demoMove(hand: Hand, frame: HandFrame, cross: Crossing, durS: number, finger: number): void;
  demoFollow(hand: Hand): void;
  demoKey(hand: Hand, finger: number, down: boolean, stac: boolean): void;
  demoPedal(down: boolean): void;
  demoEnd(): void;
}

interface Cue {
  t: number;
  /** thứ tự khi cùng lúc: nhả → đi → theo → nhấn → phụ đề */
  o: number;
  run: () => void;
}

export interface DemoHandsOptions {
  onCaption?: (text: string, ev: DemoEvent) => void;
}

export class DemoHands {
  private cues: Cue[] = [];
  private i = 0;
  private lit = new Map<number, number>();
  private held = new Set<PressCue>();
  private pedalDown = false;
  private stopped = false;

  constructor(
    private readonly kb: Pick<PianoKeyboard, 'flash'>,
    private readonly hand: DemoHandTarget | null,
    readonly schedule: DemoSchedule,
    events: DemoEvent[],
    o: DemoHandsOptions = {},
  ) {
    const s = schedule;
    const add = (t: number, ord: number, run: () => void) => this.cues.push({ t, o: ord, run });
    for (const p of s.presses) {
      add(p.on, 3, () => this.press(p, true));
      add(p.off, 0, () => this.press(p, false));
    }
    for (const m of s.moves) {
      add(m.at, 1, () => this.hand?.demoMove(m.hand, m.frame, m.cross, m.dur, m.finger));
      if (m.cross) add(m.follow, 2, () => this.hand?.demoFollow(m.hand));
    }
    for (const [a, b] of s.pedals) {
      add(a, 3, () => this.pedal(true));
      add(b, 0, () => this.pedal(false));
    }
    for (const c of s.captions) add(c.at, 4, () => o.onCaption?.(c.text, events[c.ev]));
    this.cues.sort((a, b) => a.t - b.t || a.o - b.o);
    this.hand?.demoBegin(s.start, s.pedals.length > 0);
  }

  /** Chạy mọi cue tới giờ `t` (giây, đồng hồ AudioContext). */
  tick(t: number): void {
    if (this.stopped) return;
    while (this.i < this.cues.length && this.cues[this.i].t <= t) this.cues[this.i++].run();
  }

  get finished(): boolean {
    return this.i >= this.cues.length;
  }

  private press(p: PressCue, down: boolean): void {
    if (down) this.held.add(p);
    else if (!this.held.delete(p)) return;
    const n = (this.lit.get(p.midi) ?? 0) + (down ? 1 : -1);
    this.lit.set(p.midi, Math.max(0, n));
    if (down ? n === 1 : n <= 0) this.kb.flash(p.pitch, down);
    if (p.finger) this.hand?.demoKey(p.hand, p.finger, down, p.stac);
  }

  private pedal(down: boolean): void {
    this.pedalDown = down;
    this.hand?.demoPedal(down);
  }

  /** Dừng: nhả mọi phím, nhấc chân pedal, bàn tay mờ về chế độ thường. Gọi nhiều lần không sao. */
  stop(): void {
    if (this.stopped) return;
    for (const p of [...this.held]) this.press(p, false);
    if (this.pedalDown) this.pedal(false);
    this.stopped = true;
    this.hand?.demoEnd();
  }
}

/** Bắt đầu bàn tay mẫu trên bàn phím `kb` (dùng bàn tay mờ của màn, không có thì tạo một bàn tay chỉ dùng cho mẫu). */
export function startDemoHands(
  kb: PianoKeyboard,
  events: DemoEvent[],
  plan: Parameters<typeof demoSchedule>[1],
  spb: number,
  o: DemoHandsOptions = {},
): DemoHands {
  return new DemoHands(kb, KeyboardHand.of(kb), demoSchedule(events, plan, spb), events, o);
}
