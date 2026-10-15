/**
 * (OWNER duyệt 2026-10-12) "📘 Từ điển nhạc nhỏ" — mở từ Thư viện: mọi khái niệm nhạc lý con ĐÃ học (theoryUnlocked:
 * thẻ ở tuần đã qua, hoặc thẻ của tuần này con đã làm), mỗi mục: hình + một dòng + 🔊 nghe thử. Khái niệm chưa học hiện
 * khóa 🔒 kèm số tuần (gập trong "Sắp mở"). Màn nạp muộn (chunk riêng cùng theory.ts).
 */
import { THEORY, theoryUnlocked, type TheoryConcept } from '../../lessons/theory';
import type { App, Screen } from '../App';
import { actionBar, backButton, button, h } from '../components/dom';
import { speakChip } from '../components/speakChip';
import { lazy, lazyScreen } from '../lazy';
import { playTheorySound, theoryPicEl, type TheoryPicView } from './theory';

/** (+ 2026-10-15) ✋ Tư thế tay — trang tranh Đúng / Chưa đúng (chunk riêng) */
const handGuideMod = lazy(() => import('./handGuide'));

export function glossaryScreen(app: App, onBack: () => void): Screen {
  return (root) => {
    const data = app.store.get();
    const open = new Set(theoryUnlocked(data).map((c) => c.id));
    const views: TheoryPicView[] = [];
    let token = 0;
    const item = (c: TheoryConcept) => {
      const pic = theoryPicEl(app, c.pic, true);
      views.push(pic);
      const listen = c.sound
        ? button({
            icon: '🔊',
            label: 'Nghe',
            onTap: () => {
              const tk = ++token;
              void playTheorySound(app, c.sound!, () => tk === token && root.isConnected, pic.flash);
            },
          })
        : null;
      return h(
        'article',
        { class: 'gl-item', 'data-theory': c.id },
        h('div', { class: 'gl-head' }, h('span', { class: 'th-emoji', 'aria-hidden': 'true' }, c.emoji), h('div', { class: 'gl-title' }, c.title), listen),
        h('div', { class: 'gl-terms' }, ...c.terms.map((t) => h('span', { class: 'gl-term' }, t))),
        pic.el,
        h('p', { class: 'gl-short' }, c.short, speakChip(app, `${c.title}. ${c.short}`)),
      );
    };
    const learned = THEORY.filter((c) => open.has(c.id));
    const locked = THEORY.filter((c) => !open.has(c.id));
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, '📘 Từ điển nhạc nhỏ')),
        h(
          'div',
          { class: 'glossary-wrap scrollable' },
          h('p', { class: 'muted lib-note' }, `Con đã biết ${learned.length} / ${THEORY.length} điều nhạc lý. Chạm 🔊 để nghe nhé!`),
          h(
            'div',
            { class: 'lib-album-row' },
            button({
              icon: '✋',
              label: 'Tư thế tay',
              kind: 'primary',
              onTap: () => app.show(lazyScreen(handGuideMod, (m) => m.handGuideScreen(app, { onBack: () => app.show(glossaryScreen(app, onBack)) }))),
            }),
          ),
          learned.length
            ? h('div', { class: 'gl-list' }, ...learned.map(item))
            : h('p', { class: 'lead' }, 'Học thẻ “📘 Biết thêm” trong bài, từ mới sẽ hiện ở đây!'),
          locked.length
            ? h(
                'details',
                { class: 'gl-soon' },
                h('summary', { class: 'lib-level' }, `🔒 Sắp mở (${locked.length})`),
                h(
                  'div',
                  { class: 'gl-list' },
                  ...locked.map((c) => h('div', { class: 'gl-item locked' }, h('div', { class: 'gl-title' }, '? ? ?'), h('div', { class: 'gl-week' }, `🔒 Tuần ${c.week}`))),
                ),
              )
            : null,
        ),
        actionBar(backButton(onBack)),
      ),
    );
    return () => {
      token++;
      views.forEach((v) => v.destroy());
    };
  };
}
