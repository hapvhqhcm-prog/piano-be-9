import type { Hand } from '../piano/fingering';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';

/**
 * TỰ GHI SỐ NGÓN cho bài bố mẹ nhập (hàm thuần, có test — tests/autoFinger.test.ts).
 *
 * Cùng ý tưởng với scripts/gen-songs.py (extension_fingers): quy hoạch động chọn ngón cho từng nốt sao cho
 * TỔNG "độ khó" nhỏ nhất. Độ khó tính theo khoảng cách PHÍM TRẮNG (một ngón ≈ một phím trắng — thế 5 ngón):
 * - Hai nốt cách nhau đúng bằng số ngón → 0 (đứng yên trong thế tay: Đô-Rê-Mi-Fa-Sol = 1-2-3-4-5).
 * - Giãn tay (cách xa hơn số ngón) → phạt theo độ giãn (giữa ngón cái và ngón khác giãn dễ hơn); xa quá = dời tay.
 * - Hai phím khác nhau cùng một ngón → phạt nặng (trừ khi có dấu lặng / nốt dài để kịp nhấc tay).
 * - Luồn ngón cái (đi lên: 3→1, 4→1) / vắt ngón qua ngón cái (đi xuống: 1→3, 1→4) → phạt vừa (gam Đô: 1-2-3-1-2-3-4-5);
 *   bắt chéo kiểu khác → phạt rất nặng.
 * - Nhảy từ một quãng tám trở lên → dời tay (ngón nào cũng như nhau, ưu tiên nhẹ ngón đúng chiều).
 * - Ngón cái / ngón út trên phím đen → phạt nhẹ.
 * Tay trái: đối xứng gương (đi lên = số ngón giảm).
 */

export interface FingerNote {
  pitch?: Pitch;
  beats: number;
  rest?: boolean;
}

/** Vị trí theo phím trắng của mỗi lớp cao độ (phím đen nằm giữa hai phím trắng). */
const WHITE_POS = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];

export function whitePos(pitch: Pitch): number {
  const m = pitchToMidi(pitch);
  return Math.floor(m / 12) * 7 + WHITE_POS[((m % 12) + 12) % 12];
}

const isBlack = (pitch: Pitch) => WHITE_POS[((pitchToMidi(pitch) % 12) + 12) % 12] % 1 !== 0;

const BIG = 40;

/** Độ khó khi đi từ (a, ngón fa) sang (b, ngón fb). `relaxed` = có thời gian dời tay (dấu lặng / nốt dài). */
export function transitionCost(a: Pitch, fa: number, b: Pitch, fb: number, hand: Hand, relaxed = false): number {
  const sgn = hand === 'RH' ? 1 : -1;
  const w = (whitePos(b) - whitePos(a)) * sgn; // > 0: đi về phía ngón út
  const df = fb - fa;
  const soft = relaxed ? 0.4 : 1;
  if (Math.abs(w) < 1e-9) return fa === fb ? 0 : 1; // nốt lặp: giữ ngón
  // Nhảy xa từ một quãng tám trở lên: ngón nào cũng phải dời cả bàn tay — chỉ ưu tiên nhẹ ngón "đúng chiều"
  if (Math.abs(w) >= 7) return 4 * soft + (Math.sign(fb - fa) === Math.sign(w) ? 0 : 0.5);
  if (df === 0) return 6 * soft + (relaxed ? 0 : 2);
  if (Math.sign(w) === Math.sign(df)) {
    const thumb = fa === 1 || fb === 1;
    const e = Math.abs(w) - Math.abs(df);
    if (e > 0) {
      const room = thumb ? 3 : 1; // giãn được bao nhiêu phím trắng trước khi phải dời tay
      return (e * (thumb ? 0.8 : 1.5) + (e > room ? 4 + (e - room) : 0)) * soft;
    }
    return e < 0 ? -e * 0.7 * soft : 0; // co tay (ngón cách xa hơn phím) — dễ
  }
  // Bắt chéo
  const step = Math.abs(w);
  if (w > 0 && fb === 1 && fa >= 2 && fa <= 4) return (fa === 4 ? 3.5 : fa === 2 ? 3.8 : 3) + Math.max(0, step - 1) * 2; // luồn ngón cái
  if (w < 0 && fa === 1 && fb >= 2 && fb <= 4) return (fb === 4 ? 3.5 : fb === 2 ? 3.8 : 3) + Math.max(0, step - 1) * 2; // vắt ngón
  return BIG;
}

function nodeCost(pitch: Pitch, f: number): number {
  return isBlack(pitch) && (f === 1 || f === 5) ? 1 : 0;
}

/**
 * Trả về số ngón (1–5) cho từng nốt (dấu lặng → undefined), cùng thứ tự với `notes`.
 * Nốt đầu tiên: ưu tiên thế 5 ngón đặt sao cho cả câu đầu nằm gọn (do quy hoạch động tự chọn).
 */
export function autoFinger(notes: readonly FingerNote[], hand: Hand = 'RH'): Array<number | undefined> {
  const idx: number[] = [];
  notes.forEach((n, i) => {
    if (!n.rest && n.pitch) idx.push(i);
  });
  const out: Array<number | undefined> = notes.map(() => undefined);
  if (!idx.length) return out;
  const F = [1, 2, 3, 4, 5];
  // cost[k][f] = độ khó nhỏ nhất tới nốt k khi nốt k dùng ngón f
  const cost: number[][] = [F.map((f) => nodeCost(notes[idx[0]].pitch!, f))];
  const back: number[][] = [F.map(() => -1)];
  for (let k = 1; k < idx.length; k++) {
    const a = notes[idx[k - 1]];
    const b = notes[idx[k]];
    const relaxed = idx[k] - idx[k - 1] > 1 || a.beats >= 2;
    const row: number[] = [];
    const br: number[] = [];
    for (const fb of F) {
      let best = Infinity;
      let arg = 0;
      for (const fa of F) {
        const v = cost[k - 1][fa - 1] + transitionCost(a.pitch!, fa, b.pitch!, fb, hand, relaxed);
        if (v < best - 1e-9) {
          best = v;
          arg = fa;
        }
      }
      row.push(best + nodeCost(b.pitch!, fb));
      br.push(arg);
    }
    cost.push(row);
    back.push(br);
  }
  let f = 1;
  let best = Infinity;
  for (const x of F) {
    if (cost[cost.length - 1][x - 1] < best - 1e-9) {
      best = cost[cost.length - 1][x - 1];
      f = x;
    }
  }
  for (let k = idx.length - 1; k >= 0; k--) {
    out[idx[k]] = f;
    f = back[k][f - 1];
  }
  return out;
}

/** Bài nên chơi tay nào: mọi nốt từ Đô giữa trở xuống và có nốt dưới Đô giữa → tay trái (như bài bé sáng tác). */
export function guessHand(notes: readonly FingerNote[]): Hand {
  const ms = notes.filter((n) => !n.rest && n.pitch).map((n) => pitchToMidi(n.pitch!));
  return ms.length > 0 && Math.max(...ms) <= 60 && Math.min(...ms) < 60 ? 'LH' : 'RH';
}
