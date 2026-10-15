/**
 * (+ 2026-10-15, OWNER: "tập trung vào phần đồ họa — ngón tay đánh đàn phải đúng tư thế để đảm bảo đủ lực")
 * "✋ TƯ THẾ TAY" — trang tham khảo mọi nguyên tắc thế tay trên đàn cơ, mỗi nguyên tắc một thẻ Đúng ✓ / Chưa đúng ✗ (đọc to được).
 * Mở từ Thư viện / "📘 Từ điển nhạc nhỏ" (cho bé) và từ Hướng dẫn nhanh / màn Phụ huynh (cho bố mẹ: thêm dòng "vì sao" và
 * phiếu nhỏ "👀 Bố mẹ xem tay con" — 3 ý có hình). Phiếu này KHÔNG ghi vào tiến độ / tiêu chí: chỉ lưu lời nhắc để lần sau
 * app hiện đúng tranh (thẻ tư thế, khởi động). Màn nạp muộn (chunk riêng).
 */
import { HAND_LOOK, HAND_PRINCIPLES, handFocus, readHandLook, saveHandLook, type HandPrincipleId } from '../../lessons/handTechnique';
import type { App, Screen } from '../App';
import { actionBar, backButton, h, toast } from '../components/dom';
import { principleCard } from '../components/handCards';
import { handArtMod, principleThumb } from '../components/handArtLazy';
import { parentChecklist } from '../components/parentCheck';
import '../../styles/parentux.css';

export interface HandGuideOpts {
  onBack(): void;
  /** Mở từ phía bố mẹ: hiện phiếu "Bố mẹ xem tay con" + dòng "vì sao" */
  parent?: boolean;
  /** Cuộn tới thẻ này khi mở */
  focus?: HandPrincipleId;
}

/** Phiếu "👀 Bố mẹ xem tay con": 3 ý có hình thu nhỏ (dùng lại phiếu chấm của bố mẹ). */
export function handLookSheet(onSaved: (missing: HandPrincipleId[]) => void): HTMLElement {
  const { row, done } = parentChecklist(
    HAND_LOOK.map((it) => ({ key: it.key, icon: '✋', label: it.label, hint: it.hint, pic: () => principleThumb(it.key, 'good') })),
    (values, all) => {
      const missing = HAND_LOOK.filter((it) => !values[it.key]).map((it) => it.key as HandPrincipleId);
      saveHandLook(missing);
      toast(all ? '👏 Tay con đẹp lắm!' : '📌 Đã ghi nhớ — lần sau app sẽ nhắc bằng tranh', 2600);
      onSaved(missing);
    },
  );
  return h(
    'section',
    { class: 'hg-look', 'aria-label': 'Bố mẹ xem tay con' },
    h('h2', {}, '👀 Bố mẹ xem tay con'),
    h('p', { class: 'muted' }, 'Con đàn một câu quen. Bố mẹ nhìn tay, chạm ý con làm được. Ý chưa được → lần sau app hiện tranh nhắc.'),
    row,
    h('div', { class: 'hg-look-done' }, done),
  );
}

export function handGuideScreen(app: App, opts: HandGuideOpts): Screen {
  return (root) => {
    handArtMod.prefetch();
    let flag: HandPrincipleId | null = null;
    try {
      flag = handFocus(app.store.get(), Date.now(), readHandLook());
    } catch {
      flag = null;
    }
    const cards = HAND_PRINCIPLES.map((p) => principleCard(app, p.id, { why: !!opts.parent, flagged: p.id === flag }));
    const grid = h('div', { class: 'hg-grid' }, ...cards);
    const scrollTo = (id: HandPrincipleId) => grid.querySelector(`[data-principle="${id}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, '✋ Tư thế tay')),
        h(
          'div',
          { class: 'hg-wrap scrollable' },
          h(
            'p',
            { class: 'lead hg-intro' },
            opts.parent
              ? 'Đàn cơ cần lực từ cánh tay qua ngón cong — đúng thế tay thì tiếng to, đều mà không mỏi. Xem tranh ✓ / ✗ cùng con.'
              : 'Tay đúng thì tiếng đàn to và đẹp! Chạm 🔊 để nghe nhé.',
          ),
          opts.parent ? handLookSheet((missing) => missing[0] && scrollTo(missing[0])) : null,
          grid,
        ),
        actionBar(backButton(opts.onBack)),
      ),
    );
    if (opts.focus) window.setTimeout(() => scrollTo(opts.focus!), 60);
  };
}
