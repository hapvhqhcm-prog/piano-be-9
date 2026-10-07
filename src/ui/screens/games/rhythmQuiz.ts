/**
 * 🥁 "Đố nhịp" — app chơi một mẫu nhịp (1–2 ô), bé chọn thẻ nhịp đúng trong 3 thẻ (cùng kiểu thẻ với màn Nhịp).
 * 8 lượt, khó dần: 1 ô ít ký hiệu → 1 ô mọi ký hiệu đã học → 2 ô.
 */
import type { RhythmSymbol } from '../../../lessons/types';
import { GAME_INFO } from '../../../practice/games/catalog';
import {
  BEATS_PER_BAR,
  RHYTHM_ROUNDS,
  makeRhythmRound,
  rhythmBpm,
  rhythmStars,
  rhythmSymbolsUpTo,
  rhythmTones,
  type RhythmRound,
} from '../../../practice/games/rhythmQuiz';
import { cancelSpeech } from '../../../audio/voice';
import type { App } from '../../App';
import { backButton, button, h } from '../../components/dom';
import { SYMBOL, rhythmCell } from '../rhythm';
import { gameShell, mascotSlot, showEnd, showIntro } from './shared';

const TONE_HZ = 523.25; // Đô5 — tiếng gõ rõ, khác tiếng tích máy đếm nhịp

