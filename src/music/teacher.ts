/**
 * "NHẬN XÉT KIỂU THẦY GIÁO" (OWNER duyệt 2026-10-09) — hàm thuần, có test (tests/teacher.test.ts).
 *
 * Sau mỗi lượt chơi có dữ liệu từng nốt (micro, hoặc chạm phím ảo):
 * 1. Mỗi nhóm nốt (Onset) có một kết quả: đúng · nhầm (biết nốt bé đàn thì ghi lại) · sót · sớm/muộn ngoài cửa sổ chấm
 *    nhịp · bố mẹ bấm "tiếp" (app không xác nhận). Bài hai tay: có thể có kết quả RIÊNG từng tay.
 * 2. "Thầy giáo" (`teach`) chọn MỘT lời nhắn chính, theo luật (không ngẫu nhiên): lỗi gặp NHIỀU nhất → một câu ngắn,
 *    tích cực, cụ thể (≤ 15 chữ); gần hoàn hảo → khen (cụ thể: đúng mấy nốt, câu nào đã tiến bộ).
 * 3. Kèm chỗ cần luyện (ô nhịp) cho nút "🎯 Luyện ngay chỗ này" và kế hoạch luyện (chậm trước, rồi đúng tốc độ).
 *
 * Chi tiết từng nốt chỉ nằm trong bộ nhớ (màn kết quả); KHÔNG lưu vào localStorage.
 */
import { matchHeard } from '../audio/match';
import type { Hand } from '../piano/fingering';
import { midiToPitch, viName } from '../piano/pitchTable';
import type { HeardEvent, NoteVerdict } from './timing';

/** ok = đúng · wrong = nhầm nốt · missed = sót (không nghe thấy) · early/late = đúng nốt nhưng ngoài cửa sổ nhịp · helped = bố mẹ bấm "tiếp" */
export type NoteKind = 'ok' | 'wrong' | 'missed' | 'early' | 'late' | 'helped';

/** Kết quả của MỘT tay trong nhóm nốt (bài hai tay) */
export interface HandOutcome {
  kind: NoteKind;
  /** midi bé đàn nhầm (nếu biết) */
  played?: number;
  /** lệch (phách): âm = sớm, dương = muộn */
  offset?: number;
}

export interface ReviewNote {
  /** TimedNote.index — chỉ số nốt trên khuông */
  index: number;
  hand: Hand;
  /** Mọi cao độ của nốt (gồm `also`) */
  midi: number[];
  beats: number;
  finger?: number;
}

/** Một nhóm nốt cùng lúc sau lượt chơi */
export interface NoteReview {
  notes: ReviewNote[];
  /** Phách bắt đầu (tính từ đầu lượt) */
  start: number;
  /** Ô nhịp (0 = ô đầu của lượt) */
  measure: number;
  kind: NoteKind;
  played?: number;
  /** Chế độ chờ: số lần đàn nhầm trước khi đúng */
  wrongTries?: number;
  offset?: number;
  /** Kết quả riêng từng tay (bài hai tay) — không có thì cả nhóm theo `kind` */
  hands?: Partial<Record<Hand, HandOutcome>>;
}

export interface RunReview {
  mode: 'wait' | 'tempo';
  notes: NoteReview[];
  beatsPerMeasure: number;
  /** Các câu của lượt (ô nhịp [đầu, cuối) — tính từ đầu lượt) */
  phrases: Array<[number, number]>;
  /** Ô đầu của lượt trong cả bài (lượt một câu) — để gọi đúng "ô 5" */
  measureOffset: number;
  hints: 'full' | 'names' | 'staff';
}

/** Kết quả của nốt `n` trong nhóm `r` (theo tay nếu có kết quả riêng tay). */
export function outcomeOf(r: NoteReview, hand: Hand): HandOutcome {
  return r.hands?.[hand] ?? { kind: r.kind, played: r.played, offset: r.offset };
}

/** Lượt có dữ liệu từng nốt do APP xác nhận (không phải toàn bố mẹ bấm "tiếp")? */
export function reviewUsable(r: RunReview | null | undefined): r is RunReview {
  return !!r && r.notes.some((n) => n.kind !== 'helped');
}

