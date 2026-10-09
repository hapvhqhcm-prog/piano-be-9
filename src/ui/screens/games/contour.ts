/**
 * 🎢 "Lên hay xuống?" — app chơi 2–3 nốt bằng một TIẾNG ĐÀN BÍ MẬT (piano hoặc tiếng con đã mở khóa: hộp nhạc,
 * đàn gỗ, sáo…), bé chọn thẻ hình đường đi của giai điệu. 8 câu, khó dần (2 nốt → 3 nốt, nốt gần nhau dần).
 * Sai: thẻ đúng sáng + app chơi lại, từng chấm trên thẻ đúng sáng theo nốt. Không cần micro.
 */
import { pitchFreq } from '../../../piano/pitchTable';
import { GAME_INFO } from '../../../practice/games/catalog';
import {
  CONTOUR_ROUNDS,
  SHAPE_INFO,
  contourPool,
  contourStars,
  makeContourRound,
  pickVoice,
  type ContourRound,
  type Shape,
} from '../../../practice/games/contour';
import { UNLOCKS, unlockedItems } from '../../../lessons/unlocks';
import { isTimbre, playTimbre } from '../../../audio/timbres';
import { cancelSpeech } from '../../../audio/voice';
import type { App } from '../../App';
import { backButton, button, h } from '../../components/dom';
import { gameShell, mascotSlot, pause, showEnd, showIntro } from './shared';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NOTE_SEC = 0.62;

/** Hình đường đi: các chấm nối nhau (chấm cao = nốt cao). */
function shapeSvg(shape: Shape): SVGSVGElement {
  const ys: Record<Shape, number[]> = {
    up: [78, 22],
    down: [22, 78],
    upup: [84, 50, 16],
    downdown: [16, 50, 84],
    updown: [78, 18, 78],
    downup: [18, 78, 18],
  };
  const y = ys[shape];
  const xs = y.length === 2 ? [40, 120] : [24, 80, 136];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 160 100');
  svg.setAttribute('class', 'ct-svg');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('points', xs.map((x, i) => `${x},${y[i]}`).join(' '));
  line.setAttribute('class', 'ct-line');
  svg.append(line);
  xs.forEach((x, i) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(x));
    c.setAttribute('cy', String(y[i]));
    c.setAttribute('r', '11');
    c.setAttribute('class', 'ct-dot');
    svg.append(c);
  });
  return svg;
}

function voiceLabel(v: string): string {
  if (v === 'piano') return '🎹 Đàn piano';
  const u = UNLOCKS.find((x) => x.kind === 'timbre' && x.key === v);
  return u ? `${u.icon} ${u.title}` : '🎹 Đàn piano';
}

