import type { App, Screen } from '../App';
import { actionBar, backButton, h } from '../components/dom';
import { homeScreen } from './home';
import { lazy, lazyScreen } from '../lazy';

// Màn Phụ huynh (+ báo cáo, soạn bài, kiểm tra micro…) là chunk riêng — nạp ngầm ngay khi cổng hiện (bố mẹ còn đang nhẩm).
const parentMod = lazy(() => import('./parent'));
const parentScreen = (app: App): Screen => lazyScreen(parentMod, (m) => m.parentScreen(app));

/**
 * Câu hỏi của cổng phụ huynh (rà soát 2026-10-06: "6 + 7" bé 9 tuổi làm được → khó hơn):
 * số có hai chữ số × số có một chữ số (vd 17 × 6), đôi khi thêm một bước cộng (vd 14 × 3 + 8).
 * Bố mẹ nhẩm được trong vài giây; bé lớp 3 chưa học nhân số có hai chữ số. Không phải bảo mật.
 */
export function gateQuestion(rand: () => number = Math.random): { text: string; answer: number } {
  const pick = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  let a = pick(12, 29);
  if (a % 10 === 0) a++; // tránh 20 × b (dễ quá)
  const b = pick(3, 9);
  if (rand() < 0.35) {
    const c = pick(2, 9);
    return { text: `${a} × ${b} + ${c} = ?`, answer: a * b + c };
  }
  return { text: `${a} × ${b} = ?`, answer: a * b };
}

/** Cổng phụ huynh: một phép nhân (chống bé vào nhầm, không phải bảo mật). Nút "Phụ huynh" vẫn phải nhấn giữ 2 giây. */
export function parentGateScreen(app: App) {
  return (root: HTMLElement) => {
    parentMod.prefetch();
    let answer = 0;
    let entry = '';
    const q = h('div', { class: 'gate-q' });
    const display = h('div', { class: 'gate-display', 'aria-live': 'polite' });
    const newQuestion = () => {
      const g = gateQuestion();
      answer = g.answer;
      entry = '';
      q.textContent = g.text;
      display.textContent = ' ';
    };
    const press = (k: string) => {
      if (k === '⌫') entry = entry.slice(0, -1);
      else if (k === 'OK') {
        if (entry && Number(entry) === answer) return app.show(parentScreen(app));
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
            h('p', { class: 'lead' }, '👪 Dành cho bố mẹ — tính nhẩm rồi bấm OK'),
            q,
            display,
            h(
              'div',
              { class: 'keypad' },
              ...keys.map((k) =>
                h('button', { class: `key-btn${k === 'OK' ? ' key-ok' : ''}`, type: 'button', 'aria-label': k === '⌫' ? 'Xóa' : undefined, onClick: () => press(k) }, k),
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
