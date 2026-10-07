/**
 * 🎵 "Nghe đoán bài" — app đàn câu đầu của một bài con biết; bé chọn tên bài (thẻ có tranh emoji). 6 lượt.
 */
import { eventsFromTune } from '../../components/demo';
import { SONGS, type Tune } from '../../../music/tune';
import { pitchFreq } from '../../../piano/pitchTable';
import { GAME_INFO } from '../../../practice/games/catalog';
import { baseTitle, eligibleSongs, firstPhrase, guessBpm, makeSongRounds, songStars, type SongRound } from '../../../practice/games/songGuess';
import { cancelSpeech, speak } from '../../../audio/voice';
import type { App } from '../../App';
import { backButton, button, h } from '../../components/dom';
import { songEmoji } from '../../components/songArt';
import { gameShell, mascotSlot, showEnd, showIntro } from './shared';

/** Emoji theo tên gốc (bản "tay trái" vẫn ra cùng tranh) */
const emojiOf = (t: Tune): string => songEmoji({ titleVi: baseTitle(t) });

export function songGuessScreen(app: App, onHub: () => void) {
  return (root: HTMLElement) => {
    const pool = eligibleSongs(app.store.get(), SONGS);
    const shell = gameShell(root);
    const { stage, setBar } = shell;
    let rounds: SongRound[] = [];
    let i = 0;
    let score = 0;
    let answered = false;
    let token = 0;
    let timer = 0;
    let spoken = false;
    let stopIntroVoice: () => void = () => undefined;
    const ms = mascotSlot(84);
    let cards: HTMLButtonElement[] = [];
    const note = h('div', { class: 'sg-notes', 'aria-hidden': 'true' }, '🎶');

    function intro(): void {
      token++;
      const info = GAME_INFO.songGuess;
      stopIntroVoice = showIntro(app, shell, {
        emoji: info.emoji,
        title: info.title,
        say: 'Nghe thầy đàn câu đầu — con đoán xem là bài gì nhé!',
        best: app.store.gameScore('songGuess')?.best,
        unit: info.unit,
        speakNow: !spoken,
        onStart: begin,
        onBack: onHub,
      });
      spoken = true;
    }

    function begin(): void {
      rounds = makeSongRounds(pool, emojiOf);
      i = 0;
      score = 0;
      show();
    }

    function playClip(t: Tune): void {
      const tk = ++token;
      app.audio.stopAll();
      const clip = firstPhrase(t);
      const spb = 60 / guessBpm(t);
      const t0 = app.audio.now() + 0.25;
      const events = eventsFromTune(clip);
      for (const ev of events)
        for (const n of ev.notes) void app.audio.scheduleFreq(pitchFreq(n.pitch), t0 + ev.time * spb, (n.len ?? ev.dur * 0.95) * spb, n.vol ?? 1);
      const end = events.length ? Math.max(...events.map((e) => e.time + e.dur)) : 0;
      stage.classList.add('sg-listening');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => tk === token && stage.classList.remove('sg-listening'), (end * spb + 0.4) * 1000);
    }

    function show(): void {
      if (i >= rounds.length) return finish();
      token++;
      cancelSpeech();
      answered = false;
      ms.react('happy', false);
      const r = rounds[i];
      cards = r.options.map((t, k) => {
        const c = h(
          'button',
          { class: 'sg-card', type: 'button' },
          h('span', { class: 'sg-emoji', 'aria-hidden': 'true' }, emojiOf(t)),
          h('span', { class: 'sg-title' }, baseTitle(t)),
        );
        c.addEventListener('click', () => pick(k));
        return c;
      });
      stage.replaceChildren(
        h(
          'div',
          { class: 'rq-head' },
          h('div', { class: 'progress' }, `Lượt ${i + 1} / ${rounds.length}`),
          h('h1', { class: 'title sg-q' }, note, 'Bài gì đây?'),
          ms.el,
        ),
        h('div', { class: 'sg-cards' }, ...cards),
      );
      setBar(
        backButton(leave),
        button({ icon: '🗣️', label: 'Đọc tên bài', onTap: () => void speak(app, r.options.map((t) => baseTitle(t)).join('. ')) }),
        button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => playClip(r.answer) }),
      );
      const tk = token;
      window.setTimeout(() => tk === token && playClip(r.answer), 350);
    }

    function pick(k: number): void {
      const r = rounds[i];
      if (!r || answered) return;
      answered = true;
      cancelSpeech();
      const ok = k === r.correct;
      if (ok) score++;
      cards.forEach((c, j) => {
        c.disabled = true;
        if (j === r.correct) c.classList.add('good');
        else if (j === k) c.classList.add('miss');
        else c.classList.add('dim');
      });
      if (ok) {
        app.audio.stopAll();
        void app.audio.chime();
        ms.react('cheer');
      } else ms.react('think');
      const q = stage.querySelector('.sg-q');
      if (q) q.textContent = ok ? '🎉 Đúng rồi!' : `Đó là: ${emojiOf(r.answer)} ${baseTitle(r.answer)}`;
      i++;
      setBar(
        backButton(leave),
        button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => playClip(r.answer) }),
        button({ icon: '▶', label: i >= rounds.length ? 'Xem điểm' : 'Tiếp', kind: 'primary', big: true, onTap: show }),
      );
    }

    function finish(): void {
      token++;
      app.audio.stopAll();
      showEnd(app, shell, {
        id: 'songGuess',
        score,
        scoreText: `Đúng ${score} / ${rounds.length}`,
        stars: songStars(score),
        onAgain: begin,
        onHub,
      });
    }

    function leave(): void {
      token++;
      window.clearTimeout(timer);
      app.audio.stopAll();
      intro();
    }

    intro();
    return () => {
      token++;
      stopIntroVoice();
      window.clearTimeout(timer);
      cancelSpeech();
    };
  };
}