export function contourScreen(app: App, onHub: () => void) {
  return (root: HTMLElement) => {
    const data = app.store.get();
    const week = data.progress.currentWeek;
    const pool = contourPool(week);
    const timbres = unlockedItems(data)
      .filter((u) => u.kind === 'timbre' && isTimbre(u.key))
      .map((u) => u.key);
    const shell = gameShell(root);
    const { stage, setBar } = shell;
    const ms = mascotSlot(84);
    let round = 0;
    let score = 0;
    let q: ContourRound | null = null;
    let voice = 'piano';
    let answered = false;
    let token = 0;
    let spoken = false;
    let stopIntroVoice: () => void = () => undefined;
    let cards: HTMLButtonElement[] = [];

    function intro(): void {
      token++;
      const info = GAME_INFO.contour;
      stopIntroVoice = showIntro(app, shell, {
        emoji: info.emoji,
        title: info.title,
        say: 'Nghe giai điệu đi lên hay đi xuống, rồi chạm vào hình đúng nhé!',
        extra: timbres.length
          ? h('p', { class: 'game-sub' }, `🎁 Có cả tiếng đàn con đã mở: ${timbres.map((t) => voiceLabel(t).split(' ')[0]).join(' ')}`)
          : null,
        best: app.store.gameScore('contour')?.best,
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

    function next(): void {
      if (round >= CONTOUR_ROUNDS) return finish();
      token++;
      cancelSpeech();
      q = makeContourRound(pool, round, week, Math.random, q?.shape);
      // Đổi tiếng sau mỗi 2 câu (đủ lâu để bé quen tai), bắt đầu bằng piano
      if (round % 2 === 0) voice = round === 0 ? 'piano' : pickVoice(timbres);
      round++;
      answered = false;
      ms.react('happy', false);
      const cur = q;
      cards = cur.options.map((s, i) => {
        const c = h(
          'button',
          { class: `ct-card ct-${s}`, type: 'button', 'aria-label': SHAPE_INFO[s].label },
          shapeSvg(s),
          h('span', { class: 'ct-label' }, SHAPE_INFO[s].label),
        );
        c.addEventListener('click', () => pick(i));
        return c;
      });
      stage.replaceChildren(
        h(
          'div',
          { class: 'rq-head' },
          h('div', { class: 'progress' }, `Câu ${round} / ${CONTOUR_ROUNDS}${cur.notes.length > 2 ? ' · 💪 3 nốt' : ''}`),
          h('h1', { class: 'title rq-title' }, h('span', { class: 'rq-ear', 'aria-hidden': 'true' }, '👂'), 'Giai điệu đi thế nào?'),
          ms.el,
        ),
        h('div', { class: 'ct-voice' }, `Tiếng đàn: ${voiceLabel(voice)}`),
        h('div', { class: `ct-cards n${cards.length}` }, ...cards),
      );
      setBar(backButton(leave), button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => void play(null) }));
      const tk = token;
      window.setTimeout(() => tk === token && void play(null), 350);
    }

    function tone(p: string): void {
      if (voice !== 'piano' && isTimbre(voice)) playTimbre(app.audio.context, voice, pitchFreq(p), NOTE_SEC * 0.9);
      else void app.audio.playPitch(p, NOTE_SEC * 1.1);
    }

    /** Chơi giai điệu; `show` = thẻ có các chấm sáng theo từng nốt. */
    async function play(show: number | null): Promise<void> {
      if (!q) return;
      const tk = ++token;
      app.audio.stopAll();
      stage.classList.add('rq-listening');
      const dots = show !== null ? [...cards[show].querySelectorAll('.ct-dot')] : [];
      for (let i = 0; i < q.notes.length; i++) {
        if (tk !== token) return;
        dots.forEach((d, k) => d.classList.toggle('now', k === i));
        tone(q.notes[i]);
        if (!(await pause(NOTE_SEC * 1000, () => tk === token))) return;
      }
      dots.forEach((d) => d.classList.remove('now'));
      stage.classList.remove('rq-listening');
    }

    function pick(i: number): void {
      if (!q || answered) return;
      answered = true;
      token++;
      app.audio.stopAll();
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
      const t = stage.querySelector('.rq-title');
      if (t) t.textContent = ok ? `🎉 Đúng rồi! ${SHAPE_INFO[q.shape].label}` : `👀 ${SHAPE_INFO[q.shape].label} — nghe nè`;
      const correct = q.correct;
      setBar(
        backButton(leave),
        button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => void play(correct) }),
        button({ icon: '▶', label: round >= CONTOUR_ROUNDS ? 'Xem điểm' : 'Tiếp', kind: 'primary', big: true, onTap: next }),
      );
      const tk = token;
      if (!ok) window.setTimeout(() => tk === token && void play(correct), 600);
    }

    function finish(): void {
      token++;
      app.audio.stopAll();
      showEnd(app, shell, {
        id: 'contour',
        score,
        scoreText: `Đúng ${score} / ${CONTOUR_ROUNDS}`,
        stars: contourStars(score),
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
      intro();
    }

    intro();
    return () => {
      token++;
      stopIntroVoice();
      cancelSpeech();
    };
  };
}
