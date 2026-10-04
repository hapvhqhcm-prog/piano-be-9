import { POSITIONS, RH_FINGERING, LH_FINGERING, type Hand, type PositionId } from '../piano/fingering';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';
import type { Tune, TuneNote } from './tune';

/**
 * ĐỌC NHẠC NGẪU NHIÊN (Cấp 2–3, luyện tập mỗi ngày): sinh đoạn nhạc ngắn mới mỗi lần,
 * nằm trong một thế tay, chủ yếu đi bậc liền (dễ đọc), thỉnh thoảng nhảy quãng 3, kết thúc ở nốt chủ.
 * Hàm thuần — có test.
 */
export interface SightOptions {
  position: Exclude<PositionId, 'free'>;
  hand: Hand;
  measures?: number;
  /** 1 = chỉ nốt đen/trắng; 2 = thêm móc đơn & nốt trắng chấm; */
  rhythm?: 1 | 2;
  timeSignature?: '4/4' | '3/4';
}

function positionMap(pos: Exclude<PositionId, 'free'>, hand: Hand): Record<Pitch, number> {
  if (pos === 'C') return hand === 'RH' ? { ...RH_FINGERING } : { ...LH_FINGERING };
  const m = POSITIONS[pos][hand];
  if (!m) throw new Error(`Thế ${pos} không có tay ${hand}`);
  return { ...m };
}

const RHYTHMS_44: Record<1 | 2, number[][]> = {
  1: [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [2, 2], [1, 1, 1, 1]],
  2: [[1, 1, 1, 1], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 1, 1], [1.5, 0.5, 2], [2, 0.5, 0.5, 1]],
};
const RHYTHMS_34: Record<1 | 2, number[][]> = {
  1: [[1, 1, 1], [2, 1], [1, 2]],
  2: [[1, 1, 1], [2, 1], [0.5, 0.5, 1, 1], [1.5, 0.5, 1]],
};

export function makeSightTune(o: SightOptions, rng: () => number = Math.random, id = 'sight'): Tune {
  const map = positionMap(o.position, o.hand);
  const keys = Object.keys(map).sort((a, b) => pitchToMidi(a) - pitchToMidi(b));
  // Nốt chủ = nốt thấp nhất của thế (Đô, Sol, Rê, La…); thế Đô giữa tay trái: Đô giữa (cao nhất)
  const tonicIdx = o.position === 'MC' ? keys.length - 1 : 0;
  const measures = o.measures ?? 2;
  const ts = o.timeSignature ?? '4/4';
  const per = ts === '3/4' ? 3 : 4;
  const bank = ts === '3/4' ? RHYTHMS_34[o.rhythm ?? 1] : RHYTHMS_44[o.rhythm ?? 1];
  const notes: TuneNote[] = [];
  let idx = tonicIdx;
  for (let m = 0; m < measures; m++) {
    const last = m === measures - 1;
    const pattern = last ? [per === 3 ? 1 : 2, per === 3 ? 2 : 2] : bank[Math.floor(rng() * bank.length) % bank.length];
    pattern.forEach((beats, k) => {
      const isFinal = last && k === pattern.length - 1;
      if (isFinal) idx = tonicIdx;
      else if (!(m === 0 && k === 0)) {
        const r = rng();
        const step = r < 0.7 ? 1 : 2; // 70% bậc liền, 30% nhảy quãng 3
        const dir = idx === 0 ? 1 : idx === keys.length - 1 ? -1 : rng() < 0.5 ? -1 : 1;
        idx = Math.min(keys.length - 1, Math.max(0, idx + dir * step));
      }
      const pitch = keys[idx];
      notes.push({ pitch, beats, finger: map[pitch] });
    });
  }
  return {
    id,
    title: 'đoạn nhạc mới do app sinh ra',
    titleVi: 'Đọc nhạc',
    hand: o.hand,
    bpm: 60,
    timeSignature: ts,
    position: o.position,
    phrases: [0],
    notes,
  };
}

