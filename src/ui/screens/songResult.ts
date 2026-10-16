/**
 * Màn bài hát — KẾT QUẢ: bố mẹ chấm (không micro), màn kết quả (sao, lời nhắn thầy, nút tiếp theo),
 * nhận xét từng nốt trên khuông (+ 2026-10-09). Trạng thái dùng chung: songState.ts.
 */
import { confetti } from '../components/celebrate';
import { PASS_SCORE, starsFor } from '../../music/timing';
import { beatsPerMeasure, phraseRanges, pitchesOf, type Onset } from '../../music/tune';
import { midiToPitch, pitchToMidi, viName } from '../../piano/pitchTable';
import { backButton, button, h } from '../components/dom';
import { SONG_CHECKS, SONG_CHECKS_WAIT, parentChecklist, type CheckItem } from '../components/parentCheck';
import { speak } from '../../audio/voice';
import { cue, mascot } from '../components/mascot';
import type { ReviewMark } from '../components/staffView';
import { kindsPresent, outcomeOf, placeLabel, reviewUsable, teach, type NoteKind, type NoteReview, type RunReview, type TeacherPoint } from '../../music/teacher';
import { TEMPOS, hardestPhrase } from './songShared';
import { buildRun, buildStaff, micOn, record, setBar, solo, type ResultBack, type SongCtx } from './songState';
import { SELF_PRAISE, deferSong, selfStudy } from '../selfStudy';
import { homeworkDone, makeHomework, readHomework } from '../../lessons/homework';
import { tempoAdvice, todayTempoOutcomes } from '../../lessons/songStats';

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Chú thích màu dưới khuông (chỉ loại có trong lượt) */
const KIND_LABEL: Record<NoteKind, string> = { ok: 'đúng', wrong: 'nhầm', missed: 'sót', early: 'sớm ←', late: 'muộn →', helped: 'bố mẹ' };

/**
 * v5 — Không micro: bố mẹ chấm 3 ý (Đúng nốt · Đều nhịp · Đúng ngón & dáng tay) → SongRun.checklist;
 * lượt "đạt" khi cả 3 đều được tích (OWNER duyệt 2026-10-05).
 * v5.1 — Chế độ "Từng nốt" (chờ): app chờ bé nên không chấm nhịp → chỉ 2 ý; checklist vẫn đủ 3 khoá với
 * `beat: true` (không áp dụng = không trừ) để lessonEngine (notes && beat && fingers) giữ nguyên.
 */
export function askParent(c: SongCtx, question: string, total: number): void {
  // (+ 2026-10-12) 👦 Bé tự học: không hỏi bố mẹ — lượt cả bài vào hàng "🕑 Chờ bố mẹ xem" (kèm bản ghi nếu micro bật)
  if (selfStudy(c.app)) return deferToParent(c, total);
  c.state = 'rate';
  const waitMode = c.mode === 'wait';
  const items: ReadonlyArray<CheckItem<'notes' | 'beat' | 'fingers'>> = waitMode ? SONG_CHECKS_WAIT : SONG_CHECKS;
  const { row, done } = parentChecklist(items, (v, all) => {
    const checklist = { notes: !!v.notes, beat: waitMode ? true : !!v.beat, fingers: !!v.fingers };
    record(c, { mode: c.mode, total, hits: checklist.notes ? total : 0, source: 'parent', passed: all, checklist });
    // Lượt có 2 ô máy im mà bố mẹ tích "đều nhịp" → khen giữ nhịp trong đầu
    const heldPulse = c.mode === 'tempo' && !!c.lastDrop && checklist.beat;
    if (all) return showResult(c, 1, heldPulse ? 'Bố mẹ khen con đàn tốt! Con giữ nhịp trong đầu giỏi lắm! 🧠🥁' : 'Bố mẹ khen con đàn tốt!');
    const miss = items.filter((x) => !v[x.key]).map((x) => x.label.toLowerCase());
    showResult(c, 0.5, `Lần sau mình chú ý thêm: ${miss.join(', ')} nhé!`);
  });
  c.status.replaceChildren(h('div', { class: 'pcheck-ask' }, h('b', {}, `👪 Bố mẹ: ${question} Chạm các ý bé làm được:`), row));
  setBar(c, backButton(() => c.act.reset()), done);
}

