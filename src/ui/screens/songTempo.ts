/**
 * Màn bài hát — chế độ THEO NHỊP: đếm vào, máy gõ nhịp + nhạc đệm (Mức 2 con trỏ nhảy, Mức 3 băng chuyền),
 * micro chấm đúng nhịp (+ chấm từng tay ở nhóm hai tay), "giữ nhịp trong đầu" (máy im 2 ô).
 * Trạng thái dùng chung: songState.ts.
 */
import type { HandsResult } from '../../audio/twoHand';
import { gradeHandsTempo, type HandNoteResult, type HandsProbe } from '../../music/handGrade';
import {
  PASS_SCORE,
  countInBeats,
  countInLabel,
  gradePulseDrop,
  gradeTiming,
  pulseMessage,
  score as scoreOf,
  type HeardEvent,
} from '../../music/timing';
import { beatsPerMeasure, metronomeAccent, totalBeats, type Onset } from '../../music/tune';
import { analyzeTempo, handsOutcome, type NoteReview } from '../../music/teacher';
import { button, h } from '../components/dom';
import { MIC_LATENCY, idxOf, midisOf } from './songShared';
import {
  addMiss,
  groupAt,
  groups,
  handParts,
  handSpec,
  handsLine,
  handsOn,
  handsRun,
  lightOnset,
  micOn,
  playOther,
  pulseWindow,
  record,
  sameVerdict,
  scheduleAccomp,
  setBar,
  solo,
  together,
  type SongCtx,
} from './songState';
import { askParent, makeReview, showResult } from './songResult';
import { focusStepDone } from './songFocus';

/** Con trỏ/băng chuyền theo phách hiện tại. */
function follow(c: SongCtx, beat: number): Onset | undefined {
  const gs = groups(c);
  const cur = groupAt(gs, beat);
  if (c.mode === 'tempo' && c.level === 3) c.staff.setTime(Math.max(0, beat));
  if (cur) c.staff.setCursor(idxOf(cur));
  if (c.hints === 'full') {
    const upcoming = gs.find((g) => g.start >= beat - 0.05 && g.start - beat < 0.5) ?? cur;
    if (upcoming !== c.litOnset) lightOnset(c, upcoming);
  }
  return cur;
}

