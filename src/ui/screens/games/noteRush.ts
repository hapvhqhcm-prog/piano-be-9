/**
 * ⚡ "Đọc nốt nhanh" — 60 giây: nốt hiện trên khuông TO (hoặc tên nốt nếu chưa học khuông), bé chạm đúng phím
 * (hoặc đàn trên đàn thật khi micro bật). Sai → khuông rung + phím đúng sáng một chút (chỉ mất thời gian, không trừ điểm).
 */
import { midiToPitch, viName, type Pitch } from '../../../piano/pitchTable';
import { PianoKeyboard } from '../../../piano/PianoKeyboard';
import {
  RUSH_SECONDS,
  nextRushNote,
  rushCorrect,
  rushKeyboardRange,
  rushPool,
  rushStars,
  type RushNote,
} from '../../../practice/games/noteRush';
import { GAME_INFO } from '../../../practice/games/catalog';
import type { Tune } from '../../../music/tune';
import { speechBusy } from '../../../audio/voice';
import type { App } from '../../App';
import { backButton, h } from '../../components/dom';
import { StaffView } from '../../components/staffView';
import { gameShell, mascotSlot, showEnd, showIntro } from './shared';

const NEXT_AFTER_GOOD_MS = 220;
const NEXT_AFTER_MISS_MS = 950;

function bigStaff(n: RushNote, k: number): HTMLElement {
  const tune: Tune = { id: `rush-${k}`, title: '', titleVi: '', hand: n.clef === 'bass' ? 'LH' : 'RH', bpm: 60, timeSignature: '4/4', notes: [{ pitch: n.pitch, beats: 4 }] };
  const staff = new StaffView(tune, { clef: n.clef, names: false, fingers: false, measuresPerPage: 1, pxPerBeat: 30 });
  staff.el.classList.add('staff-mini', 'staff-quiz', 'rush-staff');
  return staff.el;
}