/**
 * (+ 2026-10-12) 👦 Bé tự học: lượt CẢ BÀI (không một câu / tách tay — chỉ lượt này mới tính tiêu chí) được hoãn vào hàng
 * chờ; chỉ tính cho tiêu chí khi bố mẹ chấm "✅ Đạt" (vào đúng ngày hôm nay). Bé nhận lời tích cực, không sao, không chê.
 */
function deferToParent(c: SongCtx, total: number): void {
  const whole = !c.phrase && !solo(c) && !c.hardBack;
  if (whole) {
    const { ts: _t, source: _s, passed: _p, checklist: _c, hits: _h, hands: _hs, ...run } = { ...buildRun(c, { mode: c.mode, total, hits: 0, source: 'parent', passed: false }), ts: 0 };
    const label = `${c.full.titleVi || c.full.title} — ${c.mode === 'tempo' ? `theo nhịp ${c.bpm}` : 'từng nốt'}`;
    // Micro bật nhưng nghe chưa rõ (bố mẹ chấm giúp) → nhận xét tạm của micro
    const mic = c.parentRun && micOn(c) ? `micro nghe chưa rõ (nghe được ${c.wHits}/${total} nốt)` : undefined;
    deferSong(c.app, run, label, mic, c.take.clipNow());
  }
  showResult(c, 0, whole ? SELF_PRAISE : 'Con đàn xong rồi — giỏi lắm!', null, true);
}

