/**
 * CHẾ ĐỘ CHỜ ("Từng nốt") — BÉ THẬT, KHÔNG CHỈ "ĐÀN ĐÚNG" (2026-10-15, tests/childBehavior.test.ts).
 *
 * Trước đây: micro nghe nốt nào khác nốt đang chờ là "đàn sai". Mô phỏng bé 9 tuổi thật (tests/childSim.ts) cho thấy
 * nhiều "đàn sai" oan: bé ngân nga theo giai điệu (giọng kéo dài nốt vừa đàn → 20–30 lần "sai" một bài), gõ nắp đàn,
 * anh chị nói chuyện, chạm hai phím một lúc, đàn vội nhanh hơn con trỏ (micro lỡ một nốt → cả đoạn sau "sai"), dừng lâu
 * rồi đàn lại từ đầu câu (cả đoạn đàn lại "sai"), đàn đúng giai điệu nhưng lệch quãng 8 ("sai" mãi, bé không hiểu vì sao).
 *
 * Hàm thuần `judgeWait` — songWait.ts / practice.ts / sing.ts và các mô phỏng dùng CHUNG. Thứ tự xét một nốt nghe được:
 * 1. Khớp nốt đang chờ (match.ts: cả nốt trầm chung của hợp âm) → `ok`.
 * 2. ĐÀN VỘI: khớp một trong 3 nốt kế tiếp khi bé đang đàn liền tay (< AHEAD_GAP s/nốt, xét sau bước 3) → `pending` (chưa nói gì). Nốt nghe sau đó khớp
 *    nốt kế nữa = bé đang đàn một mạch, micro lỡ nốt → `ahead`: con trỏ bắt kịp (nốt lỡ: "sót", không "sai"). Không khớp →
 *    nốt kia là đàn sai thật (`lateWrong`, tính muộn một nốt) — đàn nhầm phím bên cạnh vẫn bị bắt như trước.
 * 3. Trùng nốt VỪA được nhận (< ECHO_S) → `echo`: dây còn ngân / pedal / bé ngân nga theo / tiếng gõ làm nốt cũ "kêu lại"
 *    — bỏ qua, không nói gì. (Bé đàn lại nốt vừa đàn ngay sau đó — "nói lắp" — cũng không bị tính sai.)
 * 4. Đang đàn lại một đoạn (đã nhận ra ở bước 5) và khớp nốt kế của đoạn đó → `replay`.
 * 5. Nốt ĐẦU CÂU (câu này, hoặc câu trước khi vừa sang câu mới) sau một lúc dừng (≥ RESTART_GAP s; ≥ 1 s ngay sau một
 *    nốt sai) → `replay`: bé đàn lại từ đầu câu — để bé đàn, không tính sai; tới nốt đang sáng thì đi tiếp như thường.
 *    Nốt đầu câu TRÙNG nốt đang chờ: vẫn nhận, và sẵn sàng nhận ra đoạn đàn lại ngay sau đó.
 * 6. Ở quá xa nốt chờ (≥ FAR nửa cung, không phải quãng 8) → `ghost` (giọng nói / gõ nắp đàn / nốt ảo — tay không trượt xa thế).
 * 7. Còn lại: HỎI MICRO cho chắc (`check` → MicListener.verifyHands({RH:[nốt chờ], LH:[nốt nghe]}) ~0,3 s) rồi gọi lại
 *    với `pair`: cả hai phím vừa được gõ → `smudge` "chạm 2 phím" (chưa rõ, không tính sai); chỉ phím cần đàn → `ok`;
 *    không phím nào vừa được gõ → `ghost`; phím nghe được vừa được gõ / micro không kết luận được → bước 8.
 * 8. Cùng tên nốt, lệch quãng 8 (±12/±24) → `octave`: nốt ĐẦU TIÊN của một chuỗi lệch quãng 8 được cho qua (bé đọc đúng
 *    tên nốt; có khi micro nhầm quãng 8) kèm lời nhắc; từ nốt thứ hai liên tiếp app GIỮ con trỏ và nói rõ "đúng tên nốt
 *    rồi — dời tay về phím đang sáng" (không tính là đàn sai). Bài luyện tìm phím (practice.ts): octaveGrace = 0.
 * 9. Còn lại → `wrong` (như trước).
 *
 * OWNER có thể đổi các hằng số dưới đây (chính sách sư phạm mặc định: hiền, nhưng không giấu lỗi).
 */
