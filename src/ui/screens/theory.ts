/**
 * (OWNER duyệt 2026-10-12 — "Nhạc lý nhẹ nhàng") Màn NẠP MUỘN:
 * - theoryCardScreen: thẻ "📘 Biết thêm" (hoạt động kind 'theory') — tên, 1–3 dòng, hình khuông / bàn phím / ký hiệu,
 *   nút "Nghe thử", rồi 2 câu hỏi nhanh. Không ghi điểm (chỉ là để biết tên gọi), sai thì chỉ nhẹ đáp án đúng.
 * - theoryQuizScreen: "📘 Đố vui nhạc lý" (QuizSpec variant 'theory') — khởi động thỉnh thoảng; KHÔNG ghi APP_ASSESSMENT
 *   (không lẫn vào tiêu chí tai nghe / đọc nốt).
 * - theoryPicEl / playTheorySound: dùng chung với Từ điển nhạc nhỏ (glossary.ts).
 */
import { wait } from '../../audio/AudioEngine';
import { cancelSpeech, speak } from '../../audio/voice';
import { theoryConcept, theoryQuestion, type TheoryCheck, type TheoryPic, type TheorySoundStep } from '../../lessons/theory';
import type { TheoryId } from '../../lessons/types';
import type { Tune } from '../../music/tune';
import { measureCount } from '../../music/tune';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { pitchFreq, type Pitch } from '../../piano/pitchTable';
import type { App, Screen } from '../App';
import { confetti } from '../components/celebrate';
import { backButton, button, h } from '../components/dom';
import { speakChip } from '../components/speakChip';
import { StaffView } from '../components/staffView';
import type { QuizHooks } from './ear';
import '../../styles/theory.css';

export interface TheoryPicView {
  el: HTMLElement;
  /** Nháy phím (hình bàn phím) khi phát âm */
  flash?: (p: Pitch, on: boolean) => void;
  destroy(): void;
}

let picSeq = 0;

/** Vẽ hình minh họa của thẻ nhạc lý (khuông nhạc · bàn phím nhỏ · ký hiệu chữ to). */
export function theoryPicEl(app: App, pic: TheoryPic, small = false): TheoryPicView {
  if (pic.kind === 'staff') {
    const tune: Tune = {
      id: `theory-${++picSeq}`,
      title: '',
      titleVi: '',
      hand: pic.clef === 'bass' ? 'LH' : 'RH',
      bpm: 60,
      timeSignature: pic.timeSignature ?? '4/4',
      ...(pic.tempoTerm ? { tempoTerm: pic.tempoTerm } : {}),
      notes: pic.notes,
    };
    const staff = new StaffView(tune, {
      clef: pic.clef ?? 'treble',
      names: !!pic.names,
      fingers: false,
      measuresPerPage: Math.max(1, measureCount(tune)),
      pxPerBeat: 34,
    });
    staff.el.classList.add('th-staff');
    if (small) staff.el.classList.add('th-small');
    return { el: h('div', { class: 'th-pic th-pic-staff' }, staff.el), destroy: () => undefined };
  }
  if (pic.kind === 'keys') {
    const kb = new PianoKeyboard({
      low: pic.low,
      high: pic.high,
      labels: 'none',
      fingerOnPress: false,
      onPress: (p) => void app.audio.playPitch(p),
    });
    kb.setTargets(pic.marks.map((m) => ({ pitch: m.pitch, label: m.label })));
    return {
      el: h('div', { class: `th-pic th-pic-keys${small ? ' th-small' : ''}` }, kb.el),
      flash: (p, on) => kb.flash(p, on),
      destroy: () => kb.destroy(),
    };
  }
  return {
    el: h(
      'div',
      { class: `th-pic th-pic-signs${small ? ' th-small' : ''}` },
      ...pic.items.map((it) =>
        h(
          'div',
          { class: 'th-sign' },
          h('span', { class: `th-glyph${it.sign.length > 3 ? ' th-word' : ''}${it.sign === '<' || it.sign === '>' ? ' th-hairpin' : ''}` }, it.sign),
          h('span', { class: 'th-sign-label' }, it.label),
        ),
      ),
    ),
    destroy: () => undefined,
  };
}