export function showResult(
  c: SongCtx,
  s: number,
  text: string,
  back: (ResultBack & { practiced: boolean; clean: boolean | null }) | null = null,
  pending = false,
): void {
  const { app, opts, full, take, hooks } = c;
  c.state = 'result';
  // (+ 2026-10-15) Vừa đàn xong "câu dễ" để kết thúc bằng thành công → màn khen + "Tiếp"
  if (c.easyEnd) return easyEndCard(c);
  const stars = starsFor(s);
  // pending (bé tự học, chờ bố mẹ xem): không sao, không "Gần được rồi" — chỉ "Con đàn xong rồi! 👏"
  const passedNow = !pending && s >= PASS_SCORE;
  // (+ 2026-10-15, OWNER duyệt — "3 lần đúng") Bài của BUỔI HỌC (không Thư viện / sân khấu / bước ôn / khởi động):
  // đếm lần thử chưa được; đủ MAX_TRIES → dừng nhẹ nhàng + kết thúc bằng câu dễ
  const lessonFlow = !opts.stage && !opts.free && !opts.review;
  const failedNow = !pending && !passedNow && !opts.stage;
  if (!back && failedNow) c.fails++;
  if (back?.practiced && back.clean === false) c.fails++;
  const tired = lessonFlow && c.fails >= MAX_TRIES && ((!back && failedNow) || (!!back?.practiced && back.clean === false));
  // Quay về từ "🎯 Luyện ngay chỗ này": vẽ lại màn kết quả cũ, không chúc mừng / đọc / lưu Album lần nữa
  if (passedNow && !back) {
    void app.audio.chime();
    confetti();
  }
  if (opts.stage && !back) app.audio.applause();
  // Nhận xét kiểu thầy giáo: MỘT lời nhắn chính + màu từng nốt (không ở sân khấu)
  const rv = back ? back.review : !opts.stage && reviewUsable(c.review) ? c.review : null;
  const pointKey = `${full.id}|${c.phrase?.join('-') ?? ''}|${c.handSel}|${c.mode}`;
  const point = back ? back.point : rv ? teach(rv, c.lastPoint?.key === pointKey ? c.lastPoint.point : null) : null;
  if (!back && point) c.lastPoint = { key: pointKey, point };
  if (rv) showReview(c, rv, point);
  const focusRange = point?.focus && rv && !opts.stage && !c.hardBack ? point.focus : null;
  const place = focusRange && rv ? placeLabel(rv, focusRange) : '';
  // (+ 2026-10-16, cách dạy của thầy) LÙI TỐC ĐỘ: vừa lên nấc mà 2 lượt liền chưa đạt → lùi một nấc (≥ 40), lượt sau mở sẵn
  // tốc độ đó; ở tốc độ đã lùi phải đạt 2 lượt liền mới lại gợi ý "🐇 Nhanh hơn" (songStats.tempoAdvice)
  const advice =
    !pending && c.mode === 'tempo' && !opts.stage && !full.id.startsWith('sight') ? tempoAdvice(todayTempoOutcomes(app.store.get(), full.id, c.phrase)) : null;
  const pullTo = !back && !passedNow && advice?.pullTo ? advice.pullTo : null;
  if (pullTo) c.bpm = pullTo;
  const pullText = pullTo ? `Mình về tốc độ ${pullTo} cho chắc tay nhé` : '';
  // (+ 2026-10-15) 📝 Bài tập về nhà: giao chỗ thầy dặn (lượt chưa đạt / có chỗ cần luyện), xóa khi đã đạt chỗ đó
  if (!back && !pending) homeworkAfterRun(c, passedNow, point, focusRange, place);
  if (tired) return stopCard(c, 'tired');
  // (+ 2026-10-15) "xong" luyện chỗ khó cần ÍT NHẤT MỘT lượt sạch — chưa sạch lượt nào thì luyện tiếp (nút chính vẫn là 🎯)
  const notClean = !!back?.practiced && back.clean === false;
  const afterPractice = back?.practiced
    ? notClean
      ? `${place} chưa sạch lần nào — mình luyện thêm chút nhé!`
      : `Luyện xong ${place.toLowerCase()}! Giờ chơi lại ${c.phrase ? 'nhé' : 'cả bài nhé'}!`
    : '';
  // Thang tốc độ: đạt ở tốc độ chậm → gợi ý lên nấc tiếp (40 → 50 → 60 → 72)
  const nextTempo = TEMPOS.find((t) => t > c.bpm);
  // Thầy nhắc một chỗ cần sửa → luyện chỗ đó trước ("🎯"), chưa gợi ý nhanh hơn (thanh nút tối đa 4 nút)
  const faster = !opts.stage && c.mode === 'tempo' && passedNow && !(focusRange && point && !point.praise) && !advice?.hold ? nextTempo : undefined;
  // Lặp câu khó: chỉ khi vừa chơi CẢ bài có lỗi (thanh nút tối đa 4 nút → nhường chỗ cho "Nhanh hơn")
  // (2026-10-09) Thầy đã chỉ ra chỗ cần luyện → "🎯 Luyện ngay chỗ này" thay cho "Lặp câu khó"
  const hard = !focusRange && !opts.stage && !opts.review && !c.phrase && !faster ? hardestPhrase(phraseRanges(full), c.missByMeasure) : null;
  // Chưa đạt (không phải sân khấu): Bé Nốt suy nghĩ + MỘT lời nhắn to, rõ + MỘT nút chính (Lặp câu khó / Chơi lại)
  const retryCard = !passedNow && !opts.stage && !pending;
  const headline = retryCard ? 'Gần được rồi! 💪' : passedNow ? pick(['Tuyệt vời! 🎉', 'Siêu quá! 🦸', 'Đỉnh của chóp! 🚀']) : 'Con đàn xong rồi! 👏';
  const nextStep = afterPractice
    ? afterPractice
    : pullText
      ? pullText
      : point
      ? point.text
      : retryCard
        ? hard
          ? `Mình luyện câu ${hard.index + 1} — câu khó nhất — nhé!`
          : c.hardBack
            ? 'Mình lặp lại câu này nhé!'
            : 'Mình chơi lại thật chậm nhé!'
        : '';
  // 🎧 Nghe lại: ô trống, có bản ghi (tới sau, bất đồng bộ) thì take.render() điền nút + một câu hỏi nhẹ
  c.status.replaceChildren(
    h(
      'div',
      { class: `song-result${retryCard ? ' is-retry' : ' is-pass'}` },
      h('div', { class: `song-result-mascot ${retryCard ? 'react-scratch' : 'react-bounce'}` }, mascot(retryCard ? cue('retry') : cue('praise'), 64)),
      h(
        'div',
        { class: 'song-lines' },
        h('div', { class: 'song-result-head' }, headline, ' ', pending ? '' : h('span', { class: 'stars small' }, '★'.repeat(stars), h('span', { class: 'stars-off' }, '★'.repeat(3 - stars)))),
        h('div', { class: 'song-result-sub' }, text),
        nextStep
          ? h('div', { class: `song-result-next${(point || pullText) && !afterPractice ? ' teacher' : ''}` }, `${afterPractice ? '✅' : point || pullText ? '🧑‍🏫' : '👉'} ${nextStep}`)
          : null,
        take.makeSlot(),
      ),
    ),
  );
  take.render();
  // Album: chỉ lượt CẢ BÀI, hai tay như bài (không phải một câu / tách tay / lặp câu khó)
  if (!back) take.offerAlbum(!pending && !c.phrase && !solo(c) && !c.hardBack ? { stars, accuracy: s } : null);
  if (back) {
    if (afterPractice) void speak(app, afterPractice);
  } else if (retryCard) void speak(app, `Gần được rồi! ${nextStep}`);
  else if (pending) void speak(app, text);
  else if (point) void speak(app, point.text);
  const reset = () => c.act.reset();
  const again = button({
    icon: '↻',
    label: c.hardBack ? 'Lặp lại' : 'Chơi lại',
    kind: (retryCard && !hard && !focusRange) || (back && !notClean) ? 'primary' : undefined,
    onTap: reset,
  });
  const practice =
    focusRange && rv && point && !faster
      ? button({
          icon: '🎯',
          // (+ 2026-10-15, OWNER duyệt) chưa đạt → nút CHÍNH: chậm 2 lượt rồi đúng tốc độ 1 lượt (teacher.focusPlan)
          label: back ? 'Luyện lại chỗ khó' : 'Luyện chỗ khó',
          kind: (retryCard && !back) || notClean ? 'primary' : undefined,
          onTap: () => c.act.startFocus({ s, text, mode: c.mode, phrase: c.phrase, bpm: c.bpm, review: rv, point }, focusRange, place),
        })
      : null;
  practice?.classList.add('btn-focus');
  setBar(
    c,
    opts.stage ? null : backButton(() => hooks.onBack()),
    opts.stage ? null : again,
    faster ? button({ icon: '🐇', label: `Nhanh hơn (${faster})`, onTap: () => ((c.bpm = faster), reset()) }) : null,
    hard ? button({ icon: '🔁', label: 'Lặp câu khó', kind: 'primary', onTap: () => c.act.openHard(hard.range) }) : null,
    practice,
    c.hardBack ? button({ icon: '↩', label: 'Cả bài', onTap: () => ((c.phrase = c.hardBack?.phrase ?? null), reset()) }) : null,
    // Chưa đạt: "Tiếp" vẫn có (không khóa bé) nhưng là nút phụ — nút chính là luyện lại
    // (+ 2026-10-15) Bài của buổi học: "Tiếp" sau lượt chưa đạt → kết thúc bằng một câu dễ trước (stopCard), không dừng ở thất bại
    c.hardBack
      ? null
      : button({ icon: '▶', label: 'Tiếp', kind: retryCard || back ? undefined : 'primary', onTap: lessonFlow && retryCard ? () => stopCard(c, 'skip') : hooks.onDone }),
  );
}

