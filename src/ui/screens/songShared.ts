/**
 * Phần dùng chung của màn bài hát (song.ts, songHead.ts): kiểu tuỳ chọn, hằng số, hàm thuần (không DOM trạng thái).
 */
import { allTimed, expressionUsed, pitchesOf, type Onset, type Tune } from '../../music/tune';
import type { Hand } from '../../piano/fingering';
import { noteLabel, pitchToMidi, viName } from '../../piano/pitchTable';
import { h } from '../components/dom';

export interface SongOptions {
  mode: 'wait' | 'tempo';
  level?: 2 | 3;
  hints: 'full' | 'names' | 'staff';
  intro?: string;
  /** Cho đổi chế độ / chọn câu / tốc độ (thư viện bài hát) */
  free?: boolean;
  /** Sân khấu: chỉ chơi cả bài một lần rồi báo xong */
  stage?: boolean;
  /** v5 — Mở sẵn một câu [ô đầu, ô cuối) (bước "Ôn bài cũ") */
  phrase?: [number, number];
  /** v5 — Tốc độ mở sẵn (mặc định tốc độ của bài) */
  bpm?: number;
  /** v5 — Bước "Ôn bài cũ" trong buổi: khoá câu (không hiện nút chọn câu), luôn hiện lời dẫn */
  review?: boolean;
  /** v5.1 — Bài học chỉ định tập tách tay: mở sẵn tay này (bé vẫn đổi được) */
  hand?: 'RH' | 'LH';
}

/** Tập tách tay (bài hai tay): RH / LH = chỉ chấm tay đó; BOTH = hai tay như thường. */
export type HandSel = 'BOTH' | 'RH' | 'LH';

/** Khi micro không ước được lúc gõ phím: trễ trung bình từ lúc gõ tới lúc nhận nốt (đo trên giả lập ~70 ms). */
export const MIC_LATENCY = 0.07;
/** Thang tốc độ (nhịp/phút): đạt ở nấc chậm → gợi ý lên nấc tiếp. */
export const TEMPOS = [40, 50, 60, 72];
/** "Lặp câu này N lần đúng liên tiếp" */
export const LOOP_TARGET = 3;
/** v5.1 — Lời dẫn trên màn chỉ MỘT dòng ngắn; dài hơn thì app đọc to cả câu (nút 🔊 đọc lại). */
const INTRO_MAX = 60;

/** Dòng lời dẫn ngắn: câu đầu (nếu đủ ngắn) hoặc cắt ở chỗ trống gần nhất + "…". */
export function shortIntro(text: string): string {
  const t = text.trim();
  if (t.length <= INTRO_MAX) return t;
  const first = t.split(/(?<=[.!?])\s+/)[0];
  if (first.length <= INTRO_MAX) return first;
  const cut = t.slice(0, INTRO_MAX);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 30 ? cut.slice(0, sp) : cut).replace(/[\s,;:—–-]+$/, '')}…`;
}

/**
 * v5.1 — "🔁 Lặp câu khó": câu (phraseRanges) có NHIỀU lỗi nhất trong lượt vừa chơi.
 * `missByMeasure`: số lỗi theo ô nhịp. Không có lỗi / chỉ một câu → null.
 */
export function hardestPhrase(ranges: ReadonlyArray<[number, number]>, missByMeasure: ReadonlyMap<number, number>): { range: [number, number]; index: number; misses: number } | null {
  if (ranges.length < 2) return null;
  let best: { range: [number, number]; index: number; misses: number } | null = null;
  ranges.forEach(([a, b], index) => {
    let misses = 0;
    for (const [m, n] of missByMeasure) if (m >= a && m < b) misses += n;
    if (misses > 0 && (!best || misses > best.misses)) best = { range: [a, b], index, misses };
  });
  return best;
}

/** Bảng ngón của CHÍNH bài này (để số ngón hiện đúng khi chạm phím ảo — thế Sol, gam luồn ngón…). */
export function fingerMap(t: Tune): Map<number, { finger: number; hand: Hand }> {
  const m = new Map<number, { finger: number; hand: Hand }>();
  for (const n of allTimed(t)) {
    const parts = [{ pitch: n.pitch, finger: n.finger }, ...(n.also ?? [])];
    for (const p of parts) {
      if (!p.pitch || !p.finger) continue;
      const k = pitchToMidi(p.pitch);
      if (!m.has(k)) m.set(k, { finger: p.finger, hand: n.hand });
    }
  }
  return m;
}

/**
 * v4 — Chú thích nhỏ khi bài có ký hiệu sắc thái / ngắt / luyến (chữ ít, dễ hiểu cho bé).
 * Micro vẫn chỉ chấm cao độ & nhịp — không trừ điểm sắc thái.
 */
export function expressionLegend(t: Tune): HTMLElement | null {
  const u = expressionUsed(t);
  if (!u.dyn && !u.stac && !u.slur) return null;
  const dynsUsed = new Set([...t.notes, ...(t.lh ?? [])].map((n) => n.dyn).filter(Boolean));
  const item = (sym: HTMLElement, text: string) => h('span', { class: 'legend-item' }, sym, ' ', text);
  return h(
    'div',
    { class: 'song-legend' },
    ...(['p', 'mf', 'f'] as const)
      .filter((d) => dynsUsed.has(d))
      .map((d) => item(h('i', { class: 'legend-dyn' }, d), d === 'p' ? '= nhỏ 🐭' : d === 'f' ? '= to 🦁' : '= vừa 🙂')),
    u.stac ? item(h('b', { class: 'legend-sym' }, '•'), 'chấm = ngắt tiếng 🐇') : null,
    u.slur ? item(h('b', { class: 'legend-sym' }, '⌒'), 'dấu luyến = đàn liền 🐢') : null,
  );
}

/** Tên nhóm nốt cần đàn: hai tay "🫱 Mi · 🫲 Đô"; một tay "Mi (+1) — ngón 3". */
export function onsetLabel(o: Onset): string {
  const rh = o.notes.filter((n) => n.hand === 'RH').flatMap(pitchesOf);
  const lh = o.notes.filter((n) => n.hand === 'LH').flatMap(pitchesOf);
  const fmt = (ps: string[]) => ps.map((p) => viName(p)).join('+');
  if (rh.length && lh.length) return `🫱 ${fmt(rh)} · 🫲 ${fmt(lh)}`;
  const n = o.notes[0];
  return `${noteLabel(o.pitches[0])}${o.pitches.length > 1 ? ` (+${o.pitches.length - 1})` : ''}${n.finger ? ` — ngón ${n.finger}` : ''}`;
}

export const midisOf = (o: Onset): number[] => o.pitches.map(pitchToMidi);
export const idxOf = (o: Onset): number[] => o.notes.map((n) => n.index);
