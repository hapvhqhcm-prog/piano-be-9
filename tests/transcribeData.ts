import { layoutNotes, type OnsetEvent, type TimeSig } from '../src/music/transcribe';
import type { SolfegeNote } from '../src/music/solfege';
import { pitchToMidi } from '../src/piano/pitchTable';

/** Giai điệu mẫu + lần gõ tổng hợp cho test chép nhạc (tests/transcribe.test.ts, tests/transcribeSim.test.ts). */

export interface Melody {
  name: string;
  ts: TimeSig;
  pickupRest: number;
  /** "C4:1" = nốt Đô4 1 phách · "_:1" = lặng 1 phách */
  notes: string;
}

export const MELODIES: Melody[] = [
  {
    name: 'Ngôi sao nhỏ (4/4)',
    ts: '4/4',
    pickupRest: 0,
    notes: 'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2',
  },
  {
    name: 'Kìa con bướm vàng (móc đơn)',
    ts: '4/4',
    pickupRest: 0,
    notes: 'C4:1 D4:1 E4:1 C4:1 C4:1 D4:1 E4:1 C4:1 E4:1 F4:1 G4:2 E4:1 F4:1 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 C4:1 G3:1 C4:2',
  },
  {
    name: 'Ode to Joy (đen chấm + móc đơn)',
    ts: '4/4',
    pickupRest: 0,
    notes: 'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2 E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2',
  },
  {
    name: 'Valse 3/4 lấy đà 1 phách (trắng chấm)',
    ts: '3/4',
    pickupRest: 2,
    notes: 'G4:1 C5:2 E4:1 G4:2 C5:1 D5:3 B4:2 G4:1 C5:2 A4:1 G4:3',
  },
  {
    name: 'Hành khúc 2/4 lấy đà ½ phách',
    ts: '2/4',
    pickupRest: 1.5,
    notes: 'G4:0.5 C5:1 C5:1 E5:1 C5:1 D5:1 B4:1 C5:2 G4:1 G4:0.5 A4:0.5 B4:1 G4:1 C5:2',
  },
  {
    name: 'Có dấu lặng (nhả phím)',
    ts: '4/4',
    pickupRest: 0,
    notes: 'C4:1 E4:1 G4:1 _:1 G4:1 E4:1 C4:1 _:1 D4:1 F4:1 A4:2 G4:1 _:1 C5:2',
  },
  {
    name: 'Tròn + trắng chấm (4/4)',
    ts: '4/4',
    pickupRest: 0,
    notes: 'C4:4 E4:3 D4:1 C4:2 G4:2 C5:4',
  },
];

export function parseMelody(m: Melody): Array<{ midi?: number; beats: number }> {
  return m.notes.split(/\s+/).map((tok) => {
    const [p, b] = tok.split(':');
    return p === '_' ? { beats: Number(b) } : { midi: pitchToMidi(p), beats: Number(b) };
  });
}

/** Giai điệu → nốt trình soạn mong đợi (nốt cuối ngân tới hết ô, như app giả định). */
export function expectedLayout(m: Melody): SolfegeNote[] {
  const items = parseMelody(m);
  return layoutNotes(
    items.map((x) => (x.midi === undefined ? { rest: true, beats: x.beats } : { midi: x.midi, beats: x.beats })),
    m.pickupRest,
    Number(m.ts[0]),
  );
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Lần gõ tổng hợp: lệch tay đều ±jitter, tốc độ trôi `drift` (vd 0,1 = chậm dần 10 % tới cuối bài). */
export function synthEvents(m: Melody, bpm: number, o: { jitter?: number; seed?: number; drift?: number; start?: number } = {}): OnsetEvent[] {
  const r = rng(o.seed ?? 1);
  const items = parseMelody(m);
  const total = items.reduce((s, x) => s + x.beats, 0);
  const spb = 60 / bpm;
  const jit = o.jitter ?? 0.04;
  const start = o.start ?? 1;
  // Thời gian của phách b (có trôi tốc độ): tích phân của spb·(1 + drift·b/total)
  const tAt = (b: number) => start + spb * (b + ((o.drift ?? 0) * b * b) / (2 * total));
  const out: OnsetEvent[] = [];
  let b = m.pickupRest;
  items.forEach((x, i) => {
    if (x.midi !== undefined) {
      const t = tAt(b) + (r() * 2 - 1) * jit;
      const next = items[i + 1];
      const e: OnsetEvent = { t, midi: x.midi };
      // Nốt trước dấu lặng: nhả phím rõ (gần cuối trường độ của nốt)
      if (next && next.midi === undefined) e.off = tAt(b + x.beats) - 0.08 + (r() * 2 - 1) * 0.03;
      out.push(e);
    }
    b += x.beats;
  });
  return out;
}