/* ---------------- (+ 2026-10-15, OWNER duyệt — rà soát của giáo viên) "3 lần đúng" · dừng ở thành công ---------------- */

/** Thử chưa được ngần này lần trong một lần mở bài (lượt chưa đạt / luyện chỗ khó không lượt nào sạch) → dừng nhẹ nhàng. */
export const MAX_TRIES = 3;

/** Lời dừng nhẹ nhàng sau MAX_TRIES lần thử chưa được */
export const KIND_STOP = 'Hôm nay con cố gắng lắm rồi — mai mình luyện tiếp nhé!';
/** Lời cho BỐ MẸ (vùng nhắc bố mẹ): dừng ở đây, kết thúc bằng thành công */
export const PARENT_STOP = '👪 Bố mẹ: dừng ở đây — bé đã cố gắng. Cho bé đàn một câu dễ để kết thúc vui; chỗ khó để buổi sau (📝 bài tập về nhà).';

/**
 * Màn DỪNG: 'tired' = đủ MAX_TRIES lần thử chưa được ("Hôm nay con cố gắng lắm rồi…"); 'skip' = bé chạm "Tiếp" sau lượt
 * chưa đạt. Nút chính "🌟 Đàn câu dễ" (kết thúc bằng thành công); "Tiếp" vẫn có. Lượt chưa đạt vẫn KHÔNG đạt (tiêu chí /
 * "thuộc" không đổi); hoạt động được tính là đã LÀM (buổi học đi tiếp).
 */
