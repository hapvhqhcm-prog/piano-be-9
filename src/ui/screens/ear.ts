import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { noteLabel, viName, type Pitch } from '../../piano/pitchTable';
import { EarGame } from '../../practice/EarGame';
import { wait } from '../../audio/AudioEngine';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';

export interface EarHooks {
  pool: Pitch[];
  rounds: number;
  /** APP_ASSESSMENT — lưu riêng, không trộn với PARENT_ASSESSMENT (§2). */
  onAnswer(expected: Pitch, actual: Pitch): void;
  onDone(): void;
  onBack(): void;
}

/** Trò chơi tai nghe: app phát một nốt, bé chạm phím ảo trên iPad. */
export function earScreen(app: App, hooks: EarHooks) {
  return (root: HTMLElement) => {
    const game = new EarGame(hooks.pool, hooks.rounds);
    let accepting = false;
    let token = 0;

    const kb = new PianoKeyboard({
      labels: 'none',
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (accepting && !game.isAnswered) onAnswer(p);
      },
    });
    const stage = h('div', { class: 'stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap' }, kb.el), bar));

    const setView = (...children: Node[]) => {
      stage.replaceChildren(...children);
    };
    const setBar = (...children: (HTMLElement | null)[]) => {
      bar.replaceChildren(...children.filter((c): c is HTMLElement => !!c));
    };
    const back = () => backButton(() => hooks.onBack());

    function intro(): void {
      token++;
      kb.clear();
      setView(
        h('div', { class: 'step-tag' }, 'Tai nghe'),
        h('h1', { class: 'title' }, 'Trò chơi tai nghe 👂'),
        h('p', { class: 'lead' }, 'Đàn sẽ kêu một nốt. Con chạm đúng phím đó trên iPad nhé!'),
      );
      setBar(back(), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: demo }));
    }

    async function demo(): Promise<void> {
      const tk = ++token;
      kb.setTargets(hooks.pool.map((p) => ({ pitch: p, label: viName(p) })));
      setView(
        h('h1', { class: 'title' }, 'Nghe các nốt nhé'),
        h('p', { class: 'lead' }, hooks.pool.map((p) => viName(p)).join(' – ')),
      );
      setBar(back());
      await app.audio.playSequence(hooks.pool, { onEach: (p, on) => kb.flash(p, on) });
      if (tk === token) round();
    }

    async function playExpected(): Promise<void> {
      const p = game.expected;
      if (p) await app.audio.playSequence([p], { duration: 0.9 });
    }

    async function round(): Promise<void> {
      const tk = ++token;
      accepting = false;
      const p = game.next();
      if (!p) return done();
      kb.clear();
      kb.setGuides(hooks.pool);
      setView(
        h('div', { class: 'progress' }, `Lượt ${game.roundNumber} / ${game.rounds}`),
        h('div', { class: 'hero-emoji' }, '🎵'),
        h('h1', { class: 'title' }, 'Nốt nào đây?'),
        h('p', { class: 'lead' }, 'Nghe rồi chạm phím'),
      );
      setBar(back(), button({ icon: '🔊', label: 'Nghe lại', onTap: () => void playExpected() }));
      await wait(400);
      if (tk !== token) return;
      void playExpected();
      // Cho trả lời khi nốt đã vang được một chút — không bắt bé chờ nốt tắt hẳn.
      await wait(500);
      if (tk === token) accepting = true;
    }

    async function onAnswer(actual: Pitch): Promise<void> {
      const r = game.answer(actual);
      if (!r) return;
      accepting = false;
      const tk = ++token;
      hooks.onAnswer(r.expected, r.actual);
      if (r.correct) {
        kb.setResult(actual, 'good');
        void app.audio.chime();
        setView(
          h('div', { class: 'hero-emoji' }, '🎉'),
          h('h1', { class: 'title' }, 'Đúng rồi!'),
          h('p', { class: 'lead' }, `Đó là ${noteLabel(r.expected)}`),
        );
      } else {
        kb.setResult(r.expected, 'show');
        setView(
          h('div', { class: 'hero-emoji' }, '👂'),
          h('h1', { class: 'title' }, 'Gần đúng rồi!'),
          h('p', { class: 'lead' }, `Nốt đó là ${noteLabel(r.expected)} — phím đang sáng`),
        );
      }
      setBar(
        back(),
        button({ icon: '🔊', label: 'Nghe lại', onTap: () => void playExpected() }),
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => void round() }),
      );
      if (!r.correct) {
        await wait(700);
        if (tk === token) await playExpected();
      }
    }

    function done(): void {
      token++;
      accepting = false;
      kb.clear();
      const score = game.score;
      setView(
        h('div', { class: 'hero-emoji' }, score >= game.rounds * 0.8 ? '🏆' : '👏'),
        h('h1', { class: 'title' }, `Con đúng ${score} / ${game.rounds}`),
        h('p', { class: 'lead' }, score >= game.rounds * 0.8 ? 'Tai con thính quá!' : 'Tai con đang giỏi dần lên!'),
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
