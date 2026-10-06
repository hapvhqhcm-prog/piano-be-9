import { buildReport, minutesText, skillSentence, viDate, TARGET_DAYS, type ProgressReport, type SkillKind, type WeekBar } from '../../progress/report';
import type { App } from '../App';
import { islandIcon } from '../components/art/islandArt';
import { svgRoot } from '../components/art/svgKit';
import { button, h, toast } from '../components/dom';
import { renderReportImage, reportFileName, stripState, stripWeeks } from './reportImage';
import '../../styles/report.css';

/**
 * "📊 BÁO CÁO TIẾN BỘ" (chỉ mở từ màn Phụ huynh — đã qua cổng phụ huynh): một trang đẹp để bố mẹ xem và CHIA SẺ
 * cho ông bà / thầy cô — ảnh PNG (navigator.share, không có thì tải về) hoặc In (A4 dọc, report.css @media print).
 * Số liệu: progress/report.ts (hàm thuần, có test). Ảnh PNG: reportImage.ts (vẽ canvas riêng).
 * Riêng tư: báo cáo có TÊN của bé — chỉ chia sẻ khi bố mẹ bấm, app không tự gửi đi đâu.
 */

export const PRIVACY_TEXT =
  '🔒 Báo cáo có tên của bé. App không tự gửi đi đâu — chỉ khi bố mẹ bấm “Chia sẻ” hoặc “In”, và bố mẹ chọn gửi cho ai.';

/** Biểu đồ cột: số ngày tập mỗi tuần (8 tuần), vạch mục tiêu 4 ngày. */
export function weeklyChart(weekly: readonly WeekBar[]): SVGSVGElement {
  const W = 520;
  const H = 210;
  const left = 30;
  const right = 12;
  const top = 22;
  const bottom = 36;
  const plotH = H - top - bottom;
  const max = 7;
  const step = (W - left - right) / weekly.length;
  const bw = Math.min(34, step * 0.56);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  let s = '';
  // Lưới nhạt 0 / 7
  for (const v of [0, 7]) {
    s += `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
    s += `<text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" class="rp-axis">${v}</text>`;
  }
  // Mục tiêu
  s += `<line x1="${left}" x2="${W - right}" y1="${y(TARGET_DAYS)}" y2="${y(TARGET_DAYS)}" stroke="var(--mint-600)" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  s += `<text x="${left - 8}" y="${y(TARGET_DAYS) + 4}" text-anchor="end" class="rp-axis rp-axis-goal">${TARGET_DAYS}</text>`;
  weekly.forEach((w, i) => {
    const cx = left + step * (i + 0.5);
    const last = i === weekly.length - 1;
    const hgt = (w.days / max) * plotH;
    const x = cx - bw / 2;
    const r = Math.min(4, hgt / 2);
    const fill = last ? 'var(--violet-400)' : 'var(--violet-500)';
    if (w.days > 0) {
      // Cột bo tròn 4px ở đầu, chân thẳng trên trục
      s += `<path d="M${x} ${y(0)} V${y(w.days) + r} q0 ${-r} ${r} ${-r} H${x + bw - r} q${r} 0 ${r} ${r} V${y(0)} Z" fill="${fill}"><title>Tuần từ ${w.label}: ${w.days} ngày, ${w.minutes} phút</title></path>`;
    }
    s += `<text x="${cx}" y="${y(w.days) - 6}" text-anchor="middle" class="rp-val">${w.days}</text>`;
    s += `<text x="${cx}" y="${H - bottom + 18}" text-anchor="middle" class="rp-axis">${last ? 'tuần này' : w.label}</text>`;
  });
  const svg = svgRoot(`0 0 ${W} ${H}`, 'rp-chart', s);
  svg.setAttribute('role', 'img');
  svg.removeAttribute('aria-hidden');
  svg.setAttribute('aria-label', `Số ngày tập mỗi tuần, 8 tuần gần nhất: ${weekly.map((w) => w.days).join(', ')}`);
  return svg;
}

const SKILL_ICON: Record<SkillKind, string> = { reading: '📖', ear: '👂', rhythm: '🥁' };

function skillRow(kind: SkillKind, r: ProgressReport): HTMLElement {
  const a = r.skills[kind];
  const pct = a.recent.total ? a.recent.pct : a.all.pct;
  const sentence = skillSentence(kind, a);
  const [label, rest] = [sentence.split(':')[0], sentence.slice(sentence.indexOf(':') + 1).trim()];
  return h(
    'div',
    { class: `rp-skill${pct === null ? ' empty' : ''}` },
    h('span', { class: 'rp-skill-icon', 'aria-hidden': 'true' }, SKILL_ICON[kind]),
    h('b', { class: 'rp-skill-name' }, label),
    h('span', { class: 'rp-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${pct ?? 0}%` } })),
    h('span', { class: 'rp-skill-pct' }, pct === null ? '—' : `${pct}%`),
    h('span', { class: 'rp-skill-text' }, rest),
  );
}