export function stopCard(c: SongCtx, why: 'tired' | 'skip'): void {
  c.state = 'result';
  const head = why === 'tired' ? `${KIND_STOP} 💛` : 'Mình tạm dừng bài này nhé! 💛';
  c.status.replaceChildren(
    h(
      'div',
      { class: 'song-result is-stop' },
      h('div', { class: 'song-result-mascot react-bounce' }, mascot(cue('praise'), 64)),
      h(
        'div',
        { class: 'song-lines' },
        h('div', { class: 'song-result-head' }, head),
        h('div', { class: 'song-result-sub' }, 'Mình kết thúc bằng một câu con đàn hay nhất nhé 🌟'),
        h('div', { class: 'song-result-parent' }, PARENT_STOP),
      ),
    ),
  );
  void speak(c.app, why === 'tired' ? KIND_STOP : 'Mình tạm dừng bài này nhé! Kết thúc bằng một câu con đàn hay nhất nào.');
  setBar(
    c,
    backButton(() => c.hooks.onBack()),
    button({ icon: '🌟', label: 'Đàn câu dễ', kind: 'primary', onTap: () => startEasyEnd(c) }),
    button({ icon: '▶', label: 'Tiếp', onTap: c.hooks.onDone }),
  );
}

/** Câu dễ để kết thúc: câu (phraseRanges) ít lỗi nhất ở lượt vừa chơi (hoà → câu đầu), tối đa 2 ô nhịp. */
export function easyRange(ranges: ReadonlyArray<[number, number]>, missByMeasure: ReadonlyMap<number, number>): [number, number] {
  let best: { r: [number, number]; misses: number } | null = null;
  for (const r of ranges) {
    let misses = 0;
    for (const [m, n] of missByMeasure) if (m >= r[0] && m < r[1]) misses += n;
    if (!best || misses < best.misses) best = { r, misses };
  }
  const [a, b] = best?.r ?? [0, 1];
  return [a, Math.max(a + 1, Math.min(b, a + 2))];
}

/** Đàn "câu dễ" (Từng nốt, phím sáng; bài hai tay → một tay): lượt ghi phrase ≠ null → không đổi tiêu chí / "thuộc". */
function startEasyEnd(c: SongCtx): void {
  const range = easyRange(phraseRanges(c.full), c.missByMeasure);
  c.focus = null;
  c.hardBack = null;
  c.loop3 = false;
  c.easyEnd = true;
  c.mode = 'wait';
  c.hints = 'full';
  c.phrase = range;
  if (c.twoHand) c.handSel = 'RH';
  c.act.reset();
  void c.act.start();
}

/** Xong "câu dễ": khen (thành công) + nhắc bố mẹ dừng ở đây → "Tiếp" là nút chính. */
function easyEndCard(c: SongCtx): void {
  c.state = 'result';
  c.easyEnd = false;
  void c.app.audio.chime();
  confetti();
  c.status.replaceChildren(
    h(
      'div',
      { class: 'song-result is-pass' },
      h('div', { class: 'song-result-mascot react-bounce' }, mascot(cue('praise'), 64)),
      h(
        'div',
        { class: 'song-lines' },
        h('div', { class: 'song-result-head' }, 'Đẹp lắm! 🌟'),
        h('div', { class: 'song-result-sub' }, 'Con kết thúc bằng một câu thật hay — giỏi lắm!'),
        h('div', { class: 'song-result-parent' }, '👪 Bố mẹ: dừng ở đây — bé đã cố gắng. Khen bé một câu rồi sang phần tiếp nhé.'),
      ),
    ),
  );
  void speak(c.app, 'Đẹp lắm! Con kết thúc bằng một câu thật hay — giỏi lắm!');
  setBar(c, backButton(() => c.hooks.onBack()), button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: c.hooks.onDone }));
}

/**
 * 📝 Bài tập về nhà sau một lượt của BUỔI HỌC: chưa đạt / thầy chỉ ra chỗ cần luyện → giao (chỗ đó, chậm hơn một nấc);
 * lượt ĐẠT đúng chỗ đã giao (cả bài, hoặc câu chứa chỗ đó) → xóa. Không giao ở Thư viện / sân khấu / bước ôn / đọc nhạc.
 */