export function startTempo(c: SongCtx): void {
  const { app, win, take, status } = c;
  const tune = c.tune;
  const tk = ++c.token;
  c.state = 'countin';
  c.staff.clearMarks();
  c.missByMeasure.clear();
  c.review = null;
  take.drop();
  const spb = 60 / c.bpm;
  const bpmM = beatsPerMeasure(tune);
  const lead = countInBeats(bpmM);
  const t0 = app.audio.now() + 0.4 + lead * spb; // phách 0 của bài
  const total = totalBeats(tune);
  // Giữ nhịp trong đầu: 2 ô giữa bài không có tiếng tích (cũng không nhạc đệm / tay kia)
  const drop = pulseWindow(c);
  c.lastDrop = drop;
  const muted = (b: number) => !!drop && b >= drop[0] - 1e-6 && b < drop[1] - 1e-6;
  // Tiếng "tích" nhấn mạnh ở phách 1 mỗi ô (2/4: mạnh–nhẹ, 3/4: mạnh–nhẹ–nhẹ, 4/4: mạnh–nhẹ–nhẹ–nhẹ;
  // 6/8: mạnh–nhẹ–nhẹ–VỪA–nhẹ–nhẹ — phách 4 nhấn phụ)
  for (let b = -lead; b < total; b++) if (!muted(b)) app.audio.click(t0 + b * spb, metronomeAccent(tune, b));
  scheduleAccomp(c, t0, spb, drop);
  // Tập tách tay: app đàn khẽ tay kia đúng nhịp
  if (solo(c)) playOther(c, 0, Infinity, t0, spb, drop);
  const heard: HeardEvent[] = [];
  const gs = groups(c);
  const gradeInput = gs.map((g) => ({ index: g.notes[0].index, start: g.start, midi: midisOf(g) }));
  const markGroup = (firstIndex: number, m: 'hit' | 'miss') => {
    const g = gs.find((x) => x.notes[0].index === firstIndex);
    if (g) for (const i of idxOf(g)) c.staff.mark(i, m);
  };
  c.unTempo();
  // Bé đàn theo tiếng tích NGHE THẤY (trễ loa), tiếng đàn tới app trễ thêm (micro) → trừ độ trễ khứ hồi
  // đã đo ở "Thử micro → Đo độ trễ" (chưa đo: ước lượng outputLatency của trình duyệt như trước)
  const outLat = app.mic.inputOutputLatency();
  // (+ 2026-10-09) Chấm hai tay: nhóm hai tay chỉ tô xanh khi micro nghe đủ CẢ HAI tay (lần gõ → twoHand.ts)
  const useHands = handsOn(c);
  const handGroup = new Set(useHands ? gs.filter(together).map((g) => g.notes[0].index) : []);
  const unNote = app.mic.onNote((n) => {
    const at = n.at ?? app.audio.now() - MIC_LATENCY;
    heard.push({ beat: (at - outLat - t0) / spb, midi: n.midi });
    gradeTiming(gradeInput, heard, win.early, win.late).forEach((r) => r.hit && !handGroup.has(r.index) && markGroup(r.index, 'hit'));
  });
  /** Mỗi lần gõ: kiểm tra hai tay cho các nhóm hai tay có cửa sổ chấm chứa lần gõ (kết quả ~0,3 s sau) */
  const probes = new Map<number, HandsProbe[]>();
  const pendingHands: Array<Promise<void>> = [];
  const unOnset = useHands
    ? app.mic.onOnset((at) => {
        const beat = (at - outLat - t0) / spb;
        gs.forEach((g, gi) => {
          if (!handGroup.has(g.notes[0].index) || beat - g.start < -win.early || beat - g.start > win.late) return;
          pendingHands.push(
            app.mic.verifyHands(handSpec(g), at, true).then((r: HandsResult | null) => {
              if (!r || tk !== c.token) return;
              const pr: HandsProbe = { beat, conclusive: r.conclusive, RH: r.RH?.verdict, LH: r.LH?.verdict, heardRH: r.RH?.heard, heardLH: r.LH?.heard };
              probes.set(gi, [...(probes.get(gi) ?? []), pr]);
              if (r.conclusive && r.RH?.verdict === 'hit' && r.LH?.verdict === 'hit') markGroup(g.notes[0].index, 'hit');
            }),
          );
        });
      })
    : () => undefined;
  c.tempoExpect = (at) => {
    const beat = (at - outLat - t0) / spb;
    return gs.filter((g) => Math.abs(g.start - beat) <= 1).map(midisOf).filter((ms) => ms.length === 1).map((ms) => ms[0]);
  };
  c.unTempo = () => (unNote(), unOnset(), (c.tempoExpect = null));
  app.mic.resetTracker();
  const countEl = h('div', { class: 'countin' });
  // Đếm to theo phần đếm vào: "1 – 2 – 3 – 4"
  status.replaceChildren(
    countEl,
    h('div', { class: 'countin-say' }, `Đếm to theo nhé! ${Array.from({ length: bpmM }, (_, k) => k + 1).join(' – ')}`),
  );
  setBar(c, button({ icon: '⏹', label: 'Dừng', onTap: () => (unNote(), c.act.reset()) }));
  const playingLine = () => h('span', {}, micOn(c) ? '🎤 Đàn theo nhịp — app đang nghe' : '🎵 Đàn theo tiếng "tích"!');
  /** Đang hiện dòng "máy im" chưa (chỉ thay DOM khi đổi) */
  let silentShown = false;
  const loop = () => {
    if (tk !== c.token) return void c.unTempo();
    const beat = (app.audio.now() - t0) / spb;
    if (c.state === 'playing' && drop && muted(beat) !== silentShown) {
      silentShown = !silentShown;
      status.replaceChildren(
        silentShown ? h('span', { class: 'pulse-silent' }, '🤫 Máy im — con đếm thầm trong đầu, đàn tiếp nhé!') : playingLine(),
      );
    }
    if (beat < 0) {
      // Chỉ ghi khi số đếm đổi (ghi textContent mỗi khung hình = tính lại bố cục mỗi khung hình)
      const label = beat < -lead ? ' ' : String(countInLabel(beat, bpmM, lead));
      if (countEl.textContent !== label) countEl.textContent = label;
    } else {
      if (c.state === 'countin') {
        c.state = 'playing';
        take.start(); // hết đếm vào → bắt đầu ghi (chỉ khi micro bật)
        status.replaceChildren(playingLine());
      }
      follow(c, beat);
    }
    if (beat < total + 0.6) c.raf = requestAnimationFrame(loop);
    else {
      c.unTempo();
      // Chờ các lần kiểm tra hai tay còn dở (≤ 0,3 s) rồi mới chấm
      void Promise.all(pendingHands).then(() => {
        if (tk === c.token && !c.disposed) finishTempo(c, gradeInput, heard, markGroup, drop, bpmM, useHands ? probes : null);
      });
    }
  };
  c.raf = requestAnimationFrame(loop);
}

