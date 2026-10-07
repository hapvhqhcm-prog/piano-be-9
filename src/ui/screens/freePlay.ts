import { leftHandActive } from '../../lessons/lessonEngine';
import { fingerOnKeyboard, type Hand } from '../../piano/fingering';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { noteLabel, samePitch, viName, type Pitch } from '../../piano/pitchTable';
import type { App } from '../App';
import { actionBar, backButton, button, h } from '../components/dom';
import { FINGER_NAMES, handDiagram, type HandDiagram } from '../components/handDiagram';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import { homeScreen } from './home';
import '../../styles/kidux.css';

/** Trò "Đàn theo thầy": thầy đàn vài nốt (thế Đô), bé đàn lại đúng thứ tự — đúng thì dài thêm một nốt. */
const ECHO_NOTES: Pitch[] = ['C4', 'D4', 'E4', 'F4', 'G4'];
const ECHO_START = 3;
const ECHO_MAX = 6;

/** Đàn tự do — chạm phím → tiếng + sáng phím + ngón nào (tay phải; tay trái từ tuần 6). Kèm trò "🎵 Đàn theo thầy". */
export function freePlayScreen(app: App) {
  return (root: HTMLElement) => {
    const lhOn = leftHandActive(app.store.get());
    const big = h('div', { class: 'note-big' }, 'Chạm một phím');
    const fingerText = h('div', { class: 'finger-big' }, ' ');
    const fingerName = h('div', { class: 'finger-name' }, lhOn ? 'Tay phải: Đô→Sol, ngón 1 đến 5 · Tay trái: Đô trầm→Sol trầm' : 'Đô Rê Mi Fa Sol: ngón 1 2 3 4 5');
    const small = h('div', { class: 'note-sub' }, ' ');
    const hands: Record<Hand, HandDiagram> = { RH: handDiagram('RH'), LH: handDiagram('LH') };
    const row = h('div', { class: 'finger-row hand-rh' }, hands.RH.el, h('div', { class: 'finger-text' }, fingerText, fingerName));

    // ---- Trò "Đàn theo thầy" ----
    let echo: { seq: Pitch[]; pos: number; listening: boolean } | null = null;
    let echoLen = ECHO_START;
    let token = 0;
    const echoMsg = h('div', { class: 'echo-msg' });
    const echoMascot = h('div', { class: 'echo-mascot' }, mascot('wave', 56));
    const setMascot = (m: Parameters<typeof mascot>[0], cls = '') => {
      echoMascot.className = `echo-mascot ${cls}`;
      echoMascot.replaceChildren(mascot(m, 56));
    };
    const echoBtn: HTMLButtonElement = button({ icon: '🎵', label: 'Đàn theo thầy', kind: 'sun', onTap: () => (echo ? stopEcho() : startEcho()) });
    const echoBox = h('div', { class: 'echo-box' }, echoMascot, echoMsg, echoBtn);
    const setEchoBtn = (on: boolean) => {
      echoBtn.querySelector('.btn-label')!.textContent = on ? 'Dừng trò' : 'Đàn theo thầy';
      echoBtn.querySelector('.btn-icon')!.textContent = on ? '⏹' : '🎵';
    };
    const playEcho = async () => {
      if (!echo) return;
      const tk = ++token;
      echo.listening = false;
      echo.pos = 0;
      echoMsg.textContent = `👂 Nghe thầy đàn ${echo.seq.length} nốt…`;
      setMascot('happy');
      await app.audio.playSequence(echo.seq, { duration: 0.55, gap: 0.15, onEach: (p, on) => kb.flash(p, on) });
      if (tk !== token || !echo) return;
      echo.listening = true;
      echoMsg.textContent = '🎹 Đến lượt con — đàn lại y như thầy!';
    };
    const newSeq = (): Pitch[] => {
      const out: Pitch[] = [];
      for (let i = 0; i < echoLen; i++) {
        let p: Pitch;
        do p = ECHO_NOTES[Math.floor(Math.random() * ECHO_NOTES.length)];
        while (out.length && p === out[out.length - 1]);
        out.push(p);
      }
      return out;
    };
    function startEcho(): void {
      wi = 1;
      kb.setRange(WINDOWS[1][0], WINDOWS[1][1]);
      range.textContent = `${WINDOWS[1][2]}: ${WINDOWS[1][0]}–${WINDOWS[1][1]}`;
      echoLen = ECHO_START;
      echo = { seq: newSeq(), pos: 0, listening: false };
      setEchoBtn(true);
      echoBox.classList.add('on');
      void playEcho();
    }
    function stopEcho(): void {
      token++;
      echo = null;
      setEchoBtn(false);
      echoBox.classList.remove('on');
      echoMsg.textContent = '';
      setMascot('wave');
    }
    const onEchoKey = (p: Pitch) => {
      if (!echo || !echo.listening) return;
      const want = echo.seq[echo.pos];
      if (samePitch(p, want)) {
        echo.pos++;
        kb.setResult(p, 'good');
        if (echo.pos < echo.seq.length) return;
        // Đúng cả câu → dài thêm một nốt
        echo.listening = false;
        void app.audio.chime();
        confetti(24);
        setMascot('cheer', 'react-bounce');
        echoMsg.textContent = echoLen < ECHO_MAX ? `🎉 Giỏi quá! Lần sau ${echoLen + 1} nốt nhé!` : '🏆 Siêu trí nhớ! Thêm một câu nữa nào!';
        echoLen = Math.min(ECHO_MAX, echoLen + 1);
        const tk = token;
        window.setTimeout(() => {
          if (tk !== token || !echo) return;
          echo.seq = newSeq();
          void playEcho();
        }, 1600);
      } else {
        echo.listening = false;
        kb.setResult(want, 'show');
        setMascot('think', 'react-scratch');
        echoMsg.textContent = `Gần đúng! Nốt đó là ${viName(want)} — nghe lại nhé`;
        const tk = token;
        window.setTimeout(() => tk === token && void playEcho(), 1500);
      }
    };

    const kb = new PianoKeyboard({
      labels: 'all',
      fingerOnPress: (p) => fingerOnKeyboard(p, lhOn),
      onPress: (p) => {
        void app.audio.playPitch(p, 1.0);
        const m = fingerOnKeyboard(p, lhOn);
        const hand: Hand = m?.hand ?? 'RH';
        row.className = `finger-row hand-${hand.toLowerCase()}`;
        row.firstElementChild?.replaceWith(hands[hand].el);
        hands[hand].set(m?.finger);
        big.textContent = noteLabel(p);
        fingerText.textContent = m ? `Ngón ${m.finger}` : ' ';
        fingerName.textContent = m
          ? `${FINGER_NAMES[m.finger]} · tay ${hand === 'RH' ? 'phải' : 'trái'}`
          : 'Phím này nằm ngoài thế 5 ngón';
        small.textContent = p; // chỉ tên nốt — không hiện số Hz kỹ thuật cho bé
        onEchoKey(p);
      },
    });
    // Đổi quãng tám: bàn phím thật có 88 phím, iPad chỉ hiện 2 quãng tám một lúc
    const WINDOWS: Array<[string, string, string]> = [
      ['C2', 'C4', 'Trầm'],
      ['C3', 'C5', 'Giữa'],
      ['C4', 'C6', 'Cao'],
    ];
    let wi = 1;
    const shift = (d: number) => {
      wi = Math.max(0, Math.min(WINDOWS.length - 1, wi + d));
      kb.setRange(WINDOWS[wi][0], WINDOWS[wi][1]);
      range.textContent = `${WINDOWS[wi][2]}: ${WINDOWS[wi][0]}–${WINDOWS[wi][1]}`;
    };
    const range = h('div', { class: 'range-label' }, 'Giữa: C3–C5');
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('div', { class: 'stage scrollable' }, echoBox, big, row, small),
        h('div', { class: 'keyboard-wrap' }, kb.el),
        actionBar(
          backButton(() => app.show(homeScreen(app))),
          button({ icon: '◀', label: 'Trầm hơn', onTap: () => shift(-1) }),
          range,
          button({ icon: '▶', label: 'Cao hơn', onTap: () => shift(1) }),
        ),
      ),
    );
    return () => {
      token++;
      echo = null;
      kb.destroy();
    };
  };
}
