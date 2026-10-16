/**
 * Màn bài hát — chế độ TỪNG NỐT (chờ): con trỏ chờ bé đàn đúng (micro) hoặc bấm "Nốt tiếp"; bài hai tay đi theo
 * từng nhóm nốt cùng lúc (micro chấm riêng từng tay / kiểm hợp âm). Gồm cả "🔁 Lặp 3 lần đúng".
 * Trạng thái dùng chung: songState.ts.
 */
import { wait } from '../../audio/AudioEngine';
import { matchHeard } from '../../audio/match';
import type { HandsResult } from '../../audio/twoHand';
import { PASS_SCORE, loopStreak } from '../../music/timing';
import { phraseRanges, pitchesOf, type Onset } from '../../music/tune';
import { handsOutcome, waitOutcome } from '../../music/teacher';
import { judgeWait, missHelp, pairFromHands, phraseStartsFrom, waitJudgeInit, type MissHelp, type PairCheck } from '../../music/waitJudge';
import type { Hand } from '../../piano/fingering';
import { midiToPitch, pitchToMidi, viName } from '../../piano/pitchTable';
import { backButton, button, h } from '../components/dom';
import { LOOP_TARGET, idxOf, midisOf, onsetLabel } from './songShared';
import {
  addMiss,
  groups,
  handMidis,
  handParts,
  handSpec,
  handsLine,
  handsOn,
  handsRun,
  lightOnset,
  micOn,
  playOther,
  record,
  sameVerdict,
  setBar,
  solo,
  streakDots,
  together,
  type SongCtx,
} from './songState';
import { askParent, makeReview, showResult } from './songResult';
import { focusStepDone } from './songFocus';
import { SELF_DONE, selfStudy } from '../selfStudy';
import { READ_FIRST_WRONG_SPOT } from '../../lessons/readingAids';

export function startWait(c: SongCtx): void {
  c.token++;
  c.state = 'playing';
  c.wIdx = 0;
  c.wHits = 0;
  c.wWrongThis = 0;
  c.wWrongPass = 0;
  c.parentRun = false;
  c.missByMeasure.clear();
  c.wLog = [];
  c.wHands = [];
  c.wHandFails = 0;
  c.lastHands = null;
  c.review = null;
  c.wJudge = waitJudgeInit();
  c.wFirstWrongAt = -1;
  c.staff.clearMarks();
  c.app.mic.resetTracker();
  if (!c.loop3) c.take.start();
  showWaitNote(c);
}

/** Bước trợ giúp hiện tại của nhóm đang chờ (bé đàn sai nốt này mấy lần, từ bao giờ) */
function helpNow(c: SongCtx): MissHelp | null {
  return c.wWrongThis > 0 && c.wFirstWrongAt >= 0 ? missHelp(c.wWrongThis, performance.now() - c.wFirstWrongAt) : null;
}

export function showWaitNote(c: SongCtx): void {
  const gs = groups(c);
  const g = gs[c.wIdx];
  if (!g) return finishWait(c);
  c.staff.setCursor(idxOf(g));
  lightOnset(c, g);
  c.honesty.step();
  c.status.replaceChildren(
    h('span', { class: 'song-progress' }, `${c.wIdx + 1}/${gs.length}`),
    ' ',
    c.loop3 ? streakDots(c) : '',
    c.loop3 ? ' ' : '',
    c.hints === 'staff' ? 'Nhìn khuông nhạc — nốt đang sáng' : `Đàn ${onsetLabel(g)}`,
    c.parentRun
      ? selfStudy(c.app)
        ? ' · ✋ Đàn xong nốt thì con chạm "Con đàn xong"'
        : ' · 👪 Bố mẹ chấm giúp — đàn xong nốt thì bấm "Bố mẹ: tiếp"'
      : micOn(c)
        ? ' · 🎤'
        : '',
  );
  waitBar(c, g);
}

/**
 * (+ 2026-10-16, OWNER duyệt) Bài đang "đọc trước, nghe mẫu sau": bé đàn sai ≥ 2 lần ở cùng chỗ → mời "🎧 Nghe mẫu câu này"
 * (không ở "Lặp 3 lần", luyện chỗ khó, câu dễ kết thúc, bố mẹ chấm giúp).
 */
const listenOffer = (c: SongCtx): boolean =>
  !!c.readFirst && c.wWrongThis >= READ_FIRST_WRONG_SPOT && !c.loop3 && !c.focus && !c.easyEnd && !c.parentRun;