/* ---------------- Chế độ chờ: sổ ghi từng nhóm ---------------- */

/** Sổ ghi một nhóm nốt ở chế độ "Từng nốt" (song.ts ghi trong lúc chơi) */
export interface WaitLog {
  /** Số lần đàn nhầm trước khi đúng */
  wrong: number;
  /** Nốt nhầm ĐẦU TIÊN (midi) */
  played?: number;
  /** Hợp âm / hai tay: tay bị thiếu nốt ở lần đàn đầu (micro kiểm hợp âm) */
  missingHands?: Hand[];
  /** Ai cho qua nốt: micro / chạm phím ảo / bố mẹ bấm "tiếp" */
  via?: 'mic' | 'tap' | 'parent';
  /** Kết quả RIÊNG từng tay ở lần đàn đầu (micro chấm hai tay — xem `handsOutcome`); có thì dùng thay `missingHands` */
  hands?: Partial<Record<Hand, HandOutcome>>;
}

/**
 * Kết quả từng tay của bộ chấm hai tay (src/audio/twoHand.ts — `HandsResult.RH/LH: HandCheck`) → màu theo tay.
 * Kiểu cấu trúc (không import) để hai phần độc lập: hit → đúng · miss → sót · wrong → nhầm (+ phím nghe được).
 * Không kết luận được (conclusive = false) / không có tay nào → undefined.
 */
export interface HandCheckLike {
  verdict: 'hit' | 'miss' | 'wrong';
  heard?: number;
}
export function handsOutcome(r: { conclusive: boolean; RH?: HandCheckLike; LH?: HandCheckLike } | null | undefined): Partial<Record<Hand, HandOutcome>> | undefined {
  if (!r?.conclusive) return undefined;
  const out: Partial<Record<Hand, HandOutcome>> = {};
  for (const h of ['RH', 'LH'] as const) {
    const c = r[h];
    if (!c) continue;
    out[h] = c.verdict === 'hit' ? { kind: 'ok' } : c.verdict === 'wrong' ? { kind: 'wrong', ...(c.heard !== undefined ? { played: c.heard } : {}) } : { kind: 'missed' };
  }
  return Object.keys(out).length ? out : undefined;
}

export function waitOutcome(log: WaitLog | undefined, hands: Hand[]): Pick<NoteReview, 'kind' | 'played' | 'wrongTries' | 'hands'> {
  if (!log || log.via === 'parent' || !log.via) return { kind: 'helped' };
  const kind: NoteKind = log.wrong > 0 ? 'wrong' : 'ok';
  const out: Pick<NoteReview, 'kind' | 'played' | 'wrongTries' | 'hands'> = { kind, wrongTries: log.wrong };
  if (log.played !== undefined) out.played = log.played;
  const uniq = [...new Set(hands)];
  if (log.hands && uniq.length > 1) {
    out.hands = log.hands;
    return out;
  }
  const miss = (log.missingHands ?? []).filter((h) => uniq.includes(h));
  if (uniq.length > 1 && miss.length && miss.length < uniq.length) {
    out.hands = {};
    for (const h of uniq) out.hands[h] = miss.includes(h) ? { kind: 'missed' } : { kind };
  }
  return out;
}

/* ---------------- Theo nhịp: phân tích lần nghe ---------------- */

/**
 * Sau gradeTiming: nốt trượt là SỚM/MUỘN (đúng cao độ nhưng ngoài cửa sổ, lệch tới `extra` phách nữa), NHẦM (nghe
 * nốt khác trong cửa sổ — ghi lại nốt nghe được) hay SÓT. Mỗi lần nghe chỉ dùng một lần (lần nghe đã cho nốt trúng
 * thì không dùng lại).
 */