function finishTempo(
  c: SongCtx,
  gradeInput: Array<{ index: number; start: number; midi: number[] }>,
  heard: HeardEvent[],
  markGroup: (i: number, m: 'hit' | 'miss') => void,
  drop: [number, number] | null = null,
  bpmM = 4,
  probes: Map<number, HandsProbe[]> | null = null,
): void {
  const { win, take } = c;
  c.kb.setTargets([]);
  c.lastHands = null;
  // (+ 2026-10-09) Chấm hai tay: kết quả từng tay của các nhóm hai tay (micro không kết luận được → giữ cách cũ)
  const handRes = new Map<number, HandNoteResult[]>();
  if (probes && micOn(c))
    groups(c).forEach((g, gi) => {
      if (!together(g)) return;
      const rs = gradeHandsTempo([{ beat: g.start, measure: g.notes[0].measure, parts: handParts(g) }], probes.get(gi) ?? [], win.early, win.late);
      if (!rs.some((x) => x.verdict === 'unknown')) handRes.set(gi, rs);
    });
  /** Kết quả "một cao độ" (gradeTiming); các nhóm hai tay thay bằng kết quả từng tay: đúng khi CẢ HAI tay đúng */
  const timingWithHands = () => {
    const v = gradeTiming(gradeInput, heard, win.early, win.late);
    for (const [gi, rs] of handRes) {
      const hit = rs.every((x) => x.verdict === 'hit');
      const offs = rs.map((x) => x.offset ?? 0);
      v[gi] = hit ? { index: v[gi].index, hit, offset: offs.reduce((a, b) => a + b, 0) / offs.length } : { index: v[gi].index, hit: false };
    }
    return v;
  };
  if (c.focus) {
    // 🎯 Luyện một chỗ: chỉ tô xanh/cam rồi sang bước sau (không ghi lượt, không hỏi bố mẹ)
    const v = micOn(c) ? timingWithHands() : null;
    v?.forEach((r) => markGroup(r.index, r.hit ? 'hit' : 'miss'));
    return focusStepDone(c, v ? scoreOf(v) >= PASS_SCORE : null);
  }
  if (micOn(c)) {
    const v = timingWithHands();
    v.forEach((r) => markGroup(r.index, r.hit ? 'hit' : 'miss'));
    const gs = groups(c);
    const tv: Array<Partial<Omit<NoteReview, 'notes' | 'start' | 'measure'>>> = analyzeTempo(gradeInput, heard, v, win);
    for (const [gi, rs] of handRes) {
      const res = Object.fromEntries(
        rs.map((x) => [x.hand, { verdict: x.verdict === 'hit' ? 'hit' : x.verdict === 'wrong' ? 'wrong' : 'miss', ...(x.heard !== undefined ? { heard: x.heard } : {}) }]),
      ) as Pick<HandsResult, 'RH' | 'LH'>;
      const hs = handsOutcome({ conclusive: true, ...res });
      for (const x of rs) if (hs?.[x.hand] && x.offset !== undefined) hs[x.hand]!.offset = x.offset;
      const wrong = rs.find((x) => x.verdict === 'wrong');
      tv[gi] = v[gi].hit
        ? { kind: 'ok', offset: v[gi].offset, ...(hs ? { hands: hs } : {}) }
        : { kind: wrong ? 'wrong' : 'missed', ...(wrong?.heard !== undefined ? { played: wrong.heard } : {}), ...(hs ? { hands: hs } : {}) };
    }
    c.review = makeReview(
      c,
      gs.map((g, i) => ({ g, ...tv[i] })),
    );
    if (handRes.size)
      c.lastHands = handsRun(
        'tempo',
        gs.flatMap((g, i) => handRes.get(i) ?? sameVerdict(g, v[i].hit ? 'hit' : 'miss', v[i].hit ? v[i].offset : undefined)),
      );
    v.forEach((r) => !r.hit && addMiss(c, gs.find((g) => g.notes[0].index === r.index)));
    let s = scoreOf(v);
    const hits = v.filter((r) => r.hit).length;
    // Giữ nhịp trong đầu: chấm riêng các nốt trong 2 ô máy im. Là thử thách THÊM — lượt vẫn đạt nếu phần có tiếng
    // tích đạt (không để bé trượt tiêu chí tuần chỉ vì lúc máy im)
    const pv = drop ? gradePulseDrop(gradeInput, v, drop) : null;
    const passed = s >= PASS_SCORE || (!!pv && pv.held !== null && pv.outsideScore >= PASS_SCORE);
    if (passed) s = Math.max(s, pv?.outsideScore ?? 0);
    record(c, { mode: 'tempo', total: v.length, hits, source: 'mic', passed });
    take.stop();
    const pulse = pv ? pulseMessage(pv, bpmM) : '';
    const handTxt = c.lastHands ? handsLine(c.lastHands) : c.tune.lh ? ' (micro nghe một nốt mỗi lúc)' : '';
    showResult(c, s, `Đúng nhịp ${hits}/${v.length} nốt${handTxt}${pulse ? ` · ${pulse}` : ''}`);
  } else {
    take.drop();
    askParent(c, drop ? 'Bé giữ nhịp đều (cả lúc máy im) và đàn trọn bài chưa?' : 'Bé giữ nhịp đều và đàn trọn bài chưa?', gradeInput.length);
  }
}
