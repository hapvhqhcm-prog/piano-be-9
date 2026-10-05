import { leftHandActive } from '../../lessons/lessonEngine';
import { fingerOnKeyboard, type Hand } from '../../piano/fingering';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { noteLabel } from '../../piano/pitchTable';
import type { App } from '../App';
import { actionBar, backButton, button, h } from '../components/dom';
import { FINGER_NAMES, handDiagram, type HandDiagram } from '../components/handDiagram';
import { homeScreen } from './home';

/** Đàn tự do — chạm phím → tiếng + sáng phím + ngón nào (tay phải; tay trái từ tuần 6). */
export function freePlayScreen(app: App) {
  return (root: HTMLElement) => {
    const lhOn = leftHandActive(app.store.get());
    const big = h('div', { class: 'note-big' }, 'Chạm một phím');
    const fingerText = h('div', { class: 'finger-big' }, ' ');
    const fingerName = h('div', { class: 'finger-name' }, lhOn ? 'Tay phải: Đô→Sol ngón 1–5 · Tay trái: Đô3→Sol3' : 'Đô Rê Mi Fa Sol: ngón 1 2 3 4 5');
    const small = h('div', { class: 'note-sub' }, ' ');
    const hands: Record<Hand, HandDiagram> = { RH: handDiagram('RH'), LH: handDiagram('LH') };
    const row = h('div', { class: 'finger-row hand-rh' }, hands.RH.el, h('div', { class: 'finger-text' }, fingerText, fingerName));
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
        h('div', { class: 'stage scrollable' }, big, row, small),
        h('div', { class: 'keyboard-wrap' }, kb.el),
        actionBar(
          backButton(() => app.show(homeScreen(app))),
          button({ icon: '◀', label: 'Trầm hơn', onTap: () => shift(-1) }),
          range,
          button({ icon: '▶', label: 'Cao hơn', onTap: () => shift(1) }),
        ),
      ),
    );
    return () => kb.destroy();
  };
}
