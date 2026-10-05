import { POSITIONS, RH_FINGERING, LH_FINGERING, type Hand, type PositionId } from '../piano/fingering';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';
import type { Tune, TuneNote } from './tune';

/**
 * ĐỌC NHẠC NGẪU NHIÊN (Cấp 2–3, luyện tập mỗi ngày): sinh đoạn nhạc ngắn mới mỗi lần,
 * nằm trong một thế tay, chủ yếu đi bậc liền (dễ đọc), thỉnh thoảng nhảy quãng 3, kết thúc ở nốt chủ.
 * v5 (OWNER duyệt 2026-10-05 — chuyên gia: đọc nhạc quá "theo vị trí"): nốt ĐẦU có thể là bất kỳ nốt nào của thế tay
 * (không luôn là nốt chủ), và ở Cấp 2–3 thỉnh thoảng có bước nhảy quãng 4/5 — bé phải đọc QUÃNG, không đoán theo thói quen.
 * Hàm thuần, xác định theo rng — có test.
 */
export interface SightOptions {
  position: Exclude<PositionId, 'free'>;
  hand: Hand;
  measures?: number;
  /** 1 = chỉ nốt đen/trắng; 2 = thêm móc đơn & nốt trắng chấm; */
  rhythm?: 1 | 2;
  timeSignature?: '4/4' | '3/4' | '2/4';
  /**
   * v5: bắt đầu ở nốt bất kỳ của thế tay (mặc định CÓ — mọi hoạt động đọc nhạc đều từ Cấp 2).
   * false = luôn bắt đầu ở nốt chủ (như trước).
   */
  startAnywhere?: boolean;
  /**
   * v5: quãng nhảy lớn nhất (2 = chỉ bậc liền, 3 = thêm quãng 3, 4/5 = thỉnh thoảng nhảy quãng 4/5).
   * Mặc định: rhythm 2 (Cấp 2 cuối – Cấp 3) → 5; còn lại → 3.
   */
  maxInterval?: 2 | 3 | 4 | 5;
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
const RHYTHMS_24: Record<1 | 2, number[][]> = {
  1: [[1, 1], [2], [1, 1]],
  2: [[1, 1], [0.5, 0.5, 1], [1, 0.5, 0.5], [1.5, 0.5]],
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
  const per = Number(ts.split('/')[0]);
  const bank = (per === 3 ? RHYTHMS_34 : per === 2 ? RHYTHMS_24 : RHYTHMS_44)[o.rhythm ?? 1];
  const notes: TuneNote[] = [];
  const maxInt = o.maxInterval ?? ((o.rhythm ?? 1) === 2 ? 5 : 3);
  // Nốt đầu: bất kỳ nốt nào của thế tay (v5) — rng gọi MỘT lần ở đây để chuỗi số ngẫu nhiên xác định
  let idx = o.startAnywhere === false ? tonicIdx : Math.floor(rng() * keys.length) % keys.length;
  for (let m = 0; m < measures; m++) {
    const last = m === measures - 1;
    const pattern = last ? (per === 2 ? [2] : [per === 3 ? 1 : 2, 2]) : bank[Math.floor(rng() * bank.length) % bank.length];
    pattern.forEach((beats, k) => {
      const isFinal = last && k === pattern.length - 1;
      if (isFinal) idx = tonicIdx;
      else if (!(m === 0 && k === 0)) {
        const r = rng();
        // 70% bậc liền, 30% nhảy quãng 3; khi cho phép quãng 4/5: 60% bậc · 25% quãng 3 · 15% quãng 4–5
        let step = maxInt <= 2 ? 1 : maxInt === 3 ? (r < 0.7 ? 1 : 2) : r < 0.6 ? 1 : r < 0.85 ? 2 : Math.min(maxInt - 1, r < 0.93 ? 3 : 4);
        step = Math.min(step, keys.length - 1);
        let dir = idx === 0 ? 1 : idx === keys.length - 1 ? -1 : rng() < 0.5 ? -1 : 1;
        // Nhảy ra ngoài thế tay → nhảy chiều ngược lại; không đủ chỗ cả hai chiều → bước nhỏ hơn
        if (idx + dir * step < 0 || idx + dir * step > keys.length - 1) dir = -dir;
        while (step > 1 && (idx + dir * step < 0 || idx + dir * step > keys.length - 1)) step--;
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

