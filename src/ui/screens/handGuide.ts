/**
 * (+ 2026-10-15, OWNER: "tập trung vào phần đồ họa — ngón tay đánh đàn phải đúng tư thế để đảm bảo đủ lực")
 * "✋ TƯ THẾ TAY" — trang tham khảo mọi nguyên tắc thế tay trên đàn cơ, mỗi nguyên tắc một thẻ Đúng ✓ / Chưa đúng ✗ (đọc to được).
 * Mở từ Thư viện / "📘 Từ điển nhạc nhỏ" (cho bé) và từ ⚙️ Cài đặt / Hướng dẫn (`parent`: thêm dòng "vì sao").
 * (2026-10-25, OWNER "bỏ phần phụ huynh") phiếu "🪞 Con tự xem tay mình" (3 ý có hình — trước là "Bố mẹ xem tay con"), cho
 * bé ở mọi lối vào. Phiếu KHÔNG ghi vào tiến độ / tiêu chí: chỉ lưu lời nhắc để lần sau app hiện đúng tranh (thẻ tư thế,
 * khởi động). Màn nạp muộn (chunk riêng).
 */
import { HAND_LOOK, HAND_PRINCIPLES, handFocus, readHandLook, saveHandLook, type HandPrincipleId } from '../../lessons/handTechnique';
import type { App, Screen } from '../App';
import { actionBar, backButton, button, h, toast } from '../components/dom';
import { principleCard } from '../components/handCards';
import { handArtMod, principleThumb } from '../components/handArtLazy';
import '../../styles/parentux.css';

export interface HandGuideOpts {
  onBack(): void;
  /** Mở từ ⚙️ Cài đặt / Hướng dẫn: thêm dòng "vì sao" dưới mỗi thẻ */
  parent?: boolean;
  /** Cuộn tới thẻ này khi mở */
  focus?: HandPrincipleId;
}

/**
 * Phiếu "🪞 Con tự xem tay mình": 3 ý có hình thu nhỏ — bé đàn một câu quen, nhìn tay mình rồi chạm ý làm được; "Xong" →
 * ý chưa được thành lời nhắc bằng tranh lần sau (saveHandLook). Không ghi tiến độ.
 */
export function handLookSheet(onSaved: (missing: HandPrincipleId[]) => void): HTMLElement {
  const on = new Set<string>();
  const row = h('div', { class: 'pcheck', role: 'group', 'aria-label': 'Con tự xem tay mình' });
  for (const it of HAND_LOOK) {
    const box = h('span', { class: 'pcheck-box', 'aria-hidden': 'true' }, '');
    const b = h(
      'button',
      { class: 'pcheck-item has-hint', type: 'button', 'aria-pressed': 'false' },
      box,
      h('span', { class: 'pcheck-icon', 'aria-hidden': 'true' }, principleThumb(it.key, 'good')),
      h('span', { class: 'pcheck-text' }, h('span', { class: 'pcheck-label' }, it.label), h('span', { class: 'pcheck-hint' }, it.hint)),
    );
    b.addEventListener('click', () => {
      const v = !on.has(it.key);
      if (v) on.add(it.key);
      else on.delete(it.key);
      b.classList.toggle('on', v);
      b.setAttribute('aria-pressed', String(v));
      box.textContent = v ? '✔' : '';
    });
    row.append(b);
  }
  const done = button({
    icon: '✓',
    label: 'Xong',
    kind: 'primary',
    onTap: () => {
      const missing = HAND_LOOK.filter((it) => !on.has(it.key)).map((it) => it.key as HandPrincipleId);
      saveHandLook(missing);
      toast(missing.length ? '📌 Lần sau app nhắc con bằng tranh nhé' : '👏 Tay con đẹp lắm!', 2600);
      onSaved(missing);
    },
  });
  return h(
    'section',
    { class: 'hg-look', 'aria-label': 'Con tự xem tay mình' },
    h('h2', {}, '🪞 Con tự xem tay mình'),
    h('p', { class: 'muted' }, 'Con đàn một câu quen, nhìn tay mình rồi chạm ý con làm được nhé.'),
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
              ? 'Đàn cơ cần lực từ cánh tay qua ngón cong — đúng thế tay thì tiếng to, đều mà không mỏi.'
              : 'Tay đúng thì tiếng đàn to và đẹp! Chạm 🔊 để nghe nhé.',
          ),
          handLookSheet((missing) => missing[0] && scrollTo(missing[0])),
          grid,
        ),
        actionBar(backButton(opts.onBack)),
      ),
    );
    if (opts.focus) window.setTimeout(() => scrollTo(opts.focus!), 60);
  };
}