function fact(icon: string, label: string, value: string, sub?: string): HTMLElement {
  return h(
    'div',
    { class: 'rp-fact' },
    h('span', { class: 'rp-fact-icon', 'aria-hidden': 'true' }, icon),
    h('span', { class: 'rp-fact-body' }, h('span', { class: 'rp-fact-label' }, label), h('b', {}, value), sub ? h('small', {}, sub) : null),
  );
}

/** Trang báo cáo (cũng là bản in). */
export function reportSheet(r: ProgressReport): HTMLElement {
  const name = r.name || 'Bé';
  const hero = islandIcon(r.week, r.currentDone ? 'done' : 'current');
  hero.classList.add('rp-hero-island');
  const sk = r.skills;
  const dyn = [sk.dynamics.loudSoft ? 'To – nhỏ' : '', sk.dynamics.stacLeg ? 'Ngắt – liền' : ''].filter(Boolean);
  return h(
    'article',
    { class: 'report-sheet' },
    h(
      'header',
      { class: 'rp-head' },
      h('div', { class: 'rp-head-art' }, hero),
      h(
        'div',
        { class: 'rp-head-text' },
        h('p', { class: 'rp-kicker' }, '📊 Báo cáo tiến bộ học đàn'),
        h('h1', { class: 'rp-name' }, r.name ? `Bé ${name}` : 'Bé học đàn'),
        h('p', { class: 'rp-dates' }, `${viDate(r.from)} – ${viDate(r.to)}`),
        h(
          'div',
          { class: 'rp-chips' },
          h('span', { class: 'rp-chip' }, r.level.name),
          h('span', { class: 'rp-chip' }, `Tuần ${r.week}/${r.maxWeek}: ${r.weekTitle}`),
          h('span', { class: 'rp-chip' }, `${r.islandEmoji} ${r.island}`),
        ),
      ),
    ),

    // ---- Hành trình ----
    h(
      'section',
      { class: 'rp-sec' },
      h('h2', {}, '🗺️ Hành trình'),
      h(
        'div',
        { class: 'rp-tiles' },
        tile(`${r.weeksPassed}/${r.maxWeek}`, 'đảo đã qua'),
        tile(String(r.daysPractised), 'ngày đã tập'),
        tile(minutesText(r.totalMinutes), 'tổng thời gian'),
        tile(`${r.stickers.earned}`, `sticker (trên ${r.stickers.total})`),
      ),
      h(
        'div',
        { class: 'rp-strip' },
        ...stripWeeks(r).map((w) => {
          const st = stripState(w, r);
          return h('figure', { class: `rp-isl ${st}` }, islandIcon(w, st), h('figcaption', {}, `T${w}`));
        }),
      ),
      h(
        'div',
        { class: 'rp-two' },
        h(
          'div',
          { class: 'rp-box' },
          h('h3', {}, 'Số ngày tập mỗi tuần'),
          h('p', { class: 'rp-note' }, `8 tuần gần nhất · vạch xanh = mục tiêu ${TARGET_DAYS} ngày`),
          weeklyChart(r.weekly),
        ),
        h(
          'div',
          { class: 'rp-box' },
          h('h3', {}, `Bài đã thuộc (${r.songs.length})`),
          r.songs.length
            ? h(
                'ul',
                { class: 'rp-songs' },
                ...r.songs.map((s) =>
                  h('li', { class: s.fresh ? '' : 'faded' }, h('span', { class: 'rp-star', 'aria-hidden': 'true' }, '⭐'), s.title, s.vn ? h('span', { class: 'rp-vn', title: 'Bài Việt Nam' }, '🇻🇳') : null),
                ),
              )
            : h('p', { class: 'rp-note' }, 'Chưa có bài nào chơi trọn theo nhịp — sắp rồi!'),
          r.songs.some((s) => s.vn) ? h('p', { class: 'rp-note' }, '🇻🇳 = bài Việt Nam') : null,
        ),
      ),
    ),

    // ---- Kỹ năng ----
    h(
      'section',
      { class: 'rp-sec' },
      h('h2', {}, '🎯 Kỹ năng'),
      h('div', { class: 'rp-skills' }, skillRow('reading', r), skillRow('ear', r), skillRow('rhythm', r)),
      h(
        'div',
        { class: 'rp-facts' },
        fact('🙌', 'Hai tay cùng lúc', sk.handsTogether.songs ? `${sk.handsTogether.songs} bài` : 'chưa', sk.handsTogether.available ? `đã mở ${sk.handsTogether.available} bài hai tay` : 'bắt đầu ở Cấp 2'),
        fact('⏱️', 'Tốc độ nhanh nhất', sk.maxBpm ? `${sk.maxBpm} nhịp/phút` : 'chưa', sk.maxBpm ? 'chơi trọn bài, đạt' : undefined),
        fact('🔊', 'To – nhỏ, ngắt – liền', dyn.length ? dyn.join(' · ') : 'chưa', `${sk.dynamics.rounds} lượt đúng`),
        fact('✏️', 'Bài tự sáng tác', `${sk.compositions} bài`),
      ),
    ),

    // ---- Điểm mạnh & bước tiếp theo ----
    h(
      'section',
      { class: 'rp-sec rp-words' },
      h('h2', {}, '🌟 Điểm mạnh & bước tiếp theo'),
      h(
        'ul',
        {},
        ...r.strengths.map((t) => h('li', { class: 'good' }, h('span', { 'aria-hidden': 'true' }, '✅'), t)),
        ...r.nextSteps.map((t) => h('li', { class: 'next' }, h('span', { 'aria-hidden': 'true' }, '👉'), t)),
      ),
    ),
    h('footer', { class: 'rp-foot' }, `Lập ngày ${viDate(r.date)} · app Piano bé — số liệu ghi trên iPad của gia đình`),
  );
}

