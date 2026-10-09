/**
 * 🎯 "Bắt nhịp" — các chấm nhịp (👣 🏃 🐢 … đúng nhịp con đã học) trôi từ phải sang vạch đích theo nhạc đệm;
 * bé chạm TẤM TRỐNG to đúng lúc chấm chạm vạch (micro bật → gõ phím bất kỳ trên đàn thật cũng được).
 * 12 ô nhịp (~40 giây). Chấm theo cửa sổ thời gian (music/timing.ts): "Tuyệt!" / "Tốt!" / "Được!" — lỡ thì chấm
 * mờ đi, không có tiếng "sai". Điểm 0–100.
 *
 * Giảm chuyển động (Cài đặt hệ thống): dải chấm nhảy từng nửa phách thay vì trôi mượt, không nhún/rung.
 */
import { GAME_INFO } from '../../../practice/games/catalog';
import {
  BEAT_WARM_BARS,
  BEAT_WORD,
  BeatJudge,
  beatStars,
  beatSymbols,
  beatWindow,
  makeBeatSong,
  targetSymbols,
  type BeatHit,
  type BeatSong,
} from '../../../practice/games/beatCatch';
import { BEATS_PER_BAR } from '../../../practice/games/rhythmQuiz';
import { cancelSpeech } from '../../../audio/voice';
import type { App } from '../../App';
import { backButton, h } from '../../components/dom';
import { SYMBOL } from '../rhythm';
import { gameShell, mascotSlot, reducedMotion, showEnd, showIntro } from './shared';

/** px mỗi phách trên dải chấm, vị trí vạch đích (px từ mép trái dải) */
const PX_PER_BEAT = 150;
const HIT_X = 150;
const COUNT_IN = BEATS_PER_BAR;
/** Âm trầm nhạc đệm: Đô3 (phách 1) · Sol2 (phách 3); tiếng gõ mẫu ở các ô đầu */
const BASS_1 = 130.81;
const BASS_3 = 98;
const GUIDE_HZ = 659.25;