export function noteRushScreen(app: App, onHub: () => void) {
  return (root: HTMLElement) => {
    const pool = rushPool(app.store.get().progress.currentWeek);
    const [low, high] = rushKeyboardRange(pool);
    let playing = false;
    let locked = false;
    let cur: RushNote | null = null;
    let score = 0;
    let combo = 0;
    let bestCombo = 0;
    let k = 0;
    let token = 0;
    let tick = 0;
    let stepTimer = 0;
    let unNote: () => void = () => undefined;
    let spoken = false;
    let stopIntroVoice: () => void = () => undefined;
    // Đồng hồ có thể tạm dừng (ẩn app giữa chừng → không mất giây)
    let usedMs = 0;
    let runFrom = 0;
    const elapsed = () => usedMs + (runFrom ? performance.now() - runFrom : 0);

    const kb = new PianoKeyboard({
      low,
      high,
      labels: 'c',
      fingerOnPress: false,
      onPress: (p) => {
        void app.audio.playPitch(p, 0.6);
        answer(p, false);
      },
    });
    const kbWrap = h('div', { class: 'keyboard-wrap rush-kb' }, kb.el);
    const shell = gameShell(root, kbWrap);
    const { stage, setBar } = shell;

    // ---- HUD ----
    const timeFill = h('div', { class: 'rush-time-fill' });
    const timeText = h('div', { class: 'rush-time-text' }, String(RUSH_SECONDS));
    const scoreEl = h('div', { class: 'rush-score', 'aria-live': 'polite' }, '0');
    const comboFill = h('div', { class: 'rush-combo-fill' });
    const comboText = h('div', { class: 'rush-combo-text' }, ' ');
    const noteBox = h('div', { class: 'rush-note' });
    const ms = mascotSlot(88);
    const micTag = h('div', { class: 'rush-mic' });

    function intro(): void {
      token++;
      playing = false;
      kb.clear();
      const info = GAME_INFO.noteRush;
      const say =
        pool.mode === 'staff'
          ? 'Nốt hiện trên khuông — con chạm đúng phím thật nhanh! Có 60 giây.'
          : 'Tên nốt hiện ra — con tìm đúng phím thật nhanh! Có 60 giây.';
      stopIntroVoice = showIntro(app, shell, {
        emoji: info.emoji,
        title: info.title,
        say,
        extra: app.micWanted ? h('p', { class: 'game-sub' }, '🎤 Con đàn trên đàn thật cũng được!') : null,
        best: app.store.gameScore('noteRush')?.best,
        unit: info.unit,
        speakNow: !spoken,
        onStart: () => void start(),
        onBack: onHub,
      });
      spoken = true;
    }

    async function start(): Promise<void> {
      const tk = ++token;
      stopIntroVoice();
      score = 0;
      combo = 0;
      bestCombo = 0;
      usedMs = 0;
      runFrom = 0;
      cur = null;
      kbWrap.hidden = false;
      scoreEl.textContent = '0';
      setCombo();
      timeFill.style.transform = 'scaleX(1)';
      timeText.textContent = String(RUSH_SECONDS);
      ms.react('happy', false);
      stage.replaceChildren(
        h(
          'div',
          { class: 'rush-hud' },
          h('div', { class: 'rush-time' }, h('span', { 'aria-hidden': 'true' }, '⏱'), h('div', { class: 'rush-time-bar' }, timeFill), timeText),
          h('div', { class: 'rush-score-box' }, h('span', { 'aria-hidden': 'true' }, '⭐'), scoreEl),
          h('div', { class: 'rush-combo' }, h('span', { 'aria-hidden': 'true' }, '🔥'), h('div', { class: 'rush-combo-bar' }, comboFill), comboText),
        ),
        h('div', { class: 'rush-main' }, ms.el, noteBox, micTag),
      );
      setBar(backButton(() => leave()));
      // Micro (nếu phụ huynh bật) — xin trong cú chạm "Bắt đầu"
      if (app.micWanted) {
        micTag.textContent = '🎤 …';
        const on = await app.ensureMic();
        if (tk !== token) return;
        micTag.textContent = on ? '🎤 Đang nghe đàn' : '';
        unNote();
        unNote = on
          ? app.mic.onNote((n) => {
              // Tiếng của chính app (phím ảo, chuông) / giọng đọc → bỏ qua
              if (app.audio.isSounding || app.audio.msSinceSound() < 120 || speechBusy()) return;
              answer(midiToPitch(n.midi), true);
            })
          : () => undefined;
      } else micTag.textContent = '';
      // Đếm 3-2-1
      for (const n of ['3', '2', '1']) {
        noteBox.replaceChildren(h('div', { class: 'rush-count' }, n));
        app.audio.click(app.audio.now() + 0.02, n === '1');
        await new Promise((r) => window.setTimeout(r, 650));
        if (tk !== token) return;
      }
      playing = true;
      runFrom = performance.now();
      tick = window.setInterval(onTick, 100);
      showNext();
    }

    function onTick(): void {
      if (!playing) return;
      const left = Math.max(0, RUSH_SECONDS * 1000 - elapsed());
      timeFill.style.transform = `scaleX(${(left / (RUSH_SECONDS * 1000)).toFixed(3)})`;
      const sec = Math.ceil(left / 1000);
      if (timeText.textContent !== String(sec)) {
        timeText.textContent = String(sec);
        timeText.parentElement?.classList.toggle('hurry', sec <= 10);
      }
      if (left <= 0) finish();
    }

    function setCombo(): void {
      comboFill.style.transform = `scaleX(${Math.min(combo, 10) / 10})`;
      comboText.textContent = combo >= 2 ? `×${combo}` : ' ';
      comboText.parentElement?.classList.toggle('hot', combo >= 5);
    }

    function showNext(): void {
      if (!playing) return;
      locked = false;
      kb.clear();
      cur = nextRushNote(pool, Math.random, cur ?? undefined);
      k++;
      noteBox.replaceChildren(
        pool.mode === 'staff'
          ? bigStaff(cur, k)
          : h('div', { class: 'rush-name', 'aria-label': `Nốt ${viName(cur.pitch)}` }, viName(cur.pitch)),
      );
    }

    function answer(p: Pitch, fromMic: boolean): void {
      if (!playing || locked || !cur) return;
      locked = true;
      const ok = rushCorrect(pool, cur, p, fromMic);
      window.clearTimeout(stepTimer);
      if (ok) {
        score++;
        combo++;
        bestCombo = Math.max(bestCombo, combo);
        scoreEl.textContent = String(score);
        scoreEl.classList.remove('pop');
        void scoreEl.offsetWidth;
        scoreEl.classList.add('pop');
        if (!fromMic) kb.setResult(p, 'good');
        setCombo();
        if (combo % 5 === 0) {
          ms.react('cheer');
          void app.audio.chime();
        } else if (combo === 1) ms.react('happy', false);
        stepTimer = window.setTimeout(showNext, NEXT_AFTER_GOOD_MS);
      } else {
        combo = 0;
        setCombo();
        ms.react('think');
        kb.setResult(cur.pitch, 'show'); // chế độ tên: nốt ở quãng tám 4 — luôn có trên bàn phím Đô4–Đô5
        const box = noteBox.firstElementChild;
        box?.classList.remove('shake');
        void (box as HTMLElement | null)?.offsetWidth;
        box?.classList.add('shake');
        stepTimer = window.setTimeout(showNext, NEXT_AFTER_MISS_MS);
      }
    }

    function finish(): void {
      if (!playing) return;
      playing = false;
      token++;
      window.clearInterval(tick);
      window.clearTimeout(stepTimer);
      runFrom = 0;
      kb.clear();
      kbWrap.hidden = true; // màn kết gọn: ẩn bàn phím
      unNote();
      unNote = () => undefined;
      showEnd(app, shell, {
        id: 'noteRush',
        score,
        scoreText: `${score} nốt đúng${bestCombo >= 5 ? ` · 🔥 ×${bestCombo}` : ''}`,
        stars: rushStars(score),
        onAgain: () => void start(),
        onHub,
      });
    }

    function leave(): void {
      token++;
      playing = false;
      window.clearInterval(tick);
      window.clearTimeout(stepTimer);
      unNote();
      unNote = () => undefined;
      kbWrap.hidden = false;
      intro();
    }

    // Ẩn app giữa chừng (gọi điện, khóa màn hình) → dừng đồng hồ; quay lại chạy tiếp
    const onVis = () => {
      if (!playing) return;
      if (document.visibilityState === 'hidden' && runFrom) {
        usedMs += performance.now() - runFrom;
        runFrom = 0;
      } else if (document.visibilityState === 'visible' && !runFrom) runFrom = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);

    intro();
    return () => {
      token++;
      playing = false;
      stopIntroVoice();
      window.clearInterval(tick);
      window.clearTimeout(stepTimer);
      document.removeEventListener('visibilitychange', onVis);
      unNote();
      app.mic.stop();
      kb.destroy();
    };
  };
}