export function analyzeTempo(
  groups: ReadonlyArray<{ index: number; start: number; midi: number[] }>,
  heard: ReadonlyArray<HeardEvent>,
  verdicts: ReadonlyArray<NoteVerdict>,
  win: { early: number; late: number },
  extra = 1,
): Array<Pick<NoteReview, 'kind' | 'offset' | 'played'>> {
  const ok = (h: HeardEvent, g: { midi: number[] }) => matchHeard(h.midi, g.midi) !== 'none';
  const used = new Set<number>();
  const out: Array<Pick<NoteReview, 'kind' | 'offset' | 'played'>> = groups.map(() => ({ kind: 'missed' }));
  const vOf = new Map(verdicts.map((v) => [v.index, v]));
  groups.forEach((g, gi) => {
    const v = vOf.get(g.index);
    if (!v?.hit) return;
    out[gi] = { kind: 'ok', offset: v.offset };
    const hi = heard.findIndex((h, k) => !used.has(k) && ok(h, g) && Math.abs(h.beat - g.start - (v.offset ?? 0)) < 1e-6);
    if (hi >= 0) used.add(hi);
  });
  const misses = groups.map((g, gi) => ({ g, gi })).filter(({ gi }) => out[gi].kind === 'missed');
  const assign = (pairs: Array<{ gi: number; hi: number; off: number }>, set: (gi: number, hi: number, off: number) => void) => {
    pairs.sort((a, b) => Math.abs(a.off) - Math.abs(b.off) || a.gi - b.gi || a.hi - b.hi);
    const done = new Set<number>();
    for (const p of pairs) {
      if (used.has(p.hi) || done.has(p.gi)) continue;
      used.add(p.hi);
      done.add(p.gi);
      set(p.gi, p.hi, p.off);
    }
  };
  // 1) Đúng nốt, ngoài cửa sổ → sớm / muộn
  const timing: Array<{ gi: number; hi: number; off: number }> = [];
  for (const { g, gi } of misses) {
    heard.forEach((h, hi) => {
      if (used.has(hi) || !ok(h, g)) return;
      const off = h.beat - g.start;
      if ((off < -win.early && off >= -win.early - extra) || (off > win.late && off <= win.late + extra)) timing.push({ gi, hi, off });
    });
  }
  assign(timing, (gi, _hi, off) => (out[gi] = { kind: off < 0 ? 'early' : 'late', offset: off }));
  // 2) Nốt khác trong cửa sổ → nhầm
  const wrong: Array<{ gi: number; hi: number; off: number }> = [];
  for (const { g, gi } of misses) {
    if (out[gi].kind !== 'missed') continue;
    heard.forEach((h, hi) => {
      if (used.has(hi) || ok(h, g)) return;
      const off = h.beat - g.start;
      if (off >= -win.early && off <= win.late) wrong.push({ gi, hi, off });
    });
  }
  assign(wrong, (gi, hi) => (out[gi] = { kind: 'wrong', played: heard[hi].midi }));
  return out;
}

/* ---------------- Thầy giáo: MỘT lời nhắn chính ---------------- */

export type TeacherRule = 'perfect' | 'improved' | 'near' | 'hands' | 'confusion' | 'hold' | 'rush' | 'drag' | 'wrongs' | 'missed';

export interface TeacherPoint {
  rule: TeacherRule;
  /** Lời nhắn (≤ 15 chữ, tích cực, cụ thể) — hiện trên màn và đọc to */
  text: string;
  praise: boolean;
  /** Chỗ cần luyện: ô nhịp [đầu, cuối) TÍNH TỪ ĐẦU LƯỢT (null = không cần luyện) */
  focus: [number, number] | null;
}

/** Thứ tự ưu tiên khi hai loại lỗi bằng số lần */
export const RULE_PRIORITY: readonly TeacherRule[] = ['hands', 'confusion', 'hold', 'rush', 'drag', 'wrongs', 'missed'];

/** Nốt đúng nhưng lệch ≥ chừng này phách vẫn tính là "hơi vội / hơi chậm" (không tô màu — chỉ để thầy nhận xét) */
export const SOFT_EARLY = 0.3;
export const SOFT_LATE = 0.35;

