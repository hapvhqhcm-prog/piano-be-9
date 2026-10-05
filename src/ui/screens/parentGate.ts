import type { App } from '../App';
import { actionBar, backButton, h } from '../components/dom';
import { homeScreen } from './home';
import { parentScreen } from './parent';

/** Cổng phụ huynh: phép cộng đơn giản (chống bé vào nhầm, không phải bảo mật). */
export function parentGateScreen(app: App) {
  return (root: HTMLElement) => {
    let a = 0;
    let b = 0;
    let entry = '';
    const q = h('div', { class: 'gate-q' });
    const display = h('div', { class: 'gate-display' });
    const newQuestion = () => {
      a = 6 + Math.floor(Math.random() * 4);
      b = 3 + Math.floor(Math.random() * 7);
      entry = '';
      q.textContent = `${a} + ${b} = ?`;
      display.textContent = ' ';
    };
    const press = (k: string) => {
      if (k === '⌫') entry = entry.slice(0, -1);
      else if (k === 'OK') {
        if (Number(entry) === a + b) return app.show(parentScreen(app));
        display.classList.add('shake');
        window.setTimeout(() => display.classList.remove('shake'), 400);
        return newQuestion();
      } else if (entry.length < 3) entry += k;
      display.textContent = entry || ' ';
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'stage gate' },
          h(
            'div',
            { class: 'gate-card' },
            h('p', { class: 'lead' }, '👪 Dành cho bố mẹ'),
            q,
            display,
            h(
              'div',
              { class: 'keypad' },
              ...keys.map((k) =>
                h('button', { class: `key-btn${k === 'OK' ? ' key-ok' : ''}`, type: 'button', onClick: () => press(k) }, k),
              ),
            ),
          ),
        ),
        actionBar(backButton(() => app.show(homeScreen(app)))),
      ),
    );
    newQuestion();
  };
}