function waitBar(c: SongCtx, g: Onset): void {
  setBar(
    c,
    backButton(() => c.act.reset()),
    c.hints !== 'full' ? button({ icon: '💡', label: 'Gợi ý', onTap: () => hint(c, g) }) : null,
    listenOffer(c) ? button({ icon: '🎧', label: 'Nghe mẫu câu này', onTap: () => c.act.listenHere() }) : null,
    // Luôn có nút cho bố mẹ (kể cả khi micro bật) — phòng micro không nhận ra nốt; micro chưa nghe đủ hai tay 3 lần → nổi bật
    // (+ 2026-10-12) 👦 Bé tự học: nút của BÉ ("✋ Con đàn xong") — cả lượt vào hàng chờ bố mẹ xem (songResult.askParent)
    button({
      ...(selfStudy(c.app) ? SELF_DONE : { icon: '👪', label: 'Bố mẹ: tiếp' }),
      // (+ 2026-10-15) đàn sai mãi một nốt (≥ 5 lần, ≥ 8 s — missHelp 'skip') → cũng nổi bật: bố mẹ cho qua, luyện sau
      kind: c.parentRun || c.wHandFails >= 3 || helpNow(c) === 'skip' ? 'primary' : 'good',
      onTap: () => onWaitInput(c, midisOf(g)[0], 'parent'),
    }),
  );
}

function hint(c: SongCtx, g: Onset): void {
  lightOnset(c, g, true);
  c.status.textContent = `💡 ${onsetLabel(g)}`;
  const tk = c.token;
  void wait(1800).then(() => tk === c.token && c.hints !== 'full' && c.kb.setTargets([]));
}

export function onWaitInput(c: SongCtx, midi: number, from: 'mic' | 'tap' | 'parent'): void {
  const g = groups(c)[c.wIdx];
  if (!g) return;
  const match = matchHeard(midi, midisOf(g));
  const log = (c.wLog[c.wIdx] ??= { wrong: 0 });
  if (match !== 'none') {
    log.via ??= from;
    // Bố mẹ bấm "tiếp" khi micro đang bật: không tính là micro nghe đúng
    if (c.wWrongThis === 0 && !(from === 'parent' && micOn(c))) c.wHits++;
    // Chấm hai tay: nhóm chưa có kết quả từng tay (một tay / bố mẹ cho qua / cách cũ) → ghi theo cả nhóm
    if (handsOn(c)) c.wHands[c.wIdx] ??= sameVerdict(g, from === 'parent' ? 'parent' : 'hit');
    c.wHandFails = 0;
    // Chỉ tô XANH khi app thật sự nghe / thấy bé đàn đúng; bố mẹ bấm "tiếp" → dấu "đã qua" trung tính
    for (const i of idxOf(g)) c.staff.mark(i, from === 'parent' ? 'parent' : 'hit');
    if (match === 'exact') c.kb.setResult(midiToPitch(midi), 'good');
    c.wIdx++;
    c.wWrongThis = 0;
    c.wFirstWrongAt = -1;
    // Tập tách tay: app đàn khẽ các nốt tay kia từ nhóm này tới nhóm sau
    if (solo(c)) playOther(c, g.start, groups(c)[c.wIdx]?.start ?? Infinity, c.app.audio.now() + 0.02, 60 / c.bpm);
    if (from === 'mic') c.app.mic.resetTracker();
    showWaitNote(c);
  } else if (from === 'tap') {
    c.wWrongPass++;
    addMiss(c, g);
    log.wrong++;
    log.played ??= midi;
  } else if (from === 'mic') {
    // Nhiều nốt cùng lúc: micro hay nghe lẫn → không tính là sai, chỉ chỉ ra phím nghe được
    if (midisOf(g).length < 2) {
      c.wWrongThis++;
      c.wWrongPass++;
      addMiss(c, g);
      log.wrong++;
      log.played ??= midi;
      if (c.wFirstWrongAt < 0) c.wFirstWrongAt = performance.now();
      if (c.wWrongThis === READ_FIRST_WRONG_SPOT && listenOffer(c)) waitBar(c, g);
    }
    const heard = midiToPitch(midi);
    c.kb.setResult(heard, 'heard');
    const want = viName(g.pitches[0]);
    const say = `🎤 Con vừa đàn ${viName(heard)} — tìm ${want} nhé`;
    // (+ 2026-10-15) Sai mãi MỘT nốt → trợ giúp tăng dần (src/music/waitJudge.ts missHelp): nghe nốt mẫu → chỉ phím + ngón
    // → mời bố mẹ cho qua (luyện sau). Trước đây: lặp mãi một câu "Con vừa đàn … — tìm … nhé".
    const help = midisOf(g).length < 2 ? helpNow(c) : null;
    const finger = g.notes[0]?.finger;
    if (help === 'listen') {
      c.status.textContent = `${say} · 🔊 Nghe nốt ${want} nè`;
      void c.app.audio.playPitch(g.pitches[0], 0.8);
    } else if (help === 'show') {
      lightOnset(c, g, true);
      c.status.textContent = `💡 ${want} là phím đang sáng${finger ? ` — ngón ${finger}` : ''} nhé`;
    } else if (help === 'skip') {
      lightOnset(c, g, true);
      c.status.textContent = `💡 ${want} là phím đang sáng — nốt này khó, ${selfStudy(c.app) ? 'con chạm "Con đàn xong" để đi tiếp' : 'bố mẹ bấm "tiếp" được'}, mình luyện sau nhé`;
      waitBar(c, g);
    } else c.status.textContent = say;
  }
}

