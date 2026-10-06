import { LEFT_HAND_WEEK } from '../../lessons/lessonEngine';
import { wait } from '../../audio/AudioEngine';
import { confetti } from '../components/celebrate';
import { fingerOnKeyboard } from '../../piano/fingering';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { keyboardRangeFor, midiToPitch, noteLabel, pitchToMidi, samePitch, viName, type Pitch } from '../../piano/pitchTable';
import {
  INTERVAL_INFO,
  INTERVAL_KINDS,
  intervalText,
  isCorrect,
  landmarkName,
  makeQuestion,
  parseInterval,
  referenceOf,
  type Choice,
  type IntervalKind,
  type Question,
  type QuizSpec,
} from '../../practice/quiz';
import type { Tune } from '../../music/tune';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { StaffView } from '../components/staffView';
import { cancelSpeech, speak } from '../../audio/voice';
import { speakChip } from '../components/speakChip';

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

/** Câu hỏi hiện trên màn (không suy ra từ tiêu đề — tiêu đề có thể đổi/không có emoji). */
const QUESTION: Record<QuizSpec['variant'], string> = {
  updown: 'Lên hay xuống?',
  stepskip: 'Bước hay nhảy?',
  identify: 'Nốt nào đây?',
  read: 'Nốt này là nốt gì?',
  majorminor: 'Vui hay buồn?',
  interval: 'Nốt sau giống, bước hay nhảy?',
  landmark: 'Nốt mốc nào đây?',
};

/** v5 — Khuông TO hiện 1 nốt (nốt tròn) hoặc 2 nốt (hai nốt trắng) cho trò đọc theo quãng / nốt mốc. */
function quizStaff(notes: Pitch[], clef: 'treble' | 'bass', round: number): HTMLElement {
  const beats = notes.length > 1 ? 2 : 4;
  const tune: Tune = {
    id: `quiz-${round}`,
    title: '',
    titleVi: '',
    hand: clef === 'bass' ? 'LH' : 'RH',
    bpm: 60,
    timeSignature: '4/4',
    notes: notes.map((p) => ({ pitch: p, beats })),
  };
  const staff = new StaffView(tune, { clef, names: false, fingers: false, measuresPerPage: 1, pxPerBeat: notes.length > 1 ? 44 : 30 });
  staff.el.classList.add('staff-mini', 'staff-quiz');
  if (notes.length > 1) staff.el.classList.add('staff-pair');
  return staff.el;
}