import { matchHeard } from '../audio/match';

/** Số nốt lệch quãng 8 LIÊN TIẾP app còn cho qua (kèm lời nhắc). Từ nốt sau đó: giữ con trỏ, nhắc dời tay. */
export const OCTAVE_GRACE = 1;
/** Bé dừng ít nhất ngần này giây rồi đàn nốt đầu câu = đàn lại từ đầu câu (nốt trắng / tròn ngân 2–4 s không tính). */
export const RESTART_GAP = 3.5;
/**
 * Nốt vừa nhận còn "vọng" (dây ngân, pedal, bé ngân nga theo, tiếng gõ làm nốt cũ kêu lại) trong ngần này giây.
 * Đánh đổi (đo, tests/weekSim.ts "nhẹ, có lỗi" tuần 4–6): bé lỡ đàn LẠI phím vừa đàn trong 1,5 s không bị tính sai
 * (nhầm phím bên cạnh bị bắt 36/45 thay vì 45/45 — con trỏ vẫn không đi); 0,8 s bắt 41/45 nhưng ngân nga / gõ nắp
 * đàn / em nhỏ nói chuyện lại thành 2–7 lần "sai" oan mỗi bài.
 */
export const ECHO_S = 1.5;
/** Đàn vội: xét tới ngần này nốt phía trước con trỏ. */
export const AHEAD_MAX = 3;
/** …khi bé đang đàn liền tay: nốt trước vừa nghe chưa tới ngần này giây (đàn từng nốt 1 s/nốt thì không phải đàn vội). */
export const AHEAD_GAP = 1;
/** Nốt nghe cách nốt chờ từ ngần này (nửa cung, không phải quãng 8) → tiếng lạ. */
export const FAR = 8;

export interface WaitJudgeState {
  /** Lúc (giây) nhận nốt gần nhất; −∞ = chưa */
  okAt: number;
  /** Lúc nghe nốt gần nhất (trừ tiếng lạ) */
  heardAt: number;
  /** Phán quyết gần nhất */
  last: WaitVerdict['kind'] | null;
  /** Số nốt lệch quãng 8 liên tiếp */
  octaveRun: number;
  /** Đang đàn lại một đoạn: nhóm kế tiếp của đoạn đàn lại (−1 = không) */
  replayPos: number;
  /** Nốt có thể là "đàn vội" (khớp nhóm cur + k) — chờ nốt sau xác nhận */
  pend: { k: number; midi: number } | null;
}

export const waitJudgeInit = (): WaitJudgeState => ({ okAt: -Infinity, heardAt: -Infinity, last: null, octaveRun: 0, replayPos: -1, pend: null });

/** Kết quả hỏi micro "hai phím" quanh lần gõ: phím cần đàn (want) / phím nghe được (other) có VỪA được gõ không. */
export type PairCheck = 'both' | 'want' | 'other' | 'none' | 'unknown';

type Base =
  | { kind: 'ok' }
  /**
   * đàn vội: con trỏ đi `advance` nhóm; được NHẬN: nhóm cur + `hit` (nốt "đàn vội?" trước) và nhóm cuối (nốt này); các
   * nhóm còn lại (`skipped`) là micro lỡ → "sót"
   */
  | { kind: 'ahead'; advance: number; skipped: number; hit: number }
  /** có thể là đàn vội — chờ nốt sau */
  | { kind: 'pending' }
  | { kind: 'echo' }
  | { kind: 'replay'; from: number }
  /** cần hỏi micro hai phím rồi gọi lại với `pair` */
  | { kind: 'check'; want: number; other: number }
  | { kind: 'smudge'; other: number }
  | { kind: 'ghost' }
  /** accept: cho qua (đi tiếp, không tính "đúng ngay"); up: nốt bé đàn cao hơn */
  | { kind: 'octave'; accept: boolean; up: boolean }
  | { kind: 'wrong' };