/**
 * Phát âm "Nghe thử" của thẻ. `alive()` = false (đã rời màn / bấm lại) → dừng giữa chừng.
 */
export async function playTheorySound(
  app: App,
  steps: readonly TheorySoundStep[],
  alive: () => boolean,
  flash?: (p: Pitch, on: boolean) => void,
): Promise<void> {
  for (const s of steps) {
    if (!alive()) return;
    const ps = Array.isArray(s.p) ? s.p : [s.p];
    for (const p of ps) {
      void app.audio.playFreq(pitchFreq(p), s.d, s.v ?? 0.8);
      flash?.(p, true);
    }
    await wait(s.d * 1000);
    for (const p of ps) flash?.(p, false);
    if (s.gap) await wait(s.gap * 1000);
  }
}

/** Xáo thứ tự lựa chọn (giữ đáp án đúng). */
function shuffled(c: { choices: string[]; answer: number }): Array<{ label: string; ok: boolean }> {
  const out = c.choices.map((label, i) => ({ label, ok: i === c.answer }));
  // Lựa chọn có số (Quãng 2/3/4, 2/3/4 phách…) giữ thứ tự tăng dần như trên đàn — dễ so
  if (out.every((o) => /\d/.test(o.label))) return out;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Khung một câu hỏi chọn đáp án (dùng cho câu hỏi nhanh của thẻ và Đố vui). */
function askCheck(
  app: App,
  stage: HTMLElement,
  setBar: (...b: (HTMLElement | null)[]) => void,
  c: TheoryCheck & { play?: Pitch[] },
  prog: string,
  hooks: { onAnswer: (ok: boolean) => void; onNext: () => void; onBack: () => void; views: TheoryPicView[] },
): void {
  let answered = false;
  const pic = c.pic ? theoryPicEl(app, c.pic) : null;
  if (pic) hooks.views.push(pic);
  const opts = shuffled(c);
  const right = c.choices[c.answer];
  const row = h(
    'div',
    { class: 'th-choices' },
    ...opts.map((o) => {
      const b = button({ label: o.label, big: true, kind: 'primary', onTap: () => pick(o.ok, b) });
      b.dataset.ok = o.ok ? '1' : '0';
      return b;
    }),
  );
  const verdict = h('p', { class: 'lead th-verdict', 'aria-live': 'polite' });
  stage.replaceChildren(...[h('div', { class: 'progress' }, prog), h('h1', { class: 'title th-q' }, c.q), pic?.el, row, verdict].filter((x): x is HTMLElement => !!x));
  setBar(backButton(hooks.onBack));
  function pick(ok: boolean, b: HTMLButtonElement): void {
    if (answered) return;
    answered = true;
    hooks.onAnswer(ok);
    row.querySelectorAll('button').forEach((x) => {
      const btn = x as HTMLButtonElement;
      btn.disabled = true;
      if (btn.dataset.ok === '1') btn.classList.add('th-right');
    });
    if (ok) {
      b.classList.add('th-right');
      void app.audio.chime();
      verdict.textContent = '🎉 Đúng rồi!';
      verdict.classList.add('good');
    } else {
      // Không có âm "sai" (§10) — chỉ nhẹ nhàng chỉ đáp án
      verdict.textContent = `👀 Đáp án là: ${right}`;
    }
    if (c.play && pic) void playTheorySound(app, c.play.map((p) => ({ p, d: 0.6, gap: 0.1 })), () => stage.isConnected, pic.flash);
    setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onNext }));
  }
}

export interface TheoryCardHooks {
  ids: TheoryId[];
  onDone(): void;
  onBack(): void;
}