function tile(value: string, label: string): HTMLElement {
  return h('div', { class: 'rp-tile' }, h('b', {}, value), h('span', {}, label));
}

/** Tải tệp về máy (khi không chia sẻ được). */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function reportScreen(app: App, opts: { onBack: () => void }) {
  return (root: HTMLElement) => {
    const now = new Date();
    const report = buildReport(app.store.get(), now);
    const fileName = reportFileName(report);
    // Vẽ sẵn ảnh ngay khi mở màn: iOS chỉ cho navigator.share NGAY trong lần chạm (chờ vẽ lâu → mất quyền)
    let blob: Blob | null = null;
    const ready = renderReportImage(report)
      .then((c) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png')))
      .then((b) => (blob = b))
      .catch((e) => {
        console.warn('report image', e);
        return null;
      });

    const share = async () => {
      const b = blob ?? (await ready);
      if (!b) return toast('Chưa tạo được ảnh — thử lại nhé.');
      const file = new File([b], fileName, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'Báo cáo tiến bộ học đàn' });
        } catch (e) {
          if ((e as Error).name === 'NotAllowedError') toast('Ảnh đã sẵn sàng — chạm “Chia sẻ” lần nữa nhé.', 2600);
          // AbortError = bố mẹ đóng bảng chia sẻ → không làm gì
        }
        return;
      }
      download(b, fileName);
      toast('📥 Đã lưu ảnh báo cáo');
    };

    document.documentElement.classList.add('report-print');
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
            button({ icon: '🖨️', label: 'In', onTap: () => window.print() }),
            button({ icon: '📤', label: 'Chia sẻ', kind: 'primary', onTap: () => void share() }),
          ),
          h('p', { class: 'report-privacy' }, PRIVACY_TEXT),
          reportSheet(report),
        ),
      ),
    );
    return () => document.documentElement.classList.remove('report-print');
  };
}
