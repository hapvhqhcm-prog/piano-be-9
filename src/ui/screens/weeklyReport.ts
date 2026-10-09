import { buildWeeklySummary, historyMondays, minutesShort, shortDate, weekRange, weeklyText, type WeeklySummary } from '../../progress/weeklyReport';
import { lastCompletedMonday, type WeeklyReportSettings } from '../../progress/weeklyReportDue';
import type { Settings } from '../../progress/schema';
import type { App } from '../App';
import { islandIcon } from '../components/art/islandArt';
import { button, h, toast } from '../components/dom';
import { highlightLines, renderWeeklyImage, weeklyFileName } from './weeklyReportImage';
import '../../styles/report.css';

/**
 * (+ 2026-10-09, OWNER duyệt) "📊 BÁO CÁO TUẦN" — chỉ mở từ màn Phụ huynh (đã qua cổng phụ huynh), nạp muộn.
 * 8 tuần đã hết gần nhất + tuần đang diễn ra; mỗi tuần: ngày tập T2→CN, phút, buổi, sao, đảo / tiêu chí tuần, bài mới thuộc,
 * bài chơi trọn, biểu diễn, thử thách, tiến bộ, "nên khen" + "bố mẹ giúp" (progress/weeklyReport.ts — hàm thuần, có test).
 * Chia sẻ: ảnh PNG (navigator.share; không được thì tải về) + bản chữ (sao chép). App không tự gửi đi đâu.
 * Mở màn này = bố mẹ đã xem báo cáo của tuần vừa hết (settings.weeklyReportSeen) → viên "đã sẵn sàng" ẩn đi.
 */

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Tải tệp về máy (khi không chia sẻ được). */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Sao chép chữ: Clipboard API, không có thì ô chữ ẩn + execCommand. */
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
    const ta = h('textarea', { class: 'wr-copy-area', readonly: true }) as HTMLTextAreaElement;
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

function tile(value: string, label: string): HTMLElement {
  return h('div', { class: 'rp-tile' }, h('b', {}, value), h('span', {}, label));
}

/** Trang báo cáo một tuần. */
export function weeklySheet(s: WeeklySummary): HTMLElement {
  const hero = s.course ? islandIcon(s.course.week, s.course.passedNow ? 'done' : 'current') : null;
  hero?.classList.add('rp-hero-island');
  const lines = highlightLines(s);
  return h(
    'article',
    { class: 'report-sheet wr-sheet' },
    h(
      'header',
      { class: 'rp-head' },
      h('div', { class: 'rp-head-art' }, hero),
      h(
        'div',
        { class: 'rp-head-text' },
        h('p', { class: 'rp-kicker' }, s.inProgress ? '📊 Báo cáo tuần (đang diễn ra)' : '📊 Báo cáo tuần học đàn'),
        h('h1', { class: 'rp-name' }, s.name ? `Bé ${s.name}` : 'Bé học đàn'),
        h('p', { class: 'rp-dates' }, `Tuần ${weekRange(s)}`),
        s.course
          ? h('div', { class: 'rp-chips' }, h('span', { class: 'rp-chip' }, `${s.course.islandEmoji} Tuần ${s.course.week}: ${s.course.title}`))
          : null,
      ),
    ),
    h(
      'section',
      { class: 'rp-sec' },
      h('div', { class: 'rp-tiles' }, tile(`${s.days}/7`, 'ngày tập'), tile(minutesShort(s.minutes), 'thời gian'), tile(s.sessions === null ? '—' : String(s.sessions), 'buổi học'), tile(`⭐ ${s.stars}`, 'sao')),
      h(
        'div',
        { class: 'wr-dots', role: 'img', 'aria-label': `Ngày tập: ${DOW.filter((_, i) => s.dayDots[i]).join(', ') || 'chưa có'}` },
        ...s.dayDots.map((on, i) => h('span', { class: `wr-dot${on ? ' on' : ''}` }, h('i', { 'aria-hidden': 'true' }, on ? '⭐' : ''), h('small', {}, DOW[i]))),
      ),
    ),
    h(
      'section',
      { class: 'rp-sec' },
      h('h2', {}, '🌟 Tuần này con đã…'),
      lines.length
        ? h('ul', { class: 'wr-list' }, ...lines.map((l) => h('li', {}, l)))
        : h('p', { class: 'rp-note' }, s.days ? 'Con đã ngồi vào đàn — tuần sau mình cùng thêm một bài mới nhé.' : 'Tuần này chưa có buổi tập nào.'),
    ),
    h(
      'section',
      { class: 'rp-sec rp-words' },
      h('h2', {}, '👏 Nên khen & 🤝 bố mẹ giúp'),
      h(
        'ul',
        {},
        ...s.praise.map((t) => h('li', { class: 'good' }, h('span', { 'aria-hidden': 'true' }, '👏'), t)),
        h('li', { class: 'next' }, h('span', { 'aria-hidden': 'true' }, '🤝'), s.help),
      ),
    ),
    s.mic ? h('p', { class: 'wr-mic' }, `🎙️ ${s.mic.text}`) : null,
    s.detail !== 'full'
      ? h('p', { class: 'wr-mic' }, '🗂️ Tuần cũ: app đã gộp bớt chi tiết (số buổi, bài chơi trọn, tiến bộ) để tiết kiệm bộ nhớ — còn lại ngày tập, phút, sao, bài thuộc, biểu diễn, thử thách.')
      : null,
    h('footer', { class: 'rp-foot' }, 'Báo cáo tuần · app Piano bé — số liệu ghi trên iPad của gia đình'),
  );
}

