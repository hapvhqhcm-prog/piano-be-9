/**
 * So nốt micro nghe được với các nốt cần đàn.
 *
 * Micro chỉ nghe MỘT cao độ mỗi lúc. Khi bé đàn 2–3 nốt cùng lúc (hợp âm, hai tay), cao độ "chung" của chúng
 * là một nốt TRẦM hơn mọi nốt trong hợp âm, cùng tên (cách quãng 8) hoặc cách quãng 5 với một nốt trong đó.
 * Đo trên giả lập đàn cơ: Đô+Mi → Đô thấp 2 quãng 8; Đô+Sol → Đô thấp; Fa+Đô → Fa thấp; La+Đô+Mi → La thấp.
 * Trước đây trường hợp này bị tính là ĐÀN SAI dù bé đàn đúng.
 */
export type MatchKind = 'exact' | 'chord' | 'none';

export function matchHeard(heard: number, wanted: number[]): MatchKind {
  if (wanted.includes(heard)) return 'exact';
  if (wanted.length < 2) return 'none';
  const low = Math.min(...wanted);
  if (heard >= low || low - heard > 36) return 'none';
  return wanted.some((m) => [0, 7].includes((m - heard) % 12)) ? 'chord' : 'none';
}
