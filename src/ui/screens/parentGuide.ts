/**
 * (+ 2026-10-10) "📖 HƯỚNG DẪN NHANH CHO BỐ MẸ" — màn riêng của bố mẹ (nạp muộn, mở từ màn Phụ huynh).
 * Mỗi mục (parentGuideData.ts): ≤ 4 dòng + "Mở ngay" tới đúng chỗ. Cuối màn: bản tóm tắt một trang (sao chép / chia sẻ /
 * in) và nút xem lại 4 thẻ hướng dẫn lần đầu (onboarding.ts).
 */
import type { App } from '../App';
import { button, h, toast } from '../components/dom';
import { lazy, lazyScreen } from '../lazy';
import { LATEST_VERSION } from '../../pwa/changelog';
import { homeScreen } from './home';
import { onboardingScreen } from './onboarding';
import { parentScreen } from './parent';
import { micTestScreen, weeklyReportScreen } from './parentShared';
import { GUIDE_SECTIONS, guideSummaryText, isParentAnchor, type GuideScreen, type GuideTarget } from './parentGuideData';
import '../../styles/parentux.css';
import '../../styles/parenthelp.css';

const albumMod = lazy(() => import('./album'));

/** Sao chép chữ: Clipboard API, không có thì ô chữ ẩn + execCommand (iPadOS cũ). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* thử cách cũ */
  }
  try {
    const ta = h('textarea', { class: 'guide-copy-area', readonly: true }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function parentGuideScreen(app: App) {
  return (root: HTMLElement) => {
    const back = () => app.show(parentGuideScreen(app));
    const screens: Record<GuideScreen, () => void> = {
      home: () => app.show(homeScreen(app)),
      micSetup: () => app.show(micTestScreen(app)),
      weeklyReport: () => app.show(weeklyReportScreen(app, { onBack: back })),
      album: () => app.show(lazyScreen(albumMod, (m) => m.albumScreen(app, back))),
    };
    const go = (t: GuideTarget) => (isParentAnchor(t) ? app.show(parentScreen(app, { focus: t })) : screens[t]());

    const summary = guideSummaryText(GUIDE_SECTIONS, LATEST_VERSION);
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    const copy = async () => {
      const ok = await copyText(summary);
      toast(ok ? '📋 Đã sao chép — dán vào Ghi chú / Zalo nhé' : 'Chưa sao chép được — chạm vào ô chữ, chọn hết rồi Sao chép.', 2800);
    };
    const share = async () => {
      try {
        await nav.share?.({ title: 'Piano bé — Hướng dẫn nhanh cho bố mẹ', text: summary });
      } catch {
        /* bố mẹ hủy bảng Chia sẻ */
      }
    };

    const sections = GUIDE_SECTIONS.map((s) =>
      h(
        'section',
        { class: 'card guide-sec', id: `guide-${s.id}` },
        h('h2', {}, h('span', { class: 'guide-icon', 'aria-hidden': 'true' }, s.icon), s.title),
        h('ul', {}, ...s.lines.map((l) => h('li', {}, l))),
        h(
          'div',
          { class: 'row guide-go' },
          (() => {
            const b = button({ icon: '➜', label: 'Mở ngay', kind: 'primary', onTap: () => go(s.open.go) });
            b.setAttribute('aria-label', `Mở ngay: ${s.open.label}`);
            return b;
          })(),
          s.more ? button({ label: s.more.label, onTap: () => go(s.more!.go) }) : null,
        ),
      ),
    );

    const sheet = h('pre', { class: 'guide-sheet', tabindex: '0' }, summary);
    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'parent guide scrollable' },
          h(
            'header',
            { class: 'parent-head' },
            h('h1', {}, '📖 Hướng dẫn nhanh'),
            h(
              'div',
              { class: 'parent-head-actions' },
              button({ icon: '←', label: 'Về màn Phụ huynh', kind: 'primary', onTap: () => app.show(parentScreen(app)) }),
            ),
          ),
          h('p', { class: 'guide-intro' }, 'Mỗi mục là một việc bố mẹ hay cần. Bấm “Mở ngay” để tới đúng chỗ trong app.'),
          h('div', { class: 'guide-grid' }, ...sections),
          h(
            'section',
            { class: 'card guide-summary' },
            h('h2', {}, '🖨️ Bản tóm tắt một trang'),
            h('p', { class: 'muted' }, 'Gửi cho người cùng trông bé học đàn, hoặc in ra dán cạnh đàn.'),
            h(
              'div',
              { class: 'row guide-go' },
              button({ icon: '📋', label: 'Sao chép', kind: 'good', onTap: () => void copy() }),
              typeof nav.share === 'function' ? button({ icon: '📤', label: 'Chia sẻ', onTap: () => void share() }) : null,
              button({ icon: '🖨️', label: 'In', onTap: () => window.print() }),
            ),
            sheet,
          ),
          h(
            'section',
            { class: 'card guide-more' },
            h('h2', {}, '🎞️ Hướng dẫn lần đầu'),
            h('p', { class: 'muted' }, '4 thẻ có hình: chỗ ngồi, cách chấm “Đúng rồi”, micro, màn Phụ huynh.'),
            button({ icon: '▶', label: 'Xem lại 4 thẻ', onTap: () => app.show(onboardingScreen(app, { onDone: back })) }),
          ),
        ),
      ),
    );
    // In: chỉ in bản tóm tắt (parenthelp.css @media print)
    document.documentElement.classList.add('guide-print');
    return () => document.documentElement.classList.remove('guide-print');
  };
}
