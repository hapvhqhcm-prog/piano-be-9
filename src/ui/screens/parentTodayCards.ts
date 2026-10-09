/**
 * Màn Phụ huynh — các thẻ việc HẰNG NGÀY ở đầu màn: 🎤 Cài micro, 📝 Việc cần làm tối nay, 🟢🟡🔴 Sẵn sàng sang tuần mới?
 */
import type { AppData } from '../../progress/schema';
import { button, h } from '../components/dom';
import { readiness, tonightPlan, type TonightPractice } from './tonight';
import { diagnosticsScreen, micTestScreen, segmented, weeklyReportScreen, type ParentCtx } from './parentShared';
import { addDays, weeklyReportDue } from '../../progress/weeklyReportDue';

/**
 * "Việc cần làm tối nay" (đầu trang): 1 việc cụ thể + "▶ Làm ngay (5')" + 3 chỗ khó + tiêu chí tuần.
 * Nghỉ ≥ 5 ngày → lời "Mừng con quay lại" (ôn nhẹ), chỗ khó cũ hơn 7 ngày bị bỏ.
 */
export function tonightCard(d: Readonly<AppData>, now: Date, onPractice: (p: TonightPractice) => void): HTMLElement {
  const t = tonightPlan(d, now);
  const g = t.goal;
  // v5.1: mục tiêu chăm chỉ tính theo NGÀY (hai buổi cùng ngày = một ngày)
  const days = g.daysThisWeek;
  const pct = Math.min(100, Math.round((days / 4) * 100));
  return h(
    'section',
    { class: `card todo-card${t.welcomeBack ? ' welcome' : ''}` },
    h('h2', {}, t.welcomeBack ? `👋 Mừng bé quay lại (nghỉ ${t.daysAway} ngày)` : '📝 Việc cần làm tối nay'),
    h('p', { class: 'todo-action' }, t.action),
    t.practice
      ? h(
          'div',
          { class: 'todo-go' },
          button({ icon: '▶', label: t.welcomeBack ? "Ôn nhẹ ngay (5')" : "Làm ngay (5')", kind: 'good', onTap: () => onPractice(t.practice!) }),
          h('span', { class: 'muted' }, 'Làm trước khi bấm “Học tiếp”.'),
        )
      : null,
    t.struggles.length
      ? h(
          'div',
          {},
          h('h3', {}, t.welcomeBack ? 'Chỗ bé hay vấp (7 ngày gần đây)' : 'Chỗ bé hay vấp (2 tuần gần đây)'),
          h(
            'ol',
            { class: 'todo-list' },
            ...t.struggles.map((x, i) => h('li', {}, h('b', {}, String(i + 1)), h('span', {}, `${x.label} — vấp ${x.misses} lần`))),
          ),
        )
      : h('p', { class: 'muted' }, t.welcomeBack ? 'Sau kỳ nghỉ, app bỏ qua các chỗ khó cũ — bắt đầu lại nhẹ nhàng. 👍' : 'Chưa thấy chỗ nào bé vấp nhiều trong 2 tuần gần đây. 👍'),
    h(
      'p',
      { class: 'todo-goal' },
      g.passed ? h('span', { class: 'met' }, '✅ Đã đạt mục tiêu tuần. ') : null,
      g.lessonsLeft > 0 ? `Còn ${g.lessonsLeft} bài; ` : 'Đã học hết bài của tuần; ',
      `mục tiêu tuần ${g.week}: `,
      h('b', {}, g.text),
      ` (${g.who}).`,
    ),
    h('p', { class: 'todo-goal' }, `Tuần này đã học ${days} ngày — nên 4–5 ngày, nghỉ ngày nào cũng được.`),
    h('div', { class: 'todo-meter', 'aria-hidden': 'true' }, h('i', { style: { width: `${pct}%` } })),
  );
}