/** Đi tiếp qua nhóm đang chờ mà KHÔNG tính "đúng ngay" (đàn vội — micro lỡ nốt; lệch quãng 8 được cho qua). */
function passGroup(c: SongCtx, why: 'skip' | 'octave', played?: number): void {
  const g = groups(c)[c.wIdx];
  if (!g) return;
  const log = (c.wLog[c.wIdx] ??= { wrong: 0 });
  log.via ??= why === 'skip' ? 'skip' : 'mic';
  if (why === 'octave' && played !== undefined) log.octave ??= played;
  if (handsOn(c)) c.wHands[c.wIdx] ??= sameVerdict(g, 'parent');
  for (const i of idxOf(g)) c.staff.mark(i, 'parent');
  c.wIdx++;
  c.wWrongThis = 0;
  c.wFirstWrongAt = -1;
}

/**
 * (+ 2026-10-15) Micro nghe một nốt ở nhóm MỘT nốt (chế độ chờ) — bé thật, không chỉ "đàn đúng" (src/music/waitJudge.ts):
 * đúng → như trước; đàn vội (micro lỡ một nốt) → con trỏ bắt kịp; tiếng vọng / ngân nga / gõ nắp đàn / nói chuyện → bỏ
 * qua; đàn lại từ đầu câu → để bé đàn; chạm 2 phím → "chưa rõ"; lệch quãng 8 → nhắc dời tay; còn lại → đàn sai.
 * Nốt "lạ" được hỏi micro hai phím (verifyHands, ~0,3 s) trước khi tính là sai.
 */