interface Issue {
  rule: TeacherRule;
  measure: number;
  /** confusion: "đích>nghe"; hold: số phách nốt dài; hands: tay chậm */
  key?: string;
}

const HAND_VI: Record<Hand, string> = { RH: 'phải', LH: 'trái' };
const name = (midi: number) => viName(midiToPitch(midi));
const countWordsVi = (bpm: number) => Array.from({ length: Math.max(2, bpm) }, (_, k) => k + 1).join('-');
const LONG_NAMES: Record<number, string> = { 2: 'trắng', 3: 'trắng chấm', 4: 'tròn' };

/** Số chữ của lời nhắn (bỏ dấu câu / biểu tượng đứng riêng) — luật ≤ 15 chữ */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function issuesOf(r: RunReview): Issue[] {
  const out: Issue[] = [];
  const ns = r.notes;
  ns.forEach((n, i) => {
    if (n.kind === 'helped') return;
    const m = n.measure;
    // Hai tay: một tay ổn, tay kia sót / nhầm / lệch → "chưa vào cùng"
    const hs = n.hands ? (Object.entries(n.hands) as Array<[Hand, HandOutcome]>) : [];
    if (hs.length > 1) {
      const bad = hs.filter(([, o]) => o.kind !== 'ok' && o.kind !== 'helped');
      if (bad.length && bad.length < hs.length) {
        out.push({ rule: 'hands', measure: m, key: bad[0][0] });
        return;
      }
    }
    const prev = ns[i - 1];
    const prevLong = prev ? Math.max(...prev.notes.map((x) => x.beats)) : 0;
    const afterLong = !!prev && prevLong >= 2 && Math.abs(prev.start + prevLong - n.start) < 1e-6;
    const early = n.kind === 'early' || (n.kind === 'ok' && r.mode === 'tempo' && (n.offset ?? 0) <= -SOFT_EARLY);
    const late = n.kind === 'late' || (n.kind === 'ok' && r.mode === 'tempo' && (n.offset ?? 0) >= SOFT_LATE);
    if (early) out.push(afterLong ? { rule: 'hold', measure: prev.measure, key: String(prevLong) } : { rule: 'rush', measure: m });
    else if (late) out.push({ rule: 'drag', measure: m });
    else if (n.kind === 'wrong') {
      const target = n.notes[0]?.midi[0];
      const single = n.notes.length === 1 && n.notes[0].midi.length === 1;
      out.push(single && n.played !== undefined && target !== undefined ? { rule: 'confusion', measure: m, key: `${target}>${n.played}` } : { rule: 'wrongs', measure: m });
    } else if (n.kind === 'missed') out.push({ rule: 'missed', measure: m });
  });
  return out;
}

/** Câu (chỉ số) chứa ô `m` */
const phraseOf = (r: RunReview, m: number) => Math.max(0, r.phrases.findIndex(([a, b]) => m >= a && m < b));

