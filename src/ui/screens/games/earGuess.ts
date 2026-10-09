/**
 * 🎧 "Đoán nốt" — app chơi Đô (nốt mốc, phím Đô sáng) rồi một NỐT BÍ MẬT; bé chạm đúng phím (hoặc đàn trên đàn thật
 * khi micro bật). 10 câu; đúng 3 câu liền → thêm 1 nốt vào bể (bể rộng dần). Sai: phím đúng sáng + nghe lại nốt đó
 * (không có tiếng "sai", không trừ điểm — chỉ mất chuỗi 🔥).
 */
import { viName, type Pitch } from '../../../piano/pitchTable';
import { PianoKeyboard } from '../../../piano/PianoKeyboard';
import { GAME_INFO } from '../../../practice/games/catalog';
import {
  EAR_REFERENCE,
  EAR_ROUNDS,
  earAnswer,
  earCorrect,
  earInit,
  earLevelNotes,
  earMaxLevel,
  earPool,
  earStars,
  earStartLevel,
  nextEarNote,
  type EarState,
} from '../../../practice/games/earGuess';
import { cancelSpeech } from '../../../audio/voice';
import type { App } from '../../App';
import { backButton, button, h } from '../../components/dom';
import { gameShell, listenPiano, mascotSlot, pause, showEnd, showIntro } from './shared';