export function onWaitMic(c: SongCtx, midi: number, at: number, pair?: PairCheck): void {
  const gs = groups(c);
  const g = gs[c.wIdx];
  if (!g) return;
  const r = judgeWait(c.wJudge, {
    groups: gs.map(midisOf),
    cur: c.wIdx,
    phraseStarts: phraseStartsFrom(
      gs.map((x) => x.notes[0].measure),
      phraseRanges(c.tune),
    ),
    heard: midi,
    t: c.app.audio.now(),
    ...(pair !== undefined ? { pair } : {}),
  });
  const v = r.verdict;
  c.wJudge = r.state;
  // Nốt "đàn vội?" trước đó hóa ra là đàn sai thật → tính sai (như trước) rồi mới xét nốt này
  if (v.lateWrong !== undefined) onWaitInput(c, v.lateWrong, 'mic');
  if (v.kind === 'check') {
    const tk = c.token;
    const idx = c.wIdx;
    void c.app.mic.verifyHands({ RH: [v.want], LH: [v.other] }, at >= 0 ? at : undefined, true).then((res) => {
      if (tk !== c.token || idx !== c.wIdx || c.state !== 'playing' || c.mode !== 'wait' || c.parentRun) return;
      onWaitMic(c, midi, at, pairFromHands(res));
    });
    return;
  }
  const name = (m: number) => viName(midiToPitch(m));
  const want = midisOf(g)[0];
  switch (v.kind) {
    case 'ok':
      return onWaitInput(c, want, 'mic');
    case 'ahead': {
      // Bé đàn một mạch nhanh hơn con trỏ, micro lỡ nốt: bắt kịp — nốt lỡ "sót" (không "đúng ngay", không "sai"),
      // hai nốt nghe được thì nhận
      for (let k = 0; k < v.advance; k++) {
        const gk = groups(c)[c.wIdx];
        if (!gk) break;
        if (k === v.hit || k === v.advance - 1) onWaitInput(c, midisOf(gk)[0], 'mic');
        else passGroup(c, 'skip');
      }
      return;
    }
    case 'pending':
    case 'echo':
    case 'ghost':
      return; // tiếng vọng / ngân nga / gõ nắp đàn / nói chuyện — không phải phím bé vừa đàn
    case 'replay':
      // Đàn lại từ đầu câu: để bé đàn, không tính sai (chỉ nhắc một lần)
      if (!c.status.textContent?.startsWith('🔁')) c.status.textContent = `🔁 Con đàn lại từ đầu câu — được nhé! Đàn tới nốt đang sáng (${name(want)}) thì đi tiếp`;
      return;
    case 'smudge':
      c.kb.setResult(midiToPitch(midi), 'heard');
      c.status.textContent = `🎤 Hình như con chạm 2 phím (${name(want)} và ${name(midi)}) — đàn một ngón ${name(want)} thôi nhé`;
      return;
    case 'octave': {
      const dir = v.up ? 'cao' : 'thấp';
      if (v.accept) {
        passGroup(c, 'octave', midi);
        c.app.mic.resetTracker();
        showWaitNote(c);
        c.status.append(` · ✓ Đúng tên nốt ${name(want)} — nhưng ${dir} hơn một quãng tám, lần sau đàn ở phím sáng nhé`);
        return;
      }
      // Lệch quãng 8 liên tiếp: GIỮ con trỏ, chỉ phím đúng (không tính là đàn sai)
      lightOnset(c, g, true);
      c.kb.setResult(midiToPitch(midi), 'heard');
      c.status.textContent = `🎵 Đúng tên nốt ${name(want)} rồi! Nhưng con đang đàn ${dir} hơn một quãng tám — dời tay ${v.up ? 'xuống' : 'lên'} phím đang sáng nhé ${v.up ? '👇' : '👆'}`;
      return;
    }
    case 'wrong':
      return onWaitInput(c, midi, 'mic');
  }
}

function finishWait(c: SongCtx): void {
  const total = groups(c).length;
  c.lastHands = handsOn(c) && groups(c).some(together) ? handsRun('wait', c.wHands.flat()) : null;
  if (c.loop3) return finishLoopPass(c, total);
  if (c.focus) return focusStepDone(c, c.wWrongPass === 0);
  c.review = makeReview(
    c,
    groups(c).map((g, i) => ({ g, ...waitOutcome(c.wLog[i], g.notes.map((n) => n.hand)) })),
  );
  if (micOn(c) && !c.parentRun) {
    const s = total ? c.wHits / total : 0;
    record(c, { mode: 'wait', total, hits: c.wHits, source: 'mic', passed: s >= PASS_SCORE });
    c.take.stop();
    showResult(c, s, `Con đàn đúng ngay ${c.wHits}/${total} nốt${c.lastHands ? handsLine(c.lastHands) : ''}`);
  } else {
    // Micro nghe chưa rõ → bố mẹ chấm cả lượt (bản ghi vẫn giữ để Nghe lại / Album)
    if (micOn(c)) c.take.stop();
    else c.take.drop();
    askParent(c, 'Bé đã đàn hết bài chưa?', total);
  }
}