export function beatCatchScreen(app: App, onHub: () => void) {
  return (root: HTMLElement) => {
    const week = app.store.get().progress.currentWeek;
    const learned = beatSymbols(week);
    const shell = gameShell(root);
    const { stage, setBar } = shell;
    const ms = mascotSlot(72);
    let token = 0;
    let raf = 0;
    let spoken = false;
    let stopIntroVoice: () => void = () => undefined;
    let unOnset: () => void = () => undefined;
    let running = false;
    let song: BeatSong | null = null;
    let judge: BeatJudge | null = null;
    let t0 = 0;
    let spb = 0.75;
    /** Đồng hồ (giây): AudioContext (khớp tiếng tích) — không có âm thanh thì đồng hồ trang */
    let clock: () => number = () => app.audio.now();
    let outLat = 0;
    let combo = 0;
    let bestCombo = 0;
    let dotEls: HTMLElement[] = [];
    const reduce = reducedMotion();

    const track = h('div', { class: 'bc-track' });
    const lane = h('div', { class: 'bc-lane' }, h('div', { class: 'bc-hitline', 'aria-hidden': 'true' }), track);
    const countEl = h('div', { class: 'bc-count', 'aria-live': 'polite' });
    const wordEl = h('div', { class: 'bc-word', 'aria-live': 'polite' });
    const scoreEl = h('div', { class: 'rush-score' }, '0');
    const comboEl = h('div', { class: 'eg-streak' });
    const hintEl = h('div', { class: 'bc-hint' });
    const pad = h(
      'button',
      { class: 'bc-pad', type: 'button', 'aria-label': 'Chạm theo nhịp' },
      h('span', { class: 'bc-pad-emoji', 'aria-hidden': 'true' }, '🥁'),
      h('span', { class: 'bc-pad-label' }, 'CHẠM!'),
    );
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tapNow();
    });
    const onKey = (e: KeyboardEvent) => {
      if (running && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        tapNow();
      }
    };
    document.addEventListener('keydown', onKey);

    function intro(): void {
      token++;
      running = false;
      const info = GAME_INFO.beatCatch;
      stopIntroVoice = showIntro(app, shell, {
        emoji: info.emoji,
        title: info.title,
        say: 'Chấm nhịp chạy tới vạch. Đúng lúc chấm chạm vạch, con chạm vào trống nhé!',
        extra: h(
          'div',
          { class: 'rq-legend' },
          ...learned.map((s) => h('span', { 'aria-hidden': 'true' }, `${SYMBOL[s].emoji} ${SYMBOL[s].label}`)),
          app.micWanted ? h('p', { class: 'game-sub' }, '🎤 Gõ phím bất kỳ trên đàn thật cũng được!') : null,
        ),
        best: app.store.gameScore('beatCatch')?.best,
        unit: info.unit,
        speakNow: !spoken,
        onStart: () => void start(),
        onBack: onHub,
      });
      spoken = true;
    }

    /** Dựng dải chấm: mỗi chấm ở vị trí phách × PX; nốt dài có "đuôi"; vạch nhịp mỗi ô. */
    function buildTrack(s: BeatSong): void {
      const syms = targetSymbols(s);
      dotEls = s.targets.map((b, i) => {
        const sym = syms[i];
        const tail = SYMBOL[sym].hits.length === 1 && SYMBOL[sym].beats >= 2 ? (SYMBOL[sym].beats - 0.3) * PX_PER_BEAT : 0;
        return h(
          'div',
          { class: `bc-dot bc-${sym}`, style: { left: `${b * PX_PER_BEAT}px` } },
          tail ? h('span', { class: 'bc-tail', style: { width: `${tail}px` } }) : null,
          h('span', { class: 'bc-dot-face', 'aria-hidden': 'true' }, SYMBOL[sym].emoji),
        );
      });
      const lines: HTMLElement[] = [];
      for (let bar = 0; bar <= s.bars.length; bar++)
        lines.push(h('div', { class: 'bc-barline', style: { left: `${bar * BEATS_PER_BAR * PX_PER_BEAT - PX_PER_BEAT * 0.25}px` } }));
      track.replaceChildren(...lines, ...dotEls);
    }

    function setTrack(beat: number): void {
      const b = reduce ? Math.floor(beat * 2) / 2 : beat;
      track.style.transform = `translate3d(${(HIT_X - b * PX_PER_BEAT).toFixed(1)}px,0,0)`;
    }

    async function start(): Promise<void> {
      const tk = ++token;
      stopIntroVoice();
      cancelSpeech();
      app.audio.stopAll();
      unOnset();
      combo = 0;
      bestCombo = 0;
      song = makeBeatSong(week);
      judge = new BeatJudge(song.targets, beatWindow(app.store.settings.timing));
      spb = 60 / song.bpm;
      buildTrack(song);
      setTrack(-COUNT_IN);
      scoreEl.textContent = '0';
      comboEl.textContent = ' ';
      wordEl.textContent = '';
      hintEl.textContent = '';
      ms.react('happy', false);
      stage.replaceChildren(
        h(
          'div',
          { class: 'bc-hud' },
          h('div', { class: 'rush-score-box' }, h('span', { 'aria-hidden': 'true' }, '⭐'), scoreEl),
          comboEl,
          hintEl,
          ms.el,
        ),
        lane,
        h('div', { class: 'bc-under' }, countEl, pad, wordEl),
      );
      setBar(backButton(leave));
      // Âm thanh chưa mở (vd vào thẳng trò) → mở trong cú chạm "Bắt đầu"; không có âm thanh thì chạy theo đồng hồ trang
      if (!app.audio.isRunning) await app.audio.unlock().catch(() => false);
      if (tk !== token) return;
      const audioClock = app.audio.isRunning;
      clock = audioClock ? () => app.audio.now() : () => performance.now() / 1000;
      outLat = audioClock ? app.audio.outputLatency : 0;
      // Micro (nếu phụ huynh bật): nghe tiếng GÕ phím trên đàn thật
      let useMic = false;
      if (app.micWanted) {
        hintEl.textContent = '🎤 …';
        useMic = await app.ensureMic();
        if (tk !== token) return;
        hintEl.textContent = useMic ? '🎤 Gõ phím trên đàn cũng được' : '';
      }
      t0 = clock() + 0.5 + COUNT_IN * spb;
      const total = song.totalBeats;
      // Nhạc đệm: tích mỗi phách (phách 1 mạnh) + trầm Đô/Sol (micro bật thì chỉ tiếng tích — micro không nghe nhầm)
      for (let b = -COUNT_IN; b < total; b++) {
        const inBar = ((b % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
        app.audio.click(t0 + b * spb, inBar === 0);
        if (!useMic && b >= 0 && (inBar === 0 || inBar === 2))
          void app.audio.scheduleFreq(inBar === 0 ? BASS_1 : BASS_3, t0 + b * spb, spb * 0.9, 0.55, false);
      }
      // Tiếng gõ mẫu ở các ô đầu (bé nghe nhịp mình cần chạm) — tắt khi dùng micro
      if (!useMic)
        for (const x of song.targets) if (x < (BEAT_WARM_BARS + 1) * BEATS_PER_BAR) void app.audio.scheduleFreq(GUIDE_HZ, t0 + x * spb, 0.08, 0.35, false);
      if (useMic && audioClock) {
        const lat = app.mic.inputOutputLatency();
        unOnset = app.mic.onOnset((at) => tap((at - lat - t0) / spb));
      }
      running = true;
      let lastCount = '';
      const loop = () => {
        if (tk !== token || !judge || !song) return;
        // Hình khớp với TIẾNG bé nghe (loa trễ outputLatency)
        const beat = (clock() - outLat - t0) / spb;
        setTrack(beat);
        // Đếm vào "1 2 3 4" rồi tắt
        const c = beat < 0 ? String(Math.max(1, Math.min(COUNT_IN, Math.floor(beat + COUNT_IN) + 1))) : '';
        if (c !== lastCount) countEl.textContent = lastCount = c;
        if (beat >= (BEAT_WARM_BARS + 1) * BEATS_PER_BAR && !hintEl.dataset.solo && !useMic) {
          hintEl.dataset.solo = '1';
          hintEl.textContent = '💪 Giờ con tự bắt nhịp!';
        }
        for (const i of judge.sweep(beat)) {
          dotEls[i]?.classList.add('missed');
          combo = 0;
          comboEl.textContent = ' ';
        }
        if (beat < song.totalBeats + 1) raf = requestAnimationFrame(loop);
        else finish();
      };
      delete hintEl.dataset.solo;
      raf = requestAnimationFrame(loop);
    }

    function tapNow(): void {
      if (!running) return;
      pad.classList.remove('hit');
      void pad.offsetWidth;
      pad.classList.add('hit');
      tap((clock() - outLat - t0) / spb);
    }

    function tap(beat: number): void {
      if (!running || !judge) return;
      const hit: BeatHit | null = judge.tap(beat);
      if (!hit) return;
      const el = dotEls[hit.index];
      el?.classList.add('hit', `hit-${hit.grade}`);
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      scoreEl.textContent = String(judge.percent);
      comboEl.textContent = combo >= 4 ? `🔥 ×${combo}` : ' ';
      wordEl.textContent = BEAT_WORD[hit.grade];
      wordEl.className = `bc-word w-${hit.grade}`;
      if (!reduce) {
        void wordEl.offsetWidth;
        wordEl.classList.add('pop');
      }
      if (combo > 0 && combo % 8 === 0) ms.react('cheer');
    }

    function finish(): void {
      if (!running || !judge) return;
      running = false;
      token++;
      cancelAnimationFrame(raf);
      unOnset();
      unOnset = () => undefined;
      const pct = judge.percent;
      showEnd(app, shell, {
        id: 'beatCatch',
        score: pct,
        scoreText: `${pct} điểm${bestCombo >= 8 ? ` · 🔥 ×${bestCombo}` : ''}`,
        stars: beatStars(pct),
        extra: { streak: bestCombo },
        onAgain: () => void start(),
        onHub,
      });
    }

    function leave(): void {
      token++;
      running = false;
      cancelAnimationFrame(raf);
      app.audio.stopAll();
      unOnset();
      unOnset = () => undefined;
      intro();
    }

    // Ẩn app giữa chừng (đồng hồ âm thanh vẫn chạy) → dừng lượt, về màn giới thiệu
    const onVis = () => {
      if (document.visibilityState === 'hidden' && running) leave();
    };
    document.addEventListener('visibilitychange', onVis);

    intro();
    return () => {
      token++;
      running = false;
      stopIntroVoice();
      cancelSpeech();
      cancelAnimationFrame(raf);
      app.audio.stopAll();
      unOnset();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      app.mic.stop();
    };
  };
}