/** `lateWrong`: nốt "đàn vội?" trước đó hóa ra là đàn sai thật (midi) — tính sai cho nhóm đang chờ TRƯỚC phán quyết này */
export type WaitVerdict = Base & { lateWrong?: number };

export interface WaitJudgeInput {
  /** các nhóm nốt (midi) của lượt */
  groups: ReadonlyArray<readonly number[]>;
  /** nhóm đang chờ */
  cur: number;
  /** chỉ số nhóm bắt đầu mỗi câu (tăng dần; nhóm 0 luôn là đầu câu) */
  phraseStarts: readonly number[];
  heard: number;
  /** giây (đồng hồ bất kỳ, tăng dần) */
  t: number;
  /** kết quả hỏi micro (lần gọi thứ hai, sau `check`); undefined = chưa hỏi; null = không hỏi được */
  pair?: PairCheck | null;
  /** Số nốt lệch quãng 8 liên tiếp được cho qua (mặc định OCTAVE_GRACE; bài luyện tìm phím: 0) */
  octaveGrace?: number;
}

/** Chỉ số nhóm đầu câu chứa nhóm `i`. */
export function phraseStartOf(phraseStarts: readonly number[], i: number): number {
  let s = 0;
  for (const p of phraseStarts) if (p <= i) s = p;
  return s;
}