/** Trò nghe / đọc nốt (v2): Lên hay xuống? · Bước hay nhảy? · Nốt nào đây? (có mốc Đô) · Đọc nốt. */
export function quizScreen(app: App, hooks: QuizHooks) {
  return (root: HTMLElement) => {
    const spec = hooks.quiz;
    const lhOn = spec.pool.some((p) => p.endsWith('3')) || app.store.get().progress.currentWeek >= LEFT_HAND_WEEK;
    let q: Question | null = null;
    let round = 0;
    let score = 0;
    let accepting = false;
    let answered = false;
    let token = 0;
    /** Bé chạm đáp án khi câu hỏi còn đang phát → nhớ lại, nghe xong tự chấm (không "nuốt" mất cú chạm) */
    let queued: string | null = null;
    const tapAnswer = (value: string, btn?: HTMLElement) => {
      if (answered || !q) return;
      if (accepting) return void answer(value);
      queued = value;
      stage.querySelectorAll('.is-queued').forEach((b) => b.classList.remove('is-queued'));
      btn?.classList.add('is-queued');
    };
    /** Trạng thái "đang nghe": nút đáp án mờ nhẹ + tai nhấp nháy (vẫn chạm được — cú chạm được xếp hàng) */
    const setListening = (on: boolean) => stage.classList.toggle('quiz-listening', on);
    const openAnswers = () => {
      accepting = true;
      setListening(false);
      if (queued !== null) {
        const v = queued;
        queued = null;
        void answer(v);
      }
    };

    // Trò Vui/buồn: dải phím phải chứa cả quãng 5 của hợp âm (vd Sol4 → Rê5)
    const rangeNotes = spec.variant === 'majorminor' ? spec.pool.flatMap((p) => [p, midiToPitch(pitchToMidi(p) + 7)]) : spec.pool;
    const [kbLow, kbHigh] = keyboardRangeFor(rangeNotes);
    const kb = new PianoKeyboard({
      low: kbLow,
      high: kbHigh,
      labels: spec.variant === 'read' || spec.variant === 'landmark' ? 'none' : 'c',
      fingerOnPress: (p) => fingerOnKeyboard(p, lhOn),
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (accepting && !answered && q && (!q.choices || spec.variant === 'landmark')) answer(p);
      },
    });
    const stage = h('div', { class: 'stage scrollable' });
    const bar = h('div', { class: 'actions' });
    const visual = spec.variant === 'interval' || spec.variant === 'landmark';
    // Trò nhìn khuông: khuông + nút lựa chọn cần chỗ → bàn phím thấp hơn (chỉ để xem / chạm phím nốt mốc)
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: `keyboard-wrap${visual ? ' short' : ''}` }, kb.el), bar));

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
      const said = `${hooks.title}. ${hooks.intro}`;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Trò chơi'),
        h('h1', { class: 'title' }, hooks.title),
        h('p', { class: 'lead' }, hooks.intro, speakChip(app, said)),
      );
      setBar(back(), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void demo() }));
      const tk = token;
      window.setTimeout(() => tk === token && void speak(app, said), 400);
    }

    async function demo(): Promise<void> {
      cancelSpeech(); // không đọc chồng lên nốt nhạc của trò chơi
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
      queued = null;
      setListening(false);
      q = makeQuestion(spec, Math.random, q ?? undefined);
      kb.clear();
      if (spec.variant === 'identify') kb.setGuides(spec.pool);
      const prog = h('div', { class: 'progress' }, `Lượt ${round} / ${spec.rounds}`);
      if (visual) return showVisual(prog);
      if (spec.variant === 'read') {
        const tune: Tune = { id: `read-${round}`, title: '', titleVi: '', hand: 'RH', bpm: 60, timeSignature: '4/4', notes: [{ pitch: q.show!, beats: 4 }] };
        const staff = new StaffView(tune, { clef: spec.clef ?? 'treble', names: false, fingers: false, measuresPerPage: 1, pxPerBeat: 30 });
        staff.el.classList.add('staff-mini', 'staff-quiz');
        stage.replaceChildren(prog, h('h1', { class: 'title' }, 'Nốt này là nốt gì?'), staff.el, h('p', { class: 'lead' }, 'Chạm đúng phím trên iPad'));
        setBar(back());
        accepting = true;
        return;
      }
      const choices = q.choices
        ? h(
            'div',
            { class: 'choice-row' },
            ...q.choices.map((c) => {
              const b: HTMLButtonElement = button({ icon: c.emoji, label: c.label, big: true, kind: 'primary', onTap: () => tapAnswer(c.value, b) });
              return b;
            }),
          )
        : null;
      stage.replaceChildren(
        prog,
        h('div', { class: 'hero-emoji listen-ear' }, '🎵'),
        h('h1', { class: 'title' }, q.choices ? QUESTION[spec.variant] : 'Nốt nào đây?'),
        h('div', { class: 'listen-hint', 'aria-hidden': 'true' }, '👂 Nghe đã nhé…'),
        choices ?? h('p', { class: 'lead' }, 'Nghe nốt Đô mốc, rồi nốt bí ẩn — chạm phím'),
      );
      setBar(back(), button({ icon: '🔊', label: 'Nghe lại', onTap: () => void playQuestion() }));
      setListening(true);
      await wait(350);
      if (tk !== token) return;
      void playQuestion();
      // Cho trả lời khi nốt cuối đã vang một chút
      await wait(q.play.length > 1 ? 1300 : 500);
      if (tk === token) openAnswers();
    }

    /** Nút trả lời quãng: ≤ 5 lựa chọn → một màn (cột = loại quãng, hàng = lên/xuống); 4–5 loại → hỏi 2 bước. */
    function intervalButtons(choices: Choice[]): HTMLElement {
      const kinds = INTERVAL_KINDS.filter((k) => choices.some((c) => parseInterval(c.value).kind === k));
      const box = h('div', { class: 'iv-answers' });
      const kindBtn = (k: IntervalKind, onTap: () => void, extra = '') =>
        button({ icon: INTERVAL_INFO[k].emoji, label: `${INTERVAL_INFO[k].label}${extra}`, big: true, kind: k === 'same' ? 'sun' : 'primary', onTap });
      if (choices.length <= 5) {
        box.classList.add('iv-grid');
        for (const k of kinds) {
          if (k === 'same') {
            const b: HTMLButtonElement = kindBtn(k, () => tapAnswer('same', b));
            b.classList.add('iv-same');
            box.append(b);
            continue;
          }
          const col = h('div', { class: 'iv-col' });
          for (const dir of ['up', 'down'] as const) {
            const b: HTMLButtonElement = kindBtn(k, () => tapAnswer(`${k}-${dir}`, b), dir === 'up' ? ' lên ⬆️' : ' xuống ⬇️');
            b.classList.add(`iv-${dir}`);
            col.append(b);
          }
          box.append(col);
        }
        return box;
      }
      // 2 bước: chọn loại quãng → chọn hướng
      const step1 = () => {
        box.className = 'iv-answers iv-kinds';
        box.replaceChildren(
          ...kinds.map((k) => kindBtn(k, () => (k === 'same' ? tapAnswer('same') : step2(k)))),
        );
      };
      const step2 = (k: IntervalKind) => {
        if (answered) return;
        box.className = 'iv-answers iv-dirs';
        box.replaceChildren(
          h('div', { class: 'iv-picked' }, `${INTERVAL_INFO[k].emoji} ${INTERVAL_INFO[k].label} — lên hay xuống?`),
          button({ icon: '⬆️', label: 'Lên', big: true, kind: 'primary', onTap: () => tapAnswer(`${k}-up`) }),
          button({ icon: '⬇️', label: 'Xuống', big: true, kind: 'primary', onTap: () => tapAnswer(`${k}-down`) }),
          button({ icon: '↩', label: 'Chọn lại', onTap: step1 }),
        );
      };
      step1();
      return box;
    }

    /** v5 — Trò NHÌN khuông: quãng (2 nốt) / nốt mốc (1 nốt). Không phát tiếng trước — đọc bằng mắt, nghe sau khi trả lời. */
    function showVisual(prog: HTMLElement): void {
      const cur = q!;
      if (spec.variant === 'interval') {
        stage.replaceChildren(
          prog,
          h('h1', { class: 'title' }, QUESTION.interval),
          quizStaff(cur.pair!, cur.clef ?? 'treble', round),
          intervalButtons(cur.choices ?? []),
        );
      } else {
        stage.replaceChildren(
          prog,
          h('h1', { class: 'title' }, QUESTION.landmark),
          quizStaff([cur.show!], cur.clef ?? 'treble', round),
          h(
            'div',
            { class: 'choice-row lm-choices' },
            ...(cur.choices ?? []).map((c) => button({ icon: c.emoji, label: c.label, big: true, kind: 'primary', onTap: () => tapAnswer(c.value) })),
          ),
          h('p', { class: 'lead lm-hint' }, '…hoặc chạm đúng phím trên iPad'),
        );
      }
      setBar(back());
      accepting = true;
    }

    async function answer(actual: string): Promise<void> {
      if (!q || answered) return;
      answered = true;
      accepting = false;
      const tk = ++token;
      const correct = visual ? isCorrect(q, actual) : q.choices ? actual === q.expected : samePitch(actual, q.expected);
      if (correct) score++;
      hooks.onAnswer(q.expected, actual);
      const isPitchAnswer = !q.choices || spec.variant === 'landmark';
      if (isPitchAnswer) kb.setResult(q.expected, correct ? 'good' : 'show');
      if (correct) void app.audio.chime();
      const what =
        spec.variant === 'interval'
          ? intervalText(q.expected)
          : spec.variant === 'landmark'
            ? `${landmarkName(q.expected).emoji} ${landmarkName(q.expected).name} (${noteLabel(q.expected)})`
            : isPitchAnswer
              ? noteLabel(q.expected)
              : ANSWER_TEXT[q.expected];
      if (visual) {
        // Khuông vẫn hiện để bé so lại hình dáng nốt; đáp án đọc thành lời (bé đọc chậm)
        const said = correct ? `Đúng rồi! ${what}` : `Đáp án là ${what}`;
        stage.replaceChildren(
          h('h1', { class: 'title' }, correct ? '🎉 Đúng rồi!' : '👀 Nhìn lại nhé!'),
          quizStaff(q.pair ?? [q.show!], q.clef ?? 'treble', round),
          h('p', { class: `lead quiz-verdict${correct ? ' good' : ''}` }, correct ? `Đó là ${what}` : `Đáp án: ${what}`, speakChip(app, said)),
        );
      } else
        stage.replaceChildren(
          h('div', { class: 'hero-emoji' }, correct ? '🎉' : '👂'),
          h('h1', { class: 'title' }, correct ? 'Đúng rồi!' : 'Chưa đúng — nghe lại nhé!'),
          h('p', { class: 'lead' }, correct ? `Đó là ${what}` : `Đáp án là ${what}${isPitchAnswer ? ' — phím đang sáng' : ''}`),
        );
      setBar(
        back(),
        q.play.length || q.show
          ? button({
              icon: '🔊',
              label: visual ? 'Nghe thử' : 'Nghe lại',
              onTap: () =>
                void (q?.pair
                  ? app.audio.playSequence(q.pair, { duration: 0.7, onEach: (p, on) => kb.flash(p, on) })
                  : q?.show
                    ? app.audio.playPitch(q.show)
                    : playQuestion()),
            })
          : null,
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => void next() }),
      );
      // Cho bé thấy hướng đi trên bàn phím
      if (q.pair || spec.variant === 'landmark') {
        // Đọc xong rồi mới nghe: hai nốt vang lên + phím nháy → bé nối hình trên khuông với âm thanh
        await wait(450);
        if (tk !== token) return;
        await app.audio.playSequence(q.play, { duration: 0.7, onEach: (p, on) => kb.flash(p as Pitch, on) });
      } else if (q.choices) {
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
      cancelSpeech();
      kb.destroy();
    };
  };
}