export function weeklyReportScreen(app: App, opts: { onBack: () => void; monday?: string }) {
  return (root: HTMLElement) => {
    const now = new Date();
    const store = app.store;
    const mondays = historyMondays(store.get(), now);
    const last = lastCompletedMonday(now);
    // Bố mẹ đã mở báo cáo tuần → viên "đã sẵn sàng" của tuần vừa hết ẩn đi
    const seen = (store.settings as Readonly<WeeklyReportSettings>).weeklyReportSeen;
    if (!seen || seen < last) store.updateSettings({ weeklyReportSeen: last } as Partial<Settings>);

    let selected = opts.monday && mondays.includes(opts.monday) ? opts.monday : mondays.includes(last) ? last : (mondays[0] ?? last);
    const cache = new Map<string, WeeklySummary>();
    const summaryOf = (m: string) => {
      let s = cache.get(m);
      if (!s) cache.set(m, (s = buildWeeklySummary(store.get(), m, now)));
      return s;
    };

    // Vẽ sẵn ảnh khi chọn tuần: iOS chỉ cho navigator.share NGAY trong lần chạm (chờ vẽ lâu → mất quyền)
    const blobs = new Map<string, Promise<Blob | null>>();
    const blobReady = new Map<string, Blob | null>();
    const prepare = (m: string) => {
      if (blobs.has(m)) return blobs.get(m)!;
      const p = renderWeeklyImage(summaryOf(m))
        .then((c) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png')))
        .then((b) => (blobReady.set(m, b), b))
        .catch((e) => {
          console.warn('weekly image', e);
          blobs.delete(m);
          return null;
        });
      blobs.set(m, p);
      return p;
    };

    const share = async () => {
      const m = selected;
      const s = summaryOf(m);
      const b = blobReady.get(m) ?? (await prepare(m));
      if (!b) return toast('Chưa tạo được ảnh — thử lại nhé.');
      const file = new File([b], weeklyFileName(s), { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'Báo cáo tuần học đàn' });
        } catch (e) {
          if ((e as Error).name === 'NotAllowedError') toast('Ảnh đã sẵn sàng — chạm “Gửi ảnh” lần nữa nhé.', 2600);
        }
        return;
      }
      download(b, weeklyFileName(s));
      toast('📥 Đã lưu ảnh báo cáo tuần');
    };
    const copy = async () => {
      const ok = await copyText(weeklyText(summaryOf(selected)));
      toast(ok ? '📋 Đã sao chép — dán vào Zalo / tin nhắn nhé' : 'Chưa sao chép được — thử lại nhé.', 2600);
    };

    const body = h('div', { class: 'wr-body' });
    const tabs = h('div', { class: 'wr-tabs', role: 'tablist', 'aria-label': 'Chọn tuần' });
    const renderTabs = () =>
      tabs.replaceChildren(
        ...mondays.map((m) => {
          const s = summaryOf(m);
          const b = h(
            'button',
            { type: 'button', class: `wr-tab${m === selected ? ' on' : ''}`, role: 'tab', 'aria-selected': m === selected ? 'true' : 'false' },
            h('b', {}, s.inProgress ? 'Tuần này' : shortDate(m)),
            h('small', {}, `${s.days} ngày`),
          );
          b.addEventListener('click', () => {
            selected = m;
            show();
          });
          return b;
        }),
      );
    const show = () => {
      renderTabs();
      body.replaceChildren(weeklySheet(summaryOf(selected)));
      void prepare(selected);
    };

    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'report-wrap scrollable' },
          h(
            'div',
            { class: 'report-bar' },
            button({ icon: '←', label: 'Quay lại', onTap: opts.onBack }),
            h('span', { class: 'report-bar-gap' }),
            button({ icon: '📋', label: 'Sao chép chữ', onTap: () => void copy() }),
            button({ icon: '📤', label: 'Gửi ảnh', kind: 'primary', onTap: () => void share() }),
          ),
          h('p', { class: 'report-privacy' }, '🔒 Báo cáo có tên của bé (nếu đã đặt). App không tự gửi đi đâu — chỉ khi bố mẹ bấm “Gửi ảnh” / “Sao chép chữ”.'),
          tabs,
          body,
        ),
      ),
    );
    show();
  };
}