function homeworkAfterRun(c: SongCtx, passed: boolean, point: TeacherPoint | null, focus: [number, number] | null, place: string): void {
  const { app, opts, full } = c;
  if (opts.stage || full.id.startsWith('sight')) return;
  const store = app.store;
  const cur = readHomework(store.settings);
  if (passed && cur && homeworkDone(cur, { songId: full.id, passed: true, phrase: c.phrase, hand: solo(c) ?? undefined }, Date.now()) && !(point && !point.praise && focus)) {
    store.updateSettings({ homework: null });
    return;
  }
  if (opts.free || opts.review || c.easyEnd) return;
  const needs = !passed || (!!point && !point.praise && !!focus);
  if (!needs) return;
  const off = c.phrase ? c.phrase[0] : 0;
  const ranges = phraseRanges(full);
  let phrase: [number, number] | null = c.phrase;
  let where = '';
  if (focus) {
    phrase = [focus[0] + off, focus[1] + off];
    where = place;
  } else if (!c.phrase) {
    const hard = hardestPhrase(ranges, c.missByMeasure);
    if (hard) {
      phrase = hard.range;
      where = `Câu ${hard.index + 1}`;
    }
  }
  if (!where) {
    const k = phrase ? ranges.findIndex(([a, b]) => a === phrase![0] && b === phrase![1]) : -1;
    where = !phrase ? 'Cả bài' : k >= 0 ? `Câu ${k + 1}` : `Ô ${phrase[0] + 1}–${phrase[1]}`;
  }
  store.updateSettings({
    homework: makeHomework({
      songId: full.id,
      title: full.titleVi || full.title,
      phrase,
      place: where,
      mode: c.mode,
      bpm: c.bpm,
      date: store.today(),
      at: Date.now(),
    }),
  });
}

// ---------------- (+ 2026-10-09) Nhận xét kiểu thầy giáo ----------------

/** Nhận xét từng nhóm nốt của lượt đang mở (bài / câu đang chơi) */
export function makeReview(c: SongCtx, items: Array<{ g: Onset } & Partial<Omit<NoteReview, 'notes' | 'start' | 'measure'>>>): RunReview {
  return {
    mode: c.mode,
    beatsPerMeasure: beatsPerMeasure(c.tune),
    phrases: phraseRanges(c.tune),
    measureOffset: c.phrase ? c.phrase[0] : 0,
    hints: c.hints,
    notes: items.map(({ g, ...r }) => ({
      kind: 'ok',
      ...r,
      notes: g.notes.map((n) => ({ index: n.index, hand: n.hand, midi: pitchesOf(n).map(pitchToMidi), beats: n.beats, finger: n.finger })),
      start: g.start,
      measure: g.notes[0].measure,
    })),
  };
}

/**
 * Màn kết quả: khuông (từng trang) tô màu từng nốt — xanh đúng · đỏ nhầm (+ tên nốt con đàn) · xám rỗng sót ·
 * cam sớm/muộn (← / →); bài hai tay có kết quả riêng tay thì tô theo tay. Mở sẵn trang có chỗ thầy nhắc.
 */
function showReview(c: SongCtx, rv: RunReview, point: TeacherPoint | null): void {
  buildStaff(c, true);
  const staff = c.staff;
  const marks = new Map<number, ReviewMark>();
  const short = (midi: number) => viName(midiToPitch(midi)).replace(' thăng', '♯').replace(' giáng', '♭');
  for (const n of rv.notes) {
    for (const x of n.notes) {
      const o = outcomeOf(n, x.hand);
      const tag = o.kind === 'wrong' && o.played !== undefined ? short(o.played) : o.kind === 'early' ? '←' : o.kind === 'late' ? '→' : undefined;
      marks.set(x.index, { kind: o.kind, tag });
    }
  }
  staff.setReview(marks);
  staff.clearMarks();
  const firstBad = rv.notes.find((n) => n.kind !== 'ok' && n.kind !== 'helped')?.measure;
  staff.showMeasure(point?.focus?.[0] ?? firstBad ?? 0);
  const kinds = kindsPresent(rv);
  const pages = staff.pageCount();
  if (kinds.length < 2 && pages < 2) return;
  const pageLabel = h('span', { class: 'rv-page' }, '');
  const setLabel = () => (pageLabel.textContent = `${staff.currentPage() + 1}/${pages}`);
  const turn = (d: number) =>
    h(
      'button',
      { class: 'rv-turn', type: 'button', 'aria-label': d < 0 ? 'Trang trước' : 'Trang sau', onClick: () => (staff.turnPage(d), setLabel()) },
      d < 0 ? '‹' : '›',
    );
  setLabel();
  staff.el.classList.add('rv-on');
  staff.el.append(
    h(
      'div',
      { class: 'rv-row' },
      h('div', { class: 'rv-legend' }, ...(kinds.length > 1 ? kinds.map((k) => h('span', { class: `rv-key rv-${k}` }, h('i', {}), KIND_LABEL[k])) : [])),
      pages > 1 ? h('div', { class: 'rv-nav' }, turn(-1), pageLabel, turn(1)) : null,
    ),
  );
}