/** Chỗ luyện: câu có nhiều lỗi nhất; lượt chỉ có một câu (dài > 2 ô) → thu lại 2 ô quanh chỗ nhiều lỗi nhất. */
function focusOf(r: RunReview, measures: number[]): [number, number] | null {
  if (!measures.length || !r.phrases.length) return null;
  const perPhrase = new Map<number, number>();
  for (const m of measures) perPhrase.set(phraseOf(r, m), (perPhrase.get(phraseOf(r, m)) ?? 0) + 1);
  const best = [...perPhrase.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const [a, b] = r.phrases[best];
  if (r.phrases.length > 1 || b - a <= 2) return [a, b];
  const perM = new Map<number, number>();
  for (const m of measures) perM.set(m, (perM.get(m) ?? 0) + 1);
  const top = [...perM.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0];
  const from = Math.max(a, Math.min(top, b - 2));
  return [from, from + 2];
}

/** "Câu 2" (lượt nhiều câu) · "Ô 5–6" / "Ô 5" (lượt một câu) — số ô tính theo CẢ BÀI */
export function placeLabel(r: RunReview, focus: [number, number]): string {
  if (r.phrases.length > 1) return `Câu ${phraseOf(r, focus[0]) + 1}`;
  const a = focus[0] + r.measureOffset + 1;
  const b = focus[1] + r.measureOffset;
  return b > a ? `Ô ${a}–${b}` : `Ô ${a}`;
}

/**
 * Lời nhắn chính sau một lượt. `prev` = lời nhắn của lượt TRƯỚC (cùng bài, cùng màn — chỉ trong bộ nhớ):
 * chỗ lượt trước còn lỗi mà lượt này sạch → khen "con tiến bộ thật".
 * null = lượt không có dữ liệu từng nốt (bố mẹ chấm).
 */
export function teach(r: RunReview, prev: TeacherPoint | null = null): TeacherPoint | null {
  if (!reviewUsable(r)) return null;
  const graded = r.notes.filter((n) => n.kind !== 'helped');
  const issues = issuesOf(r);
  const hard = graded.filter((n) => n.kind !== 'ok' || Object.values(n.hands ?? {}).some((o) => o && o.kind !== 'ok')).length;
  const okRatio = graded.length ? (graded.length - hard) / graded.length : 0;

  // Đếm theo loại; nhầm cùng một cặp nốt ≥ 2 lần mới là "hay bị nhầm"
  const pairCount = new Map<string, Issue[]>();
  for (const it of issues) if (it.rule === 'confusion') pairCount.set(it.key!, [...(pairCount.get(it.key!) ?? []), it]);
  const topPair = [...pairCount.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const byRule = new Map<TeacherRule, Issue[]>();
  for (const it of issues) {
    let rule = it.rule;
    if (rule === 'confusion' && (!topPair || topPair[0] !== it.key || topPair[1].length < 2)) rule = 'wrongs';
    byRule.set(rule, [...(byRule.get(rule) ?? []), { ...it, rule }]);
  }
  const maxCount = Math.max(0, ...[...byRule.values()].map((v) => v.length));

  // Lượt trước còn lỗi ở chỗ X, lượt này chỗ X sạch → khen tiến bộ (chỉ khi lượt này gần hoàn hảo)
  const prevClean =
    prev && !prev.praise && prev.focus
      ? !graded.some((n) => n.measure >= prev.focus![0] && n.measure < prev.focus![1] && n.kind !== 'ok') &&
        !issues.some((it) => it.measure >= prev.focus![0] && it.measure < prev.focus![1])
      : false;

  if (hard === 0 && maxCount < 3) {
    if (prevClean) return { rule: 'improved', text: `${placeLabel(r, prev!.focus!)} lần này sạch rồi — con tiến bộ thật!`, praise: true, focus: null };
    return {
      rule: 'perfect',
      text: r.mode === 'tempo' ? 'Đúng nốt, đều nhịp như đồng hồ — giỏi lắm con!' : `Đúng hết ${graded.length} nốt ngay lần đầu — tay con vững lắm!`,
      praise: true,
      focus: null,
    };
  }
  if (okRatio >= 0.9 && hard <= 2 && maxCount < 2) {
    const ms = issues.map((i) => i.measure);
    const focus = focusOf(r, ms);
    if (prevClean) return { rule: 'improved', text: `${placeLabel(r, prev!.focus!)} lần này sạch rồi — con tiến bộ thật!`, praise: true, focus };
    const where = new Set(ms).size === 1 ? `ô ${ms[0] + r.measureOffset + 1}` : `${new Set(ms).size} chỗ nhỏ`;
    return { rule: 'near', text: `Gần như hoàn hảo! Chỉ còn ${where} — luyện chút là xong.`, praise: true, focus };
  }

  // Lỗi gặp NHIỀU nhất; bằng nhau → theo RULE_PRIORITY
  const rule = [...byRule.keys()].sort((a, b) => byRule.get(b)!.length - byRule.get(a)!.length || RULE_PRIORITY.indexOf(a) - RULE_PRIORITY.indexOf(b))[0];
  if (!rule) return null;
  const list = byRule.get(rule)!;
  const focus = focusOf(r, list.map((i) => i.measure));
  const place = focus ? placeLabel(r, focus) : 'Chỗ này';
  let text: string;
  switch (rule) {
    case 'hands': {
      // Tay hay "chưa vào" nhất; ô đầu tiên có lỗi đó
      const lag = (list.filter((i) => i.key === 'LH').length >= list.filter((i) => i.key === 'RH').length ? 'LH' : 'RH') as Hand;
      const m = list.find((i) => i.key === lag)!.measure;
      text = `Tay ${HAND_VI[lag]} chưa vào cùng tay ${HAND_VI[lag === 'LH' ? 'RH' : 'LH']} ở ô ${m + r.measureOffset + 1} — đàn cùng lúc nhé!`;
      break;
    }
    case 'confusion': {
      const [target, played] = topPair![0].split('>').map(Number);
      const finger = r.notes.flatMap((n) => n.notes).find((x) => x.midi[0] === target && x.finger)?.finger;
      text = `Nốt ${name(target)} hay bị nhầm thành ${name(played)} — ${finger ? `ngón ${finger}` : 'nhìn kỹ'} nhé!`;
      break;
    }
    case 'hold': {
      const beats = Number(list[0].key);
      const shape = LONG_NAMES[beats] ?? 'dài';
      text = `Giữ đủ nốt ${shape} ${beats} phách — đếm thầm ${countWordsVi(beats)} nhé!`;
      break;
    }
    case 'rush':
      text = `${place} con hơi vội — đếm ${countWordsVi(r.beatsPerMeasure)} rồi đàn lại nhé!`;
      break;
    case 'drag':
      text = `${place} con hơi chậm — nghe tiếng tích, đàn đúng lúc nhé!`;
      break;
    case 'missed':
      text = `${place} còn sót ${list.length} nốt — mình đàn chậm chỗ này nhé!`;
      break;
    default:
      text = `${place} còn nhầm vài nốt — ${r.hints === 'staff' ? 'nhìn kỹ nốt trên khuông' : 'đọc tên nốt rồi đàn'} nhé!`;
  }
  return { rule, text, praise: false, focus };
}

/* ---------------- 🎯 Luyện ngay chỗ này ---------------- */

export interface FocusStep {
  /** demo = thầy đàn mẫu chậm (bé xem) · play = bé đàn */
  kind: 'demo' | 'play';
  mode: 'wait' | 'tempo';
  bpm: number;
}

/** Tốc độ chậm hơn một nấc (thang 40/50/60/72); đã ở nấc thấp nhất → ¾ tốc độ (≥ 30). */
export function slowerBpm(bpm: number, tempos: readonly number[] = [40, 50, 60, 72]): number {
  const lower = tempos.filter((t) => t < bpm);
  return lower.length ? lower[lower.length - 1] : Math.max(30, Math.round(bpm * 0.75));
}

/**
 * Kế hoạch luyện nhanh một chỗ: CHẬM trước, rồi ĐÚNG tốc độ.
 * Theo nhịp: đàn chậm một lượt → đàn đúng tốc độ một lượt. Từng nốt: thầy đàn mẫu chậm → bé đàn từng nốt.
 */
export function focusPlan(mode: 'wait' | 'tempo', bpm: number, tempos?: readonly number[]): FocusStep[] {
  const slow = slowerBpm(bpm, tempos);
  return mode === 'tempo'
    ? [
        { kind: 'play', mode: 'tempo', bpm: slow },
        { kind: 'play', mode: 'tempo', bpm },
      ]
    : [
        { kind: 'demo', mode: 'wait', bpm: slow },
        { kind: 'play', mode: 'wait', bpm },
      ];
}

/** Các loại kết quả có mặt (cho chú thích màu — chỉ hiện loại có trong lượt) */
export function kindsPresent(r: RunReview): NoteKind[] {
  const s = new Set<NoteKind>();
  for (const n of r.notes) for (const x of n.notes) s.add(outcomeOf(n, x.hand).kind);
  return (['ok', 'wrong', 'missed', 'early', 'late'] as NoteKind[]).filter((k) => s.has(k));
}