/** Hết một lượt của "Lặp 3 lần": sạch (không sai nốt nào) → +1, sai → về 0; đủ 3 → ăn mừng. */
function finishLoopPass(c: SongCtx, total: number): void {
  const reset = () => c.act.reset();
  const verdict = (clean: boolean) => {
    const v = loopStreak(c.streak, clean, LOOP_TARGET);
    c.streak = v.streak;
    if (v.done) {
      c.loop3 = false;
      return showResult(c, 1, `🏆 Đúng ${LOOP_TARGET} lần liên tiếp — câu này con thuộc rồi!`);
    }
    c.state = 'rate';
    c.kb.setTargets([]);
    c.status.replaceChildren(
      streakDots(c),
      ' ',
      h('b', {}, clean ? `✓ Đúng rồi! Còn ${LOOP_TARGET - c.streak} lần nữa nào!` : 'Gần được rồi — mình đàn lại từ đầu câu nhé!'),
    );
    setBar(c, backButton(reset));
    if (clean) void c.app.audio.chime();
    const tk = c.token;
    void wait(1600).then(() => {
      if (tk === c.token && c.loop3 && !c.disposed) startWait(c);
    });
  };
  if (micOn(c)) {
    const clean = c.wHits >= total && c.wWrongPass === 0;
    record(c, { mode: 'wait', total, hits: c.wHits, source: 'mic', passed: clean });
    return verdict(clean);
  }
  if (c.wWrongPass > 0) {
    record(c, { mode: 'wait', total, hits: 0, source: 'parent', passed: false });
    return verdict(false);
  }
  c.state = 'rate';
  c.status.replaceChildren(
    streakDots(c),
    ' ',
    h('b', {}, selfStudy(c.app) ? 'Con đàn đúng hết, không sai nốt nào chứ?' : '👪 Bố mẹ: bé đàn đúng hết, không sai nốt nào chứ?'),
  );
  setBar(
    c,
    backButton(reset),
    button({
      icon: '✓',
      label: 'Đúng hết!',
      kind: 'good',
      onTap: () => {
        record(c, { mode: 'wait', total, hits: total, source: 'parent', passed: true });
        verdict(true);
      },
    }),
    button({
      icon: '↻',
      label: 'Có sai',
      kind: 'retry',
      onTap: () => {
        record(c, { mode: 'wait', total, hits: 0, source: 'parent', passed: false });
        verdict(false);
      },
    }),
  );
}

// ---------------- (+ 2026-10-09) Chấm hai tay / hợp âm bằng micro (chế độ chờ) ----------------

const HAND_VI: Record<Hand, string> = { RH: '🫱 Tay phải', LH: '🫲 Tay trái' };
/** "Tay trái chưa nghe thấy Đô" / "Tay phải đàn Fa — cần Mi" */
function handsMessage(c: SongCtx, g: Onset, r: HandsResult): string {
  const name = (m: number) => viName(midiToPitch(m));
  const parts = (['RH', 'LH'] as const).flatMap((hd) => {
    const x = r[hd];
    if (!x || x.verdict === 'hit') return [];
    const want = (x.missing.length ? x.missing : handMidis(g, hd)).map(name).join(', ');
    return [x.verdict === 'wrong' && x.heard !== undefined ? `${HAND_VI[hd]} đàn ${name(x.heard)} — cần ${want}` : `${HAND_VI[hd]} chưa nghe thấy ${want}`];
  });
  return `🎤 ${parts.join(' · ')} — đàn cùng lúc hai tay nhé${c.wHandFails >= 3 ? ' · 👪 Bố mẹ có thể bấm "tiếp"' : ''}`;
}

/**
 * Nhóm hai tay (chế độ chờ): hỏi micro từng tay ở lần gõ `at`. Đủ hai tay → đi tiếp; thiếu / nhầm → nói rõ tay nào;
 * không kết luận được (tiếng nhỏ / ồn) → cách cũ (kiểm hợp âm từ nốt nghe được).
 */