export function earGuessScreen(app: App, onHub: () => void) {
  return (root: HTMLElement) => {
    const pool = earPool(app.store.get().progress.currentWeek);
    const maxLevel = earMaxLevel(pool);
    let st: EarState = earInit(1);
    let notes: Pitch[] = [];
    let secret: Pitch | null = null;
    let waiting = false;
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
        void app.audio.playPitch(p, 0.6);
        answer(p);
      },
    });
    const kbWrap = h('div', { class: 'keyboard-wrap eg-kb' }, kb.el);
    const shell = gameShell(root, kbWrap);
    const { stage, setBar } = shell;
    const ms = mascotSlot(84);
    const roundEl = h('div', { class: 'progress' });
    const streakEl = h('div', { class: 'eg-streak', 'aria-live': 'polite' });
    const setEl = h('div', { class: 'eg-set', 'aria-label': 'Các nốt trong trò' });
    const title = h('h1', { class: 'title eg-title' });
    const micTag = h('div', { class: 'rush-mic' });

    function intro(): void {
      token++;
      waiting = false;
      kb.clear();
      kbWrap.hidden = true;
      const info = GAME_INFO.earGuess;
      stopIntroVoice = showIntro(app, shell, {
        emoji: info.emoji,
        title: info.title,
        say: 'Nghe nốt Đô trước, rồi một nốt bí mật. Con tìm đúng phím nhé!',
        extra: app.micWanted ? h('p', { class: 'game-sub' }, '🎤 Con đàn trên đàn thật cũng được!') : null,
        best: app.store.gameScore('earGuess')?.best,
        unit: info.unit,
        speakNow: !spoken,
        onStart: () => void start(),
        onBack: onHub,
      });
      spoken = true;
    }

    function renderSet(newNote?: Pitch): void {
      setEl.replaceChildren(
        ...notes.map((p) => h('span', { class: `eg-chip${p === newNote ? ' new' : ''}` }, viName(p))),
      );
    }

    function renderStreak(): void {
      streakEl.textContent = st.streak >= 2 ? `🔥 ×${st.streak}` : ' ';
      streakEl.classList.toggle('hot', st.streak >= 3);
    }

    async function start(): Promise<void> {
      const tk = ++token;
      stopIntroVoice();
      st = earInit(earStartLevel(app.store.gameScore('earGuess')?.level, pool));
      notes = earLevelNotes(pool, st.level);
      secret = null;
      kbWrap.hidden = false;
      renderSet();
      renderStreak();
      ms.react('happy', false);
      stage.replaceChildren(
        h('div', { class: 'rq-head' }, roundEl, title, ms.el),
        h('div', { class: 'eg-row' }, streakEl, setEl, micTag),
      );
      setBar(backButton(leave));
      micOff();
      micTag.textContent = app.micWanted ? '🎤 …' : '';
      const mic = await listenPiano(app, (p) => answer(p));
      if (tk !== token) return mic.off();
      micOff = mic.off;
      micTag.textContent = mic.on ? '🎤 Đang nghe đàn' : '';
      void nextRound();
    }

    async function nextRound(): Promise<void> {
      if (st.round >= EAR_ROUNDS) return finish();
      token++;
      kb.clear();
      secret = nextEarNote(notes, Math.random, secret ?? undefined);
      roundEl.textContent = `Câu ${st.round + 1} / ${EAR_ROUNDS}`;
      ms.react('happy', false);
      setBar(backButton(leave), button({ icon: '🔊', label: 'Nghe lại', kind: 'sun', onTap: () => void playPrompt() }));
      await playPrompt();
    }

    /** Đô (phím sáng, chữ "Đô") → nghỉ → nốt bí mật (không sáng). Xong mới nhận câu trả lời. */
    async function playPrompt(): Promise<void> {
      if (!secret) return;
      const tk = ++token;
      waiting = false;
      cancelSpeech();
      app.audio.stopAll();
      kb.clear();
      kb.setGuides(notes); // các phím có thể là nốt bí mật
      title.classList.add('listening');
      kb.flash(EAR_REFERENCE, true);
      title.textContent = '👂 Đây là Đô…';
      void app.audio.playPitch(EAR_REFERENCE, 0.7);
      if (!(await pause(800, () => tk === token))) return;
      kb.flash(EAR_REFERENCE, false);
      title.textContent = '🤫 Còn đây là nốt bí mật…';
      if (!(await pause(350, () => tk === token))) return;
      void app.audio.playPitch(secret, 0.9);
      if (!(await pause(700, () => tk === token))) return;
      title.classList.remove('listening');
      title.textContent = '🎹 Nốt bí mật là nốt nào?';
      waiting = true;
    }

    function answer(p: Pitch): void {
      if (!waiting || !secret) return;
      waiting = false;
      token++;
      const want = secret;
      const ok = earCorrect(want, p);
      const r = earAnswer(st, ok, maxLevel);
      st = r.state;
      renderStreak();
      if (ok) {
        kb.setResult(p, 'good');
        void app.audio.chime();
        ms.react('cheer');
        title.textContent = `🎉 Đúng rồi! Nốt ${viName(want)}`;
      } else {
        kb.setResult(want, 'show');
        ms.react('think');
        title.textContent = `👀 Nốt bí mật là ${viName(want)} — nghe nè`;
      }
      let added: Pitch | undefined;
      if (r.levelUp) {
        const before = new Set(notes);
        notes = earLevelNotes(pool, st.level);
        added = notes.find((n) => !before.has(n));
        renderSet(added);
        kb.setGuides(notes);
      }
      const tk = token;
      void (async () => {
        // Sai: nghe lại nốt bí mật khi phím đúng đang sáng — nối tiếng với phím
        if (!ok) {
          if (!(await pause(500, () => tk === token))) return;
          void app.audio.playPitch(want, 0.8);
        }
        if (added && !(await pause(ok ? 700 : 900, () => tk === token))) return;
        if (added) title.textContent = `⬆️ Thêm nốt mới: ${viName(added)}!`;
        if (await pause(ok ? 1000 : 1500, () => tk === token)) void nextRound();
      })();
    }

    function finish(): void {
      token++;
      waiting = false;
      app.audio.stopAll();
      kb.clear();
      kbWrap.hidden = true;
      micOff();
      micOff = () => undefined;
      showEnd(app, shell, {
        id: 'earGuess',
        score: st.score,
        scoreText: `Đúng ${st.score} / ${EAR_ROUNDS}${st.bestStreak >= 3 ? ` · 🔥 ×${st.bestStreak}` : ''}`,
        stars: earStars(st.score),
        extra: { level: st.level, streak: st.bestStreak },
        onAgain: () => void start(),
        onHub,
      });
    }

    function leave(): void {
      token++;
      app.audio.stopAll();
      micOff();
      micOff = () => undefined;
      intro();
    }

    intro();
    return () => {
      token++;
      stopIntroVoice();
      cancelSpeech();
      micOff();
      app.mic.stop();
      kb.destroy();
    };
  };
}