/** 🎤 Cài micro (3 bước) — thẻ nổi bật khi micro đang tắt */
export function micSetupCard(c: ParentCtx, d: Readonly<AppData>): HTMLElement | null {
  const { app } = c;
  if (d.settings.micEnabled || c.ux().micSetupHidden) return null;
  return h(
    'section',
    { class: 'card mic-setup-card' },
    h('h2', {}, '🎤 Cài micro (3 bước)'),
    h('p', { class: 'muted' }, 'Micro giúp app tự nghe đàn và chấm từng nốt — bố mẹ đỡ phải bấm. Không bắt buộc; xử lý ngay trên iPad, không gửi đi đâu.'),
    h(
      'ol',
      { class: 'mic-steps' },
      h('li', {}, h('b', {}, '1'), 'Cho phép micro'),
      h('li', {}, h('b', {}, '2'), 'Kiểm tra 5 nốt'),
      h('li', {}, h('b', {}, '3'), 'Dùng micro cho các buổi học'),
    ),
    h(
      'div',
      { class: 'row' },
      button({ icon: '🎤', label: 'Bắt đầu cài micro', kind: 'primary', onTap: () => app.show(micTestScreen(app)) }),
      button({ label: 'Để sau', onTap: () => c.set({ micSetupHidden: true }) }),
      button({ icon: '🩺', label: 'Kiểm tra iPad', onTap: () => app.show(diagnosticsScreen(app)) }),
    ),
  );
}

/** 🟢🟡🔴 Sẵn sàng sang tuần mới? + "Ở lại tuần này thêm" + cảnh báo ≥ 14 ngày ở một tuần */
export function readinessCard(c: ParentCtx, data: Readonly<AppData>, at: Date): HTMLElement {
  const week = data.progress.currentWeek;
  const r = readiness(data, at);
  return h(
    'section',
    { class: `card ready-card ${r.level}` },
    h('p', { class: 'ready-title' }, r.title),
    h('ul', {}, ...r.reasons.map((x) => h('li', {}, x))),
    r.stuck
      ? h(
          'div',
          { class: 'banner warn' },
          `⚠️ Bé đã ở tuần ${week} được ${r.daysOnWeek} ngày. Bình thường thôi nếu bé bận/ốm — nhưng nếu tuần nào cũng thấy khó, hãy tập chậm lại, ôn bài cũ và hỏi người hỗ trợ.`,
        )
      : null,
    h(
      'div',
      { class: 'hold-row' },
      h('span', {}, '⏸ Ở lại tuần này thêm:'),
      segmented(
        [
          { value: 'off', label: 'Không — tự sang tuần mới' },
          { value: 'on', label: `Có — giữ ở tuần ${week}` },
        ],
        r.held ? 'on' : 'off',
        (v) => c.set({ holdWeek: v === 'on' ? week : null }),
      ),
    ),
    r.held ? h('p', { class: 'muted' }, `App sẽ KHÔNG tự sang tuần mới khi bé đạt mục tiêu — bố mẹ chọn “Không” khi bé sẵn sàng.`) : null,
  );
}

/**
 * (+ 2026-10-09) 📊 Báo cáo tuần: tuần vừa hết có số liệu mà bố mẹ chưa xem → thẻ nổi bật "đã sẵn sàng" ở đầu màn;
 * không thì một dòng nhỏ mở lịch sử 8 tuần. `back` = vẽ lại màn Phụ huynh khi quay lại.
 */
export function weeklyReportCard(c: ParentCtx, d: Readonly<AppData>, now: Date, back: () => void): HTMLElement {
  const due = weeklyReportDue(d, now);
  const fmt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const open = () => c.app.show(weeklyReportScreen(c.app, { onBack: back, ...(due ? { monday: due } : {}) }));
  return h(
    'section',
    // Kiểu nội tuyến: report.css chỉ nạp cùng màn báo cáo (nạp muộn)
    { class: `card weekly-card${due ? ' due' : ''}`, style: due ? { background: 'var(--violet-100)', boxShadow: 'inset 0 0 0 2px var(--violet-400)' } : {} },
    h('h2', {}, due ? '📊 Báo cáo tuần đã sẵn sàng' : '📊 Báo cáo tuần'),
    h(
      'p',
      {},
      due
        ? `Tuần ${fmt(due)} – ${fmt(addDays(due, 6))}: ngày tập, bài mới thuộc, lời khen nên nói và một việc bố mẹ giúp con. Gửi ảnh cho ông bà chỉ một chạm.`
        : 'Tóm tắt từng tuần (8 tuần gần nhất) — gửi ảnh hoặc chữ cho ông bà.',
    ),
    button({ icon: '📊', label: due ? 'Xem báo cáo tuần' : 'Mở báo cáo tuần', kind: due ? 'primary' : undefined, onTap: open }),
  );
}
