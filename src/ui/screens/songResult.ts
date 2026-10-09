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
import { mascot } from '../components/mascot';
import type { ReviewMark } from '../components/staffView';
import { kindsPresent, outcomeOf, placeLabel, reviewUsable, teach, type NoteKind, type NoteReview, type RunReview, type TeacherPoint } from '../../music/teacher';
import { TEMPOS, hardestPhrase } from './songShared';
import { buildStaff, record, setBar, solo, type ResultBack, type SongCtx } from './songState';

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

export function showResult(c: SongCtx, s: number, text: string, back: (ResultBack & { practiced: boolean; clean: boolean | null }) | null = null): void {
  const { app, opts, full, take, hooks } = c;
  c.state = 'result';
  const stars = starsFor(s);
  const passedNow = s >= PASS_SCORE;
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
  const afterPractice = back?.practiced ? `Luyện xong ${place.toLowerCase()}! Giờ chơi lại ${c.phrase ? 'nhé' : 'cả bài nhé'}!` : '';
  // Thang tốc độ: đạt ở tốc độ chậm → gợi ý lên nấc tiếp (40 → 50 → 60 → 72)
  const nextTempo = TEMPOS.find((t) => t > c.bpm);
  // Thầy nhắc một chỗ cần sửa → luyện chỗ đó trước ("🎯"), chưa gợi ý nhanh hơn (thanh nút tối đa 4 nút)
  const faster = !opts.stage && c.mode === 'tempo' && passedNow && !(focusRange && point && !point.praise) ? nextTempo : undefined;
  // Lặp câu khó: chỉ khi vừa chơi CẢ bài có lỗi (thanh nút tối đa 4 nút → nhường chỗ cho "Nhanh hơn")
  // (2026-10-09) Thầy đã chỉ ra chỗ cần luyện → "🎯 Luyện ngay chỗ này" thay cho "Lặp câu khó"
  const hard = !focusRange && !opts.stage && !opts.review && !c.phrase && !faster ? hardestPhrase(phraseRanges(full), c.missByMeasure) : null;
  // Chưa đạt (không phải sân khấu): Bé Nốt suy nghĩ + MỘT lời nhắn to, rõ + MỘT nút chính (Lặp câu khó / Chơi lại)
  const retryCard = !passedNow && !opts.stage;
  const headline = retryCard ? 'Gần được rồi! 💪' : passedNow ? pick(['Tuyệt vời! 🎉', 'Siêu quá! 🦸', 'Đỉnh của chóp! 🚀']) : 'Con đàn xong rồi! 👏';
  const nextStep = afterPractice
    ? afterPractice
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
      h('div', { class: `song-result-mascot ${retryCard ? 'react-scratch' : 'react-bounce'}` }, mascot(retryCard ? 'think' : 'cheer', 64)),
      h(
        'div',
        { class: 'song-lines' },
        h('div', { class: 'song-result-head' }, headline, ' ', h('span', { class: 'stars small' }, '★'.repeat(stars), h('span', { class: 'stars-off' }, '★'.repeat(3 - stars)))),
        h('div', { class: 'song-result-sub' }, text),
        nextStep
          ? h('div', { class: `song-result-next${point && !afterPractice ? ' teacher' : ''}` }, `${afterPractice ? '✅' : point ? '🧑‍🏫' : '👉'} ${nextStep}`)
          : null,
        take.makeSlot(),
      ),
    ),
  );
  take.render();
  // Album: chỉ lượt CẢ BÀI, hai tay như bài (không phải một câu / tách tay / lặp câu khó)
  if (!back) take.offerAlbum(!c.phrase && !solo(c) && !c.hardBack ? { stars, accuracy: s } : null);
  if (back) {
    if (afterPractice) void speak(app, afterPractice);
  } else if (retryCard) void speak(app, `Gần được rồi! ${nextStep}`);
  else if (point) void speak(app, point.text);
  const reset = () => c.act.reset();
  const again = button({
    icon: '↻',
    label: c.hardBack ? 'Lặp lại' : 'Chơi lại',
    kind: (retryCard && !hard && !focusRange) || back ? 'primary' : undefined,
    onTap: reset,
  });
  const practice =
    focusRange && rv && point && !faster
      ? button({
          icon: '🎯',
          label: back ? 'Luyện lại chỗ này' : 'Luyện ngay chỗ này',
          kind: retryCard && !back ? 'primary' : undefined,
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
    c.hardBack ? null : button({ icon: '▶', label: 'Tiếp', kind: retryCard || back ? undefined : 'primary', onTap: hooks.onDone }),
  );
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