/** Hoạt động "📘 Biết thêm": mỗi khái niệm một thẻ + các câu hỏi nhanh của nó. */
export function theoryCardScreen(app: App, hooks: TheoryCardHooks): Screen {
  return (root) => {
    const stage = h('div', { class: 'stage scrollable th-stage th-card' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen theory-screen' }, stage, bar));
    const setBar = (...b: (HTMLElement | null)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));
    let views: TheoryPicView[] = [];
    let token = 0;
    const clearViews = () => {
      views.forEach((v) => v.destroy());
      views = [];
    };
    const steps = hooks.ids.flatMap((id) => [{ id, check: -1 }, ...theoryConcept(id).checks.map((_, k) => ({ id, check: k }))]);
    let i = 0;

    const show = (): void => {
      const tk = ++token;
      cancelSpeech();
      clearViews();
      if (i >= steps.length) return hooks.onDone();
      if (i < 0) return hooks.onBack();
      const { id, check } = steps[i];
      const c = theoryConcept(id);
      const back = () => {
        // Quay lại trong thẻ: về bước trước; bước đầu → rời hoạt động
        i--;
        show();
      };
      const next = () => {
        i++;
        show();
      };
      if (check >= 0) {
        askCheck(app, stage, setBar, c.checks[check], `📘 Câu ${check + 1} / ${c.checks.length}`, {
          onAnswer: () => undefined,
          onNext: next,
          onBack: back,
          views,
        });
        return;
      }
      const pic = theoryPicEl(app, c.pic);
      views.push(pic);
      const said = `${c.title}. ${c.lines.join(' ')}`;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, '📘 Biết thêm'),
        h('h1', { class: 'title th-title' }, h('span', { class: 'th-emoji', 'aria-hidden': 'true' }, c.emoji), ' ', c.title),
        pic.el,
        h('div', { class: 'th-lines' }, ...c.lines.map((l) => h('p', { class: 'lead th-line' }, l)), speakChip(app, said)),
      );
      const listen = c.sound
        ? button({ icon: '🔊', label: 'Nghe thử', onTap: () => void playTheorySound(app, c.sound!, () => tk === token, pic.flash) })
        : null;
      setBar(backButton(back), listen, button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: next }));
      window.setTimeout(() => tk === token && void speak(app, said), 400);
    };
    show();
    return () => {
      token++;
      cancelSpeech();
      clearViews();
    };
  };
}

/** "📘 Đố vui nhạc lý" — khởi động / trò trong bài (QuizSpec variant 'theory'). Không ghi APP_ASSESSMENT. */
export function theoryQuizScreen(app: App, hooks: QuizHooks): Screen {
  return (root) => {
    const spec = hooks.quiz;
    const stage = h('div', { class: 'stage scrollable th-stage th-quiz' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen theory-screen' }, stage, bar));
    const setBar = (...b: (HTMLElement | null)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));
    let views: TheoryPicView[] = [];
    let token = 0;
    let round = 0;
    let score = 0;
    let prevKey: string | undefined;
    const clearViews = () => {
      views.forEach((v) => v.destroy());
      views = [];
    };

    const intro = () => {
      const tk = ++token;
      clearViews();
      const said = `${hooks.title}. ${hooks.intro}`;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Trò chơi'),
        h('h1', { class: 'title' }, hooks.title),
        h('p', { class: 'lead' }, hooks.intro, speakChip(app, said)),
      );
      setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: next }));
      window.setTimeout(() => tk === token && void speak(app, said), 400);
    };

    function next(): void {
      token++;
      cancelSpeech();
      clearViews();
      if (round >= spec.rounds) return done();
      round++;
      const q = theoryQuestion(spec.theoryUpTo, Math.random, prevKey);
      prevKey = q.key;
      askCheck(app, stage, setBar, q, `Lượt ${round} / ${spec.rounds}`, {
        onAnswer: (ok) => {
          if (ok) score++;
        },
        onNext: next,
        onBack: hooks.onBack,
        views,
      });
    }

    function done(): void {
      const good = score >= spec.rounds * 0.8;
      if (good) confetti();
      stage.replaceChildren(
        h('div', { class: 'hero-emoji' }, good ? '🏆' : '📘'),
        h('h1', { class: 'title' }, `Con đúng ${score} / ${spec.rounds}`),
        h('p', { class: 'lead' }, good ? 'Con hiểu nhạc lý giỏi quá!' : 'Xem lại Từ điển nhạc nhỏ trong Thư viện nhé!'),
      );
      setBar(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    intro();
    return () => {
      token++;
      cancelSpeech();
      clearViews();
    };
  };
}