export function onWaitHands(c: SongCtx, at: number): void {
  if (Math.abs(at - c.handsAskedAt) < 0.12) return;
  c.handsAskedAt = at;
  const { app, kb } = c;
  const tk = c.token;
  const idx = c.wIdx;
  const g = groups(c)[idx];
  if (!g) return;
  const spec = handSpec(g);
  const stale = () => tk !== c.token || idx !== c.wIdx || c.state !== 'playing' || c.mode !== 'wait' || c.parentRun;
  void (async () => {
    // Khung sau (~160 ms): đủ hai tay thì đi tiếp ngay; thiếu → xem thêm khung muộn (một tay đàn trễ ~0,1 s)
    let r = await app.mic.verifyHands(spec, at, false);
    if (stale()) return;
    if (r?.conclusive && !(r.RH?.verdict === 'hit' && r.LH?.verdict === 'hit')) {
      r = await app.mic.verifyHands(spec, at, true);
      if (stale()) return;
    }
    if (!r || !r.conclusive) {
      if (c.lastHeard && c.lastHeard.at >= 0 && Math.abs(c.lastHeard.at - at) < 0.3) onWaitChord(c, c.lastHeard.midi, c.lastHeard.at);
      return;
    }
    const res = r;
    // Lần đàn ĐẦU của nhóm: kết quả từng tay (nhận xét sau bài + SongRun.hands)
    const log = (c.wLog[idx] ??= { wrong: 0 });
    log.hands ??= handsOutcome(res);
    c.wHands[idx] ??= handParts(g).map((p) => {
      const x = res[p.hand];
      return { ...p, beat: g.start, measure: g.notes[0].measure, together: true, verdict: x?.verdict ?? 'unknown', ...(x?.heard !== undefined ? { heard: x.heard } : {}) };
    });
    if (res.RH?.verdict === 'hit' && res.LH?.verdict === 'hit') {
      const first = !c.wHands[idx] || c.wHands[idx].every((x) => x.verdict === 'hit');
      onWaitInput(c, midisOf(g)[0], 'mic');
      // Đã cho đi tiếp (~160 ms). Xem kỹ thêm khung dài (~280 ms) — nhầm nửa cung ở nốt trầm / hợp âm tay trái chỉ
      // thấy ở khung dài: KHÔNG đổi điểm, chỉ ghi vào nhận xét sau bài (lần đàn đầu của nhóm)
      if (first)
        void app.mic.verifyHands(spec, at, true).then((r2) => {
          if (tk !== c.token || !r2?.conclusive) return;
          const bad = (['RH', 'LH'] as const).filter((hd) => r2[hd]?.verdict === 'wrong');
          if (!bad.length) return;
          const lg = (c.wLog[idx] ??= { wrong: 0 });
          lg.hands = handsOutcome(r2);
          c.wHands[idx] = handParts(g).map((p) => {
            const x = r2[p.hand];
            return { ...p, beat: g.start, measure: g.notes[0].measure, together: true, verdict: x?.verdict ?? 'unknown', ...(x?.heard !== undefined ? { heard: x.heard } : {}) };
          });
          addMiss(c, g);
        });
      return;
    }
    // Chưa đủ: không còn "đúng ngay"; nhầm phím = đàn sai (như nốt đơn), quên một tay thì chỉ nhắc
    c.wWrongThis++;
    c.wHandFails++;
    const wrongHand = (['RH', 'LH'] as const).find((hd) => res[hd]?.verdict === 'wrong');
    if (wrongHand) {
      c.wWrongPass++;
      addMiss(c, g);
      log.wrong++;
      log.played ??= res[wrongHand]!.heard;
    }
    for (const hd of ['RH', 'LH'] as const) {
      const x = res[hd];
      if (x?.verdict === 'hit') x.present.forEach((m) => kb.setResult(midiToPitch(m), 'good'));
      if (x?.heard !== undefined) kb.setResult(midiToPitch(x.heard), 'heard');
    }
    c.status.textContent = handsMessage(c, g, res);
    if (c.wHandFails === 3 || (c.wWrongThis === READ_FIRST_WRONG_SPOT && listenOffer(c))) waitBar(c, g);
  })();
}

/**
 * Nhóm ≥ 2 nốt (hợp âm / hai tay): hỏi micro có ĐỦ các nốt không. Đủ → đúng; thiếu → nhắc nốt bị quên
 * (không tính là sai, như trước); không kết luận được (tiếng nhỏ / ồn) → cách cũ (onWaitInput / match.ts).
 */
export function onWaitChord(c: SongCtx, midi: number, at: number): void {
  if (at >= 0 && Math.abs(at - c.chordAskedAt) < 0.05) return;
  c.chordAskedAt = at;
  const tk = c.token;
  const idx = c.wIdx;
  const g = groups(c)[idx];
  void c.app.mic.verifyChord(midisOf(g), at >= 0 ? at : undefined).then((r) => {
    if (tk !== c.token || idx !== c.wIdx || c.state !== 'playing' || c.mode !== 'wait') return;
    if (!r || !r.conclusive) return onWaitInput(c, midi, 'mic');
    if (r.missing.length === 0) return onWaitInput(c, midisOf(g)[0], 'mic');
    r.present.forEach((m) => c.kb.setResult(midiToPitch(m), 'good'));
    // Nhận xét: lần đàn ĐẦU của nhóm thiếu nốt tay nào (bài hai tay → "Tay trái chưa vào cùng tay phải")
    const log = (c.wLog[idx] ??= { wrong: 0 });
    log.missingHands ??= [
      ...new Set(r.missing.flatMap((m) => g.notes.filter((n) => pitchesOf(n).some((p) => pitchToMidi(p) === m)).map((n) => n.hand))),
    ];
    const names = r.missing.map((m) => viName(midiToPitch(m))).join(', ');
    c.status.textContent = `🎤 Con quên nốt ${names} — đàn cùng lúc cả ${midisOf(g).length} nốt nhé`;
  });
}
