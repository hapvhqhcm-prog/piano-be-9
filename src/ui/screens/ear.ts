import { wait } from '../../audio/AudioEngine';
import { confetti } from '../components/celebrate';
import { fingerOnKeyboard } from '../../piano/fingering';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { keyboardRangeFor, midiToPitch, noteLabel, pitchToMidi, samePitch, viName, type Pitch } from '../../piano/pitchTable';
import { makeQuestion, referenceOf, type Question, type QuizSpec } from '../../practice/quiz';
import type { Tune } from '../../music/tune';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { StaffView } from '../components/staffView';

export interface QuizHooks {
  title: string;
  intro: string;
  quiz: QuizSpec;
  /** APP_ASSESSMENT — lưu riêng, không trộn với PARENT/MIC (§2). */
  onAnswer(expected: string, actual: string): void;
  onDone(): void;
  onBack(): void;
}

const ANSWER_TEXT: Record<string, string> = {
  up: 'Lên ⬆️',
  down: 'Xuống ⬇️',
  step: 'Bước 🚶',
  skip: 'Nhảy 🐸',
  major: 'Vui (trưởng) 😊',
  minor: 'Buồn (thứ) 😢',
};

/** Trò nghe / đọc nốt (v2): Lên hay xuống? · Bước hay nhảy? · Nốt nào đây? (có mốc Đô) · Đọc nốt. */
export function quizScreen(app: App, hooks: QuizHooks) {
  return (root: HTMLElement) => {
    const spec = hooks.quiz;
    const lhOn = spec.pool.some((p) => p.endsWith('3')) || app.store.get().progress.currentWeek >= 6;
    let q: Question | null = null;
    let round = 0;
    let score = 0;
    let accepting = false;
    let answered = false;
    let token = 0;

    // Trò Vui/buồn: dải phím phải chứa cả quãng 5 của hợp âm (vd Sol4 → Rê5)
    const rangeNotes = spec.variant === 'majorminor' ? spec.pool.flatMap((p) => [p, midiToPitch(pitchToMidi(p) + 7)]) : spec.pool;
    const [kbLow, kbHigh] = keyboardRangeFor(rangeNotes);
    const kb = new PianoKeyboard({
      low: kbLow,
      high: kbHigh,
      labels: spec.variant === 'read' ? 'none' : 'c',
      fingerOnPress: (p) => fingerOnKeyboard(p, lhOn),
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (accepting && !answered && q && !q.choices) answer(p);
      },
    });
    const stage = h('div', { class: 'stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap' }, kb.el), bar));

    const setBar = (...b: (HTMLElement | null)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));
    const back = () => backButton(() => hooks.onBack());

    const playQuestion = async () => {
      if (!q || !q.play.length) return;
      const tk = token;
      await app.audio.playSequence(q.play, {
        duration: 0.8,
        gap: 0.25,
        onEach: (p, on) => {
          // Nốt mốc Đô được chỉ rõ; nốt bí ẩn KHÔNG sáng phím
          if (spec.variant === 'identify' && p === q!.play[0] && q!.play.length > 1) kb.flash(p, on);
        },
      });
      if (tk !== token) return;
    };

    function intro(): void {
      token++;
      kb.clear();
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Trò chơi'),
        h('h1', { class: 'title' }, hooks.title),
        h('p', { class: 'lead' }, hooks.intro),
      );
      setBar(back(), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void demo() }));
    }

    async function demo(): Promise<void> {
      if (spec.variant !== 'identify') return void next();
      const tk = ++token;
      const ref = referenceOf(spec);
      kb.setTargets(spec.pool.map((p) => ({ pitch: p, label: viName(p) })));
      stage.replaceChildren(
        h('h1', { class: 'title' }, 'Nghe các nốt nhé'),
        h('p', { class: 'lead' }, `Nốt mốc là ${noteLabel(ref)} — luôn được đàn đầu tiên.`),
      );
      setBar(back());
      await app.audio.playSequence(spec.pool, { onEach: (p, on) => kb.flash(p, on) });
      if (tk === token) void next();
    }

    async function next(): Promise<void> {
      if (round >= spec.rounds) return done();
      const tk = ++token;
      round++;
      answered = false;
      accepting = false;
      q = makeQuestion(spec, Math.random, q ?? undefined);
      kb.clear();
      if (spec.variant === 'identify') kb.setGuides(spec.pool);
      const prog = h('div', { class: 'progress' }, `Lượt ${round} / ${spec.rounds}`);
      if (spec.variant === 'read') {
        const tune: Tune = { id: `read-${round}`, title: '', titleVi: '', hand: 'RH', bpm: 60, timeSignature: '4/4', notes: [{ pitch: q.show!, beats: 4 }] };
        const staff = new StaffView(tune, { clef: spec.clef ?? 'treble', names: false, fingers: false, measuresPerPage: 1, pxPerBeat: 30 });
        staff.el.classList.add('staff-mini');
        stage.replaceChildren(prog, h('h1', { class: 'title' }, 'Nốt này là nốt gì?'), staff.el, h('p', { class: 'lead' }, 'Chạm đúng phím trên iPad'));
        setBar(back());
        accepting = true;
        return;
      }
      const choices = q.choices
        ? h(
            'div',
            { class: 'choice-row' },
            ...q.choices.map((c) =>
              button({ icon: c.emoji, label: c.label, big: true, kind: 'primary', onTap: () => accepting && answer(c.value) }),
            ),
          )
        : null;
      stage.replaceChildren(
        prog,
        h('div', { class: 'hero-emoji' }, '🎵'),
        h('h1', { class: 'title' }, q.choices ? hooks.title.replace(/ [^ ]*$/, '') : 'Nốt nào đây?'),
        choices ?? h('p', { class: 'lead' }, 'Nghe nốt Đô mốc, rồi nốt bí ẩn — chạm phím'),
      );
      setBar(back(), button({ icon: '🔊', label: 'Nghe lại', onTap: () => void playQuestion() }));
      await wait(350);
      if (tk !== token) return;
      void playQuestion();
      // Cho trả lời khi nốt cuối đã vang một chút
      await wait(q.play.length > 1 ? 1300 : 500);
      if (tk === token) accepting = true;
    }

    async function answer(actual: string): Promise<void> {
      if (!q || answered) return;
      answered = true;
      accepting = false;
      const tk = ++token;
      const correct = q.choices ? actual === q.expected : samePitch(actual, q.expected);
      if (correct) score++;
      hooks.onAnswer(q.expected, actual);
      const isPitchAnswer = !q.choices;
      if (isPitchAnswer) kb.setResult(correct ? actual : q.expected, correct ? 'good' : 'show');
      if (correct) void app.audio.chime();
      const what = isPitchAnswer ? noteLabel(q.expected) : ANSWER_TEXT[q.expected];
      stage.replaceChildren(
        h('div', { class: 'hero-emoji' }, correct ? '🎉' : '👂'),
        h('h1', { class: 'title' }, correct ? 'Đúng rồi!' : 'Gần đúng rồi!'),
        h('p', { class: 'lead' }, correct ? `Đó là ${what}` : `Đáp án là ${what}${isPitchAnswer ? ' — phím đang sáng' : ''}`),
      );
      setBar(
        back(),
        q.play.length || q.show
          ? button({
              icon: '🔊',
              label: 'Nghe lại',
              onTap: () => void (q?.show ? app.audio.playPitch(q.show) : playQuestion()),
            })
          : null,
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => void next() }),
      );
      // Cho bé thấy hướng đi trên bàn phím
      if (q.choices) {
        await wait(400);
        if (tk !== token) return;
        await app.audio.playSequence(q.play, { duration: 0.6, onEach: (p, on) => kb.flash(p as Pitch, on) });
      } else if (!correct || spec.variant === 'read') {
        await wait(500);
        if (tk === token) await app.audio.playPitch(q.expected);
      }
    }

    function done(): void {
      token++;
      accepting = false;
      kb.clear();
      const good = score >= spec.rounds * 0.8;
      if (good) confetti();
      stage.replaceChildren(
        h('div', { class: 'hero-emoji' }, good ? '🏆' : '👏'),
        h('h1', { class: 'title' }, `Con đúng ${score} / ${spec.rounds}`),
        h('p', { class: 'lead' }, good ? 'Con giỏi quá!' : 'Con đang tiến bộ từng ngày!'),
      );
      setBar(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    intro();
    return () => {
      token++;
      kb.destroy();
    };
  };
}