/** Nhóm đầu mỗi câu từ ô nhịp của từng nhóm và các câu (ô [đầu, cuối)) — songWait: groups(c) + phraseRanges(c.tune). */
export function phraseStartsFrom(measures: readonly number[], phrases: ReadonlyArray<readonly [number, number]>): number[] {
  const out = new Set<number>([0]);
  for (const [a] of phrases) {
    const i = measures.findIndex((m) => m >= a);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

export function judgeWait(s0: WaitJudgeState, inp: WaitJudgeInput): { state: WaitJudgeState; verdict: WaitVerdict } {
  const { groups, cur, heard, t } = inp;
  const want = groups[cur] ?? [];
  let s = s0;
  let lateWrong: number | undefined;
  const done = (b: Base, patch: Partial<WaitJudgeState> = {}): { state: WaitJudgeState; verdict: WaitVerdict } => {
    const st: WaitJudgeState = { ...s, heardAt: t, last: b.kind, pend: null };
    if (b.kind === 'ok' || b.kind === 'ahead') {
      st.okAt = t;
      st.replayPos = -1;
      st.octaveRun = 0;
    }
    if (b.kind === 'octave' && b.accept) st.okAt = t;
    return { state: { ...st, ...patch }, verdict: lateWrong !== undefined ? { ...b, lateWrong } : b };
  };
  if (!want.length) return done({ kind: 'ghost' }, { heardAt: s.heardAt });
  const exact = matchHeard(heard, [...want]) !== 'none';
  const single = want.length === 1;
  const one = (g: number) => groups[g]?.length === 1 && groups[g][0] === heard;
  /** Số nhóm liền sau nhóm đang chờ lặp lại đúng nốt đó */
  const repeats = () => {
    let n = 0;
    while (want.length === 1 && groups[cur + n + 1]?.length === 1 && groups[cur + n + 1][0] === want[0]) n++;
    return n;
  };
  // 2b. Nốt "đàn vội?" trước đó: nốt này khớp nốt sau nó → bé đang đàn một mạch, micro lỡ nốt → bắt kịp
  if (s.pend) {
    const k = s.pend.k;
    if (!exact && one(cur + k + 1)) return done({ kind: 'ahead', advance: k + 2, skipped: k, hit: k });
    // nốt "đàn vội?" là nốt lặp (Sol Sol, Fa Fa) bé đàn nhanh quá, micro chỉ nghe một lần → bỏ qua cả chuỗi lặp đó
    let j = cur + k + 1;
    while (groups[j]?.length === 1 && groups[j][0] === s.pend.midi) j++;
    if (!exact && j > cur + k + 1 && one(j)) return done({ kind: 'ahead', advance: j - cur + 1, skipped: j - cur - 1, hit: k });
    // không phải → nốt kia là đàn sai thật
    lateWrong = s.pend.midi;
    s = { ...s, pend: null, last: 'wrong' };
  }
  // 4 (xét trước). Đang đàn lại một đoạn: nốt kế (hoặc lỡ 1–2 nốt) của đoạn đó
  //    Đoạn đàn lại ĐÃ bắt đầu (nốt trước là replay) → nốt kế của đoạn được ưu tiên kể cả khi trùng nốt đang chờ (bài lặp
  //    như "Khi các thánh": Đô Mi Fa Sol | Đô Mi Fa Sol — không "nhận" nhầm nốt của đoạn đàn lại cho con trỏ)
  if (s.last === 'replay' && s.replayPos >= 0 && s.replayPos < cur && groups[s.replayPos]?.includes(heard))
    return done({ kind: 'replay', from: s.replayPos }, { replayPos: s.replayPos + 1 });
  if (s.replayPos >= 0 && !exact)
    for (let j = s.replayPos; j < Math.min(cur, s.replayPos + 3); j++) if (groups[j]?.includes(heard)) return done({ kind: 'replay', from: j }, { replayPos: j + 1 });
  const ps = phraseStartOf(inp.phraseStarts, cur);
  const gap = t - s.heardAt;
  const longPause = gap >= RESTART_GAP;
  const paused = longPause || ((s.last === 'wrong' || s.last === 'smudge') && gap >= 1);
  // 1. Đúng nốt đang chờ
  if (exact) {
    // đang đàn lại mà nốt này trùng nốt đang chờ → vẫn nhận, đoạn đàn lại tiếp tục (bé chưa tới chỗ con trỏ)
    if (s.last === 'replay' && s.replayPos >= 0) return done({ kind: 'ok' }, { replayPos: s.replayPos });
    // dừng lâu rồi đàn nốt đầu câu trùng nốt đang chờ: có thể bé đàn lại từ đầu câu → sẵn sàng nhận ra đoạn đàn lại
    return done({ kind: 'ok' }, longPause && cur > ps && groups[ps]?.includes(heard) ? { replayPos: ps + 1 } : {});
  }
  // 3. Tiếng "vọng" của nốt vừa nhận
  const prev = groups[cur - 1];
  if (prev && prev.includes(heard) && t - s.okAt < ECHO_S) return done({ kind: 'echo' });
  // 2a. Đàn vội? (bé đang đàn LIỀN TAY — nốt trước vừa nghe < AHEAD_GAP s, nốt này khớp một trong vài nốt phía trước)
  //     → chờ nốt sau xác nhận
  if (single && lateWrong === undefined && (s.last === 'ok' || s.last === 'ahead' || s.last === 'echo') && gap < AHEAD_GAP)
    // nốt lặp nhanh (Mi Mi Mi Mi) micro không tách hết được → xét qua cả chuỗi nốt lặp đó
    for (let k = 1, rep = repeats(); k <= AHEAD_MAX + rep; k++) if (one(cur + k)) return done({ kind: 'pending' }, { pend: { k, midi: heard } });
  // 5. Đàn lại từ đầu câu; vừa sang câu mới → câu TRƯỚC cũng được
  const starts = [ps];
  if (cur - ps <= 1 && ps > 0) starts.push(phraseStartOf(inp.phraseStarts, ps - 1));
  if (paused && inp.pair === undefined)
    for (const p of starts) if (p < cur && groups[p]?.includes(heard)) return done({ kind: 'replay', from: p }, { replayPos: p + 1 });
  const d = single ? heard - want[0] : 0;
  const octave = single && d !== 0 && d % 12 === 0 && Math.abs(d) <= 24;
  // 6. Quá xa nốt cần đàn (không phải quãng 8) → tiếng lạ
  if (!octave && Math.min(...want.map((w) => Math.abs(w - heard))) >= FAR) return done({ kind: 'ghost' }, { heardAt: s.heardAt });
  // 7. Hỏi micro cho chắc: phím nghe được có thật sự VỪA được gõ không
  if (inp.pair === undefined) {
    const v: Base = { kind: 'check', want: want[0], other: heard };
    return { state: s, verdict: lateWrong !== undefined ? { ...v, lateWrong } : v };
  }
  const pair = inp.pair ?? 'unknown';
  if (pair === 'both') return done({ kind: 'smudge', other: heard });
  if (pair === 'want') return done({ kind: 'ok' });
  if (pair === 'none') return done({ kind: 'ghost' }, { heardAt: s.heardAt });
  // 8. Lệch quãng 8
  if (octave) {
    const run = s.octaveRun + 1;
    return done({ kind: 'octave', accept: run <= (inp.octaveGrace ?? OCTAVE_GRACE), up: d > 0 }, { octaveRun: run });
  }
  return done({ kind: 'wrong' });
}

/** Nhóm con trỏ đi tiếp (0 = đứng yên). */
export function advanceOf(v: WaitVerdict): number {
  return v.kind === 'ok' || (v.kind === 'octave' && v.accept) ? 1 : v.kind === 'ahead' ? v.advance : 0;
}

/**
 * Kết quả MicListener.verifyHands({ RH: [nốt chờ], LH: [nốt nghe] }) → PairCheck. Bộ kiểm tra hai tay (twoHand.ts) chỉ
 * nói "tay có đàn" khi họa âm riêng của phím VỪA TĂNG ở lần gõ (dây cũ còn ngân không tính), cao độ đứng yên (giọng
 * nói trượt), tiếng không to dần — đúng thứ cần để biết phím nghe được có thật sự vừa được gõ.
 */
export function pairFromHands(r: { conclusive: boolean; RH?: { verdict: string }; LH?: { verdict: string } } | null | undefined): PairCheck {
  if (!r || !r.conclusive) return 'unknown';
  const w = r.RH?.verdict === 'hit';
  const o = r.LH?.verdict === 'hit';
  return w && o ? 'both' : w ? 'want' : o ? 'other' : 'none';
}

/* ---------------- Đàn sai mãi một nốt: trợ giúp tăng dần (chế độ chờ + Từng nốt) ---------------- */

/**
 * Trợ giúp khi bé đàn sai MỘT nốt nhiều lần (micro nghe nốt sai thật, đã qua `judgeWait`):
 * 1 → nói nốt vừa đàn + nốt cần tìm · 2 → app đàn mẫu nốt cần đàn (nghe để tìm) · 3+ → chỉ phím + ngón (bàn tay mờ /
 * phím sáng) · từ MISS_SKIP lần VÀ đã ≥ MISS_SKIP_MS kể từ lần sai đầu → mời bỏ qua (bố mẹ "tiếp" / "Bỏ qua — mai ôn
 * lại"). Không mời bỏ qua quá sớm (bé bấm loạn 5 phím trong 2 giây vẫn nên thử thêm), không để bé kẹt mãi.
 */
export type MissHelp = 'say' | 'listen' | 'show' | 'skip';
export const MISS_SKIP = 5;
export const MISS_SKIP_MS = 8000;

export function missHelp(wrongs: number, sinceFirstMs: number): MissHelp {
  if (wrongs >= MISS_SKIP && sinceFirstMs >= MISS_SKIP_MS) return 'skip';
  if (wrongs >= 3) return 'show';
  if (wrongs === 2) return 'listen';
  return 'say';
}
