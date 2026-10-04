import { fingerFor } from '../../piano/fingering';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { noteLabel, pitchFreq } from '../../piano/pitchTable';
import type { App } from '../App';
import { actionBar, backButton, h } from '../components/dom';
import { FINGER_NAMES, handDiagram } from '../components/handDiagram';
import { homeScreen } from './home';

/** Đàn tự do — cũng là màn thử Bước 1A (chạm phím → tiếng + sáng phím + ngón nào). */
export function freePlayScreen(app: App) {
  return (root: HTMLElement) => {
    const big = h('div', { class: 'note-big' }, 'Chạm một phím');
    const fingerText = h('div', { class: 'finger-big' }, ' ');
    const fingerName = h('div', { class: 'finger-name' }, 'Đô Rê Mi Fa Sol: ngón 1 2 3 4 5');
    const small = h('div', { class: 'note-sub' }, ' ');
    const hand = handDiagram('RH');
    const kb = new PianoKeyboard({
      labels: 'all',
      onPress: (p) => {
        void app.audio.playPitch(p, 1.0);
        const f = fingerFor(p, 'RH');
        hand.set(f);
        big.textContent = noteLabel(p);
        fingerText.textContent = f ? `Ngón ${f}` : ' ';
        fingerName.textContent = f ? FINGER_NAMES[f] : 'Phím này nằm ngoài thế 5 ngón';
        small.textContent = `${p} · ${pitchFreq(p).toFixed(2)} Hz`;
      },
    });
    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'stage' },
          big,
          h('div', { class: 'finger-row hand-rh' }, hand.el, h('div', { class: 'finger-text' }, fingerText, fingerName)),
          small,
        ),
        h('div', { class: 'keyboard-wrap' }, kb.el),
        actionBar(backButton(() => app.show(homeScreen(app)))),
      ),
    );
    return () => kb.destroy();
  };
}