export function rhythmQuizScreen(app: App, onHub: () => void) {
  return (root: HTMLElement) => {
    const learned = rhythmSymbolsUpTo(app.store.get().progress.currentWeek);
    const shell = gameShell(root);
    const { stage, setBar } = shell;
    let round = 0;
    let score = 0;
    let q: RhythmRound | null = null;
    let answered = false;
    let token = 0;
    let raf = 0;
    let spoken = false;
    let stopIntroVoice: () => void = () => undefined;
    const ms = mascotSlot(84);
    let cards: HTMLButtonElement[] = [];
    let cellEls: HTMLElement[][] = [];

    function intro(): void {
      token++;
      const info = GAME_INFO.rhythmQuiz;
      stopIntroVoice = showIntro(app, shell, {
        emoji: info.emoji,
        title: info.title,
        say: 'Nghe app gõ nhịp, rồi chạm vào thẻ nhịp đúng nhé!',
        extra: h('div', { class: 'rq-legend', 'aria-hidden': 'true' }, ...learned.map((s) => h('span', {}, `${SYMBOL[s].emoji} ${SYMBOL[s].label}`))),
        best: app.store.gameScore('rhythmQuiz')?.best,
        unit: info.unit,
        speakNow: !spoken,
        onStart: () => {
          round = 0;
          score = 0;
          q = null;
          next();
        },
        onBack: onHub,
      });
      spoken = true;
    }

    function cardRow(p: RhythmSymbol[]): { row: HTMLElement; els: HTMLElement[] } {
      const els = p.map((s) => rhythmCell(s));
      // 2 ô: vạch nhịp giữa hai ô
      const kids: HTMLElement[] = [];
      let b = 0;
      els.forEach((e, i) => {
        if (b === BEATS_PER_BAR && i > 0) kids.push(h('div', { class: 'rq-barline', 'aria-hidden': 'true' }));
        b += SYMBOL[p[i]].beats;
        kids.push(e);
      });
      return { row: h('div', { class: 'rh-row rq-row' }, ...kids), els };
    }

    function next(): void {
      if (round >= RHYTHM_ROUNDS) return finish();
      token++;
      cancelSpeech();
      q = makeRhythmRound(learned, round, Math.random, q?.answer);
      round++;
      answered = false;
      ms.react('happy', false);
      const cur = q;
      cards = [];
      cellEls = [];
      const list = h('div', { class: `rq-cards${cur.bars > 1 ? ' two-bars' : ''}` });
      cur.options.forEach((opt, i) => {
        const { row, els } = cardRow(opt);
        const card = h('button', { class: 'rq-card', type: 'button', 'aria-label': `Thẻ ${i + 1}` }, h('span', { class: 'rq-num', 'aria-hidden': 'true' }, String(i + 1)), row);
        card.addEventListener('click', () => pick(i));
        cards.push(card);
        cellEls.push(els);
        list.append(card);
      });
      stage.replaceChildren(
        h(
          'div',
          { class: 'rq-head' },
          h('div', { class: 'progress' }, `Lượt ${round} / ${RHYTHM_ROUNDS}${cur.bars > 1 ? ' · 💪 2 ô' : ''}`),
          h('h1', { class: 'title rq-title' }, h('span', { class: 'rq-ear', 'aria-hidden': 'true' }, '👂'), 'Nhịp nào vừa nghe?'),
          ms.el,
        ),
        list,
      );
      setBar(backButton(leave), button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => play(null) }));
      const tk = token;
      window.setTimeout(() => tk === token && play(null), 350);
    }

    /** Gõ mẫu đáp án: 1 ô đếm vào (tích), rồi mẫu (tiếng gõ ngân theo độ dài + tích từng phách). `show` = sáng ô theo nhạc. */
    function play(show: number | null): void {
      if (!q) return;
      const tk = ++token;
      app.audio.stopAll();
      cancelAnimationFrame(raf);
      const p = q.answer;
      const spb = 60 / rhythmBpm(p);
      const total = BEATS_PER_BAR * q.bars;
      const t0 = app.audio.now() + 0.3 + BEATS_PER_BAR * spb;
      for (let b = -BEATS_PER_BAR; b < total; b++) app.audio.click(t0 + b * spb, ((b % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0);
      for (const [at, len] of rhythmTones(p)) void app.audio.scheduleFreq(TONE_HZ, t0 + at * spb, len * spb, 0.8);
      stage.classList.add('rq-listening');
      const starts: number[] = [];
      let b = 0;
      for (const s of p) {
        starts.push(b);
        b += SYMBOL[s].beats;
      }
      const els = show !== null ? cellEls[show] : [];
      const loop = () => {
        if (tk !== token) return;
        const beat = (app.audio.now() - t0) / spb;
        els.forEach((e, k) => e.classList.toggle('now', beat >= starts[k] && beat < (starts[k + 1] ?? total)));
        if (beat < total + 0.2) raf = requestAnimationFrame(loop);
        else {
          stage.classList.remove('rq-listening');
          els.forEach((e) => e.classList.remove('now'));
        }
      };
      raf = requestAnimationFrame(loop);
    }

    function pick(i: number): void {
      if (!q || answered) return;
      answered = true;
      token++;
      app.audio.stopAll();
      cancelAnimationFrame(raf);
      stage.classList.remove('rq-listening');
      const ok = i === q.correct;
      if (ok) score++;
      cards.forEach((c, k) => {
        c.disabled = true;
        if (k === q!.correct) c.classList.add('good');
        else if (k === i) c.classList.add('miss');
        else c.classList.add('dim');
      });
      if (ok) {
        void app.audio.chime();
        ms.react('cheer');
      } else ms.react('think');
      const title = stage.querySelector('.rq-title');
      if (title) title.textContent = ok ? '🎉 Đúng rồi!' : '👀 Thẻ đúng đây!';
      const correct = q.correct;
      setBar(
        backButton(leave),
        button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => play(correct) }),
        button({ icon: '▶', label: round >= RHYTHM_ROUNDS ? 'Xem điểm' : 'Tiếp', kind: 'primary', big: true, onTap: next }),
      );
      // Sai: tự gõ lại mẫu và sáng từng ô của thẻ đúng — bé nối tiếng với hình
      const tk = token;
      if (!ok) window.setTimeout(() => tk === token && play(correct), 600);
    }

    function finish(): void {
      token++;
      app.audio.stopAll();
      showEnd(app, shell, {
        id: 'rhythmQuiz',
        score,
        scoreText: `Đúng ${score} / ${RHYTHM_ROUNDS}`,
        stars: rhythmStars(score),
        onAgain: () => {
          round = 0;
          score = 0;
          q = null;
          next();
        },
        onHub,
      });
    }

    function leave(): void {
      token++;
      app.audio.stopAll();
      cancelAnimationFrame(raf);
      intro();
    }

    intro();
    return () => {
      token++;
      stopIntroVoice();
      cancelAnimationFrame(raf);
      cancelSpeech();
    };
  };
}
