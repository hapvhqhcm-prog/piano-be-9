/**
 * 🔁 "Đàn lại giai điệu" — app chơi giai điệu ngắn (phím sáng theo), bé đàn lại đúng thứ tự trên phím ảo hoặc đàn
 * thật (micro). Đúng → dài thêm một nốt. Sai lần 1 → "Nghe lại nhé!" (chơi lại y hệt); sai lần 2 → hết trò.
 * Điểm = giai điệu dài nhất bé đàn lại được.
 */
import { viName, type Pitch } from '../../../piano/pitchTable';
import { PianoKeyboard } from '../../../piano/PianoKeyboard';
import { GAME_INFO } from '../../../practice/games/catalog';
import {
  ECHO_MAX,
  ECHO_TRIES,
  echoNoteOk,
  echoNoteSec,
  echoPool,
  echoStars,
  extendEcho,
  startEcho,
} from '../../../practice/games/echo';
import { cancelSpeech } from '../../../audio/voice';
import type { App } from '../../App';
import { backButton, button, h } from '../../components/dom';
import { gameShell, listenPiano, mascotSlot, pause, showEnd, showIntro } from './shared';

export function echoScreen(app: App, onHub: () => void) {
  return (root: HTMLElement) => {
    const pool = echoPool(app.store.get().progress.currentWeek);
    let seq: Pitch[] = [];
    let idx = 0;
    let tries = ECHO_TRIES;
    let best = 0;
    let listening = false;
    let token = 0;
    let spoken = false;
    let stopIntroVoice: () => void = () => undefined;
    let micOff: () => void = () => undefined;

    const kb = new PianoKeyboard({
      low: 'C4',
      high: 'C5',
      labels: 'c',
      fingerOnPress: false,
      onPress: (p) => {
        void app.audio.playPitch(p, 0.5);
        input(p, false);
      },
    });
    const kbWrap = h('div', { class: 'keyboard-wrap eg-kb' }, kb.el);
    const shell = gameShell(root, kbWrap);
    const { stage, setBar } = shell;
    const ms = mascotSlot(84);
    const title = h('h1', { class: 'title eg-title' });
    const lenEl = h('div', { class: 'progress' });
    const dotsEl = h('div', { class: 'ec-dots', 'aria-hidden': 'true' });
    const triesEl = h('div', { class: 'ec-tries' });
    const micTag = h('div', { class: 'rush-mic' });

    function intro(): void {
      token++;
      listening = false;
      kb.clear();
      kbWrap.hidden = true;
      const info = GAME_INFO.echo;
      stopIntroVoice = showIntro(app, shell, {
        emoji: info.emoji,
        title: info.title,
        say: 'Nghe app đàn, rồi con đàn lại y hệt nhé! Mỗi lần đúng, giai điệu dài thêm một nốt.',
        extra: h(
          'div',
          { class: 'eg-set' },
          ...pool.map((p) => h('span', { class: 'eg-chip' }, viName(p))),
          app.micWanted ? h('p', { class: 'game-sub' }, '🎤 Con đàn trên đàn thật cũng được!') : null,
        ),
        best: app.store.gameScore('echo')?.best,
        unit: info.unit,
        speakNow: !spoken,
        onStart: () => void start(),
        onBack: onHub,
      });
      spoken = true;
    }

    function renderDots(): void {
      dotsEl.replaceChildren(...seq.map((_, i) => h('span', { class: `ec-dot${i < idx ? ' done' : ''}` })));
      lenEl.textContent = `🎵 ${seq.length} nốt`;
      triesEl.textContent = tries < ECHO_TRIES ? '💛 Còn 1 lần thử' : ' ';
    }

    async function start(): Promise<void> {
      const tk = ++token;
      stopIntroVoice();
      seq = startEcho(pool);
      best = 0;
      tries = ECHO_TRIES;
      kbWrap.hidden = false;
      ms.react('happy', false);
      stage.replaceChildren(
        h('div', { class: 'rq-head' }, lenEl, title, ms.el),
        h('div', { class: 'eg-row' }, triesEl, dotsEl, micTag),
      );
      setBar(backButton(leave));
      micOff();
      micTag.textContent = app.micWanted ? '🎤 …' : '';
      const mic = await listenPiano(app, (p) => input(p, true));
      if (tk !== token) return mic.off();
      micOff = mic.off;
      micTag.textContent = mic.on ? '🎤 Đang nghe đàn' : '';
      void demo();
    }

    /** App chơi giai điệu (phím sáng theo), rồi tới lượt bé. */
    async function demo(): Promise<void> {
      const tk = ++token;
      listening = false;
      idx = 0;
      kb.clear();
      kb.setEnabled(false);
      setBar(backButton(leave));
      renderDots();
      title.textContent = '👂 Nghe nè…';
      title.classList.add('listening');
      if (!(await pause(500, () => tk === token))) return;
      const d = echoNoteSec(seq.length);
      await app.audio.playSequence(seq, { duration: d, gap: 0.14, onEach: (p, on) => kb.flash(p, on) });
      if (tk !== token) return;
      title.classList.remove('listening');
      title.textContent = '🎹 Đến lượt con!';
      kb.setEnabled(true);
      kb.setGuides(pool);
      listening = true;
      // Nghe lại không mất lượt thử (bé đàn lại từ nốt đầu)
      setBar(backButton(leave), button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => void demo() }));
    }

    function input(p: Pitch, fromMic: boolean): void {
      if (!listening) return;
      if (echoNoteOk(seq, idx, p)) {
        if (!fromMic) kb.setResult(p, 'good');
        idx++;
        renderDots();
        if (idx < seq.length) return;
        // Cả giai điệu đúng!
        listening = false;
        best = Math.max(best, seq.length);
        tries = ECHO_TRIES;
        void app.audio.chime();
        ms.react('cheer');
        title.textContent = seq.length >= ECHO_MAX ? '🏆 Nhớ siêu giỏi!' : `🎉 Đúng cả ${seq.length} nốt!`;
        const tk = ++token;
        void pause(1100, () => tk === token).then((ok) => {
          if (!ok) return;
          if (seq.length >= ECHO_MAX) return finish();
          seq = extendEcho(seq, pool);
          void demo();
        });
        return;
      }
      // Nhầm: chỉ phím đúng, nghe lại (lần thử thứ hai) hoặc hết trò
      listening = false;
      tries--;
      ms.react('think');
      kb.setResult(seq[idx], 'show');
      const tk = ++token;
      if (tries > 0) {
        title.textContent = '🙂 Gần đúng rồi — nghe lại nhé!';
        void pause(1300, () => tk === token).then((ok) => ok && void demo());
      } else {
        title.textContent = `👀 Nốt tiếp theo là ${viName(seq[idx])}`;
        void pause(1500, () => tk === token).then((ok) => ok && finish());
      }
    }

    function finish(): void {
      token++;
      listening = false;
      app.audio.stopAll();
      kb.clear();
      kb.setEnabled(true);
      kbWrap.hidden = true;
      micOff();
      micOff = () => undefined;
      showEnd(app, shell, {
        id: 'echo',
        score: best,
        scoreText: best > 0 ? `Nhớ được ${best} nốt!` : 'Chơi lại nhé!',
        stars: echoStars(best),
        onAgain: () => void start(),
        onHub,
      });
    }

    function leave(): void {
      token++;
      app.audio.stopAll();
      kb.setEnabled(true);
      micOff();
      micOff = () => undefined;
      intro();
    }

    intro();
    return () => {
      token++;
      stopIntroVoice();
      cancelSpeech();
      app.audio.stopAll();
      micOff();
      app.mic.stop();
      kb.destroy();
    };
  };
}
