import { parentStats } from '../../progress/history';
import type { AppData, Settings } from '../../progress/schema';
import type { App } from '../App';
import { button, h, toast } from '../components/dom';
import { homeScreen } from './home';
import '../../styles/parentux.css';

import { prefetchLater } from '../lazy';
import { micTestMod, reportMod, reportScreen, songEditorMod, weeklyReportMod, weeklyReportScreen, type ParentCtx, type ParentUxSettings } from './parentShared';
import { detailsCard, latestSessionCards, overviewCard, skillsCard } from './parentProgressCards';
import { advancedSection } from './parentAdvanced';
import { focusGuideAnchor, guideButton, parentGuideMod, parentGuideScreen, syncWhatsNew } from './parentHelp';
import { PARENT_ANCHORS, type GuideAnchor } from './parentGuideData';
import { setupSection, weekCard } from './parentWeek';

// Giữ nguyên API cũ
export { fmtDate, parentLabel } from './parentShared';

/**
 * ⚙️ CÀI ĐẶT (trước 2026-10-25: "👪 Phụ huynh"). (2026-10-25, OWNER: "tôi hầu như không có thời gian vào app, hãy bỏ phần phụ
 * huynh ra") — app chạy hoàn toàn KHÔNG cần người lớn; màn này chỉ còn thiết lập một lần + dữ liệu, KHÔNG nhắc việc gì:
 *   đầu màn (← Về màn của bé · ⋯ Thêm: Báo cáo tuần / Báo cáo / Hướng dẫn) → 🧩 Thiết lập một lần (micro 3 bước, Màn hình
 *   chính, giờ tập, bài thêm) → Cài đặt (tên bé · độ dài buổi · giọng đọc · micro bật/tắt · tuần) → 💾 Dữ liệu (sao lưu tay,
 *   một dòng trạng thái) → 🗓️ Tuần N (tiến độ, chỉ để xem) → 🧑‍🔧 Cho người hỗ trợ (Album, nhập / đặt lại, kiểm tra iPad…).
 * Đã bỏ: "✅ Hôm nay bố mẹ cần", việc tối nay, 💡 3 điều cần nhớ, 🆕 Có gì mới, ⚠️ Cần bố mẹ xem, băng nhắc sao lưu,
 * hàng chờ bố mẹ xem, 👀 Xem tay. Bản sao IndexedDB vẫn tự động (progress/mirror.ts).
 */
export function parentScreen(app: App, opts: { focus?: GuideAnchor } = {}) {
  return (root: HTMLElement) => {
    prefetchLater([reportMod, weeklyReportMod, songEditorMod, micTestMod, parentGuideMod]);
    const store = app.store;
    // Cài mới → ghi bản hiện tại (nhật ký thay đổi chỉ hiện lặng lẽ ở "🆕 Bản mới" — không thẻ nhắc)
    syncWhatsNew(store);
    const back = () => app.show(parentScreen(app));
    const openGuide = () => app.show(parentGuideScreen(app));
    const scroller = h('div', { class: 'parent settings scrollable' });
    root.append(h('div', { class: 'screen' }, scroller));
    let message = '';

    const render = () => {
      const top = scroller.scrollTop;
      scroller.replaceChildren(...build(store.get()));
      scroller.scrollTop = top;
    };
    const say = (m: string) => {
      message = m;
      render();
    };
    const c: ParentCtx = {
      app,
      store,
      render,
      say,
      set: (patch) => {
        store.updateSettings(patch as Partial<Settings>);
        render();
      },
      ux: () => store.settings as Readonly<ParentUxSettings>,
      // resetStep: bước "Đặt lại dữ liệu"; advOpen: mục "Cho người hỗ trợ" đang mở; …
      ui: { resetStep: 0, advOpen: !!opts.focus && PARENT_ANCHORS[opts.focus], detailsOpen: false, setupOpen: false, supportOpen: false },
    };

    /** 📊 Báo cáo — cuối trang có các bảng tiến độ chi tiết. */
    const openReport = () => app.show(reportScreen(app, { onBack: back, extra: () => progressDetails(c) }));

    const build = (d: Readonly<AppData>): HTMLElement[] => {
      const now = new Date();
      // ⋯ Thêm: Báo cáo tuần · Báo cáo · Hướng dẫn (chỉ để xem khi muốn — không bao giờ nhắc)
      const menu = h(
        'details',
        { class: 'parent-menu' },
        h('summary', { 'aria-label': 'Thêm: Báo cáo tuần, Báo cáo, Hướng dẫn' }, '⋯ Thêm'),
        h(
          'div',
          { class: 'parent-menu-list' },
          button({ icon: '🗓️', label: 'Báo cáo tuần', onTap: () => app.show(weeklyReportScreen(app, { onBack: back })) }),
          button({ icon: '📊', label: 'Báo cáo', onTap: openReport }),
          guideButton(openGuide, false),
        ),
      );

      const sections: (HTMLElement | null)[] = [
        h(
          'header',
          { class: 'parent-head' },
          h('h1', {}, '⚙️ Cài đặt'),
          h('div', { class: 'parent-head-actions' }, menu, button({ icon: '←', label: 'Về màn của bé', kind: 'primary', onTap: () => app.show(homeScreen(app)) })),
        ),
        message ? h('div', { class: 'banner' }, message) : null,
        store.recoveredFromMirror
          ? h('div', { class: 'banner' }, '✅ Dữ liệu chính bị trống / hỏng — app đã tự khôi phục tiến độ của bé từ bản sao thứ hai trong máy.')
          : store.recoveredFromBackup
            ? h('div', { class: 'banner' }, '✅ App đã tự khôi phục tiến độ của bé từ bản sao lưu trong máy (do lỗi cũ khi lên tuần 9).')
            : null,
        store.lastSaveError ? h('div', { class: 'banner warn' }, `Lỗi lưu dữ liệu: ${store.lastSaveError}`) : null,
        setupSection(c, d, back),
        advancedSection(c, d),
        weekCard(c, d, now),
      ];
      return sections.filter((x): x is HTMLElement => !!x);
    };

    render();
    if (opts.focus) focusGuideAnchor(scroller, opts.focus);
  };
}

/**
 * 📋 Bảng tiến độ cho trang "📊 Báo cáo" (trước đây ở màn Phụ huynh): Tổng quan, Kỹ năng, Chi tiết (thu gọn), Phiếu quan
 * sát + Sửa kết quả buổi gần nhất. Vẽ lại tại chỗ khi bố mẹ chạm (không rời trang báo cáo).
 */
export function progressDetails(parent: ParentCtx): HTMLElement {
  const box = h('div', { class: 'progress-details' });
  const ui = { resetStep: 0, advOpen: false, detailsOpen: false, setupOpen: false, supportOpen: false };
  const c: ParentCtx = {
    ...parent,
    ui,
    render: () => draw(),
    say: (m) => toast(m),
    set: (patch) => {
      parent.store.updateSettings(patch as Partial<Settings>);
      draw();
    },
  };
  const draw = () => {
    const d = parent.store.get();
    const now = new Date();
    const latest = parent.store.latestSession();
    const stats = parentStats(d);
    box.replaceChildren(
      h('h2', { class: 'progress-details-title' }, '📋 Số liệu chi tiết (cho bố mẹ)'),
      overviewCard(d, now),
      skillsCard(d, stats.skills),
      detailsCard(c, d, stats),
      ...(latest ? latestSessionCards(c, d, latest) : []),
    );
  };
  draw();
  return box;
}
