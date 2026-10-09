/**
 * ⏰ "Đặt giờ tập" (màn Phụ huynh): chọn thứ + giờ → tạo tệp lịch .ics lặp hằng tuần (lessons/reminder.ts) rồi đưa cho
 * Lịch của iPad qua bảng Chia sẻ (navigator.share với tệp) hoặc tải xuống (<a download>). Lựa chọn được nhớ
 * (settings.reminder) để lần sau mở lại đúng giờ cũ.
 */
import { DEFAULT_REMINDER, WEEKDAY_LABELS, buildReminderIcs, normDays, parseTime, reminderSummary } from '../../lessons/reminder';
import type { App } from '../App';
import { button, h, toast } from './dom';
import '../../styles/longterm.css';

const FILE_NAME = 'gio-tap-dan-piano-be.ics';

function readStored(app: App): { days: number[]; time: string } {
  const r = (app.store.get().settings as { reminder?: { days?: unknown; time?: unknown } }).reminder;
  const days = Array.isArray(r?.days) ? normDays(r.days) : [];
  const time = typeof r?.time === 'string' && parseTime(r.time) ? r.time : DEFAULT_REMINDER.time;
  return { days: days.length ? days : [...DEFAULT_REMINDER.days], time };
}

/** Đưa tệp .ics cho iPad: bảng Chia sẻ (có tệp) nếu được, không thì tải xuống / mở. */
async function deliver(ics: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    const file = new File([blob], FILE_NAME, { type: 'text/calendar' });
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: 'Giờ tập đàn' });
      return 'shared';
    }
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    /* chia sẻ hỏng → tải xuống */
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: FILE_NAME, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
  return 'downloaded';
}

export function reminderCard(app: App): HTMLElement {
  const st = readStored(app);
  const chosen = new Set(st.days);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dayBtns = order.map((d) => {
    const b = h(
      'button',
      {
        class: `rem-day${chosen.has(d) ? ' on' : ''}`,
        type: 'button',
        'aria-label': d === 0 ? 'Chủ nhật' : `Thứ ${d + 1}`,
        'aria-pressed': String(chosen.has(d)),
        onClick: () => {
          if (chosen.has(d)) chosen.delete(d);
          else chosen.add(d);
          b.classList.toggle('on', chosen.has(d));
          b.setAttribute('aria-pressed', String(chosen.has(d)));
          sum.textContent = chosen.size ? `Nhắc: ${reminderSummary([...chosen], time.value || st.time)}` : 'Chọn ít nhất một ngày';
        },
      },
      WEEKDAY_LABELS[d],
    );
    return b;
  });
  const time = h('input', { class: 'rem-time', type: 'time', value: st.time, step: '300', 'aria-label': 'Giờ tập' });
  const sum = h('p', { class: 'rem-sum' }, `Nhắc: ${reminderSummary(st.days, st.time)}`);
  time.addEventListener('change', () => {
    if (chosen.size) sum.textContent = `Nhắc: ${reminderSummary([...chosen], time.value || st.time)}`;
  });
  const make = async () => {
    const days = normDays([...chosen]);
    const t = time.value && parseTime(time.value) ? time.value : null;
    if (!days.length) return toast('Chọn ít nhất một ngày nhé');
    if (!t) return toast('Chọn giờ tập nhé');
    const data = app.store.get();
    let ics: string;
    try {
      ics = buildReminderIcs({ days, time: t, now: new Date(), minutes: data.settings.sessionMinutes, name: data.learner.name });
    } catch (e) {
      return toast(String((e as Error).message || e));
    }
    app.store.updateSettings({ reminder: { days, time: t } });
    const r = await deliver(ics);
    if (r === 'shared') toast('✅ Đã mở bảng Chia sẻ — chọn "Lịch" hoặc "Lưu vào Tệp"', 3500);
    else if (r === 'downloaded') toast('✅ Đã tạo tệp lịch — chạm "Thêm vào Lịch" / "Thêm tất cả"', 3500);
  };
  return h(
    'section',
    { class: 'card reminder-card' },
    h('h2', {}, '⏰ Đặt giờ tập'),
    h('p', { class: 'muted' }, 'Chọn các ngày và giờ bé tập đàn — app tạo một lời nhắc lặp lại hằng tuần trong Lịch của iPad (báo đúng giờ).'),
    h('div', { class: 'rem-days', role: 'group', 'aria-label': 'Các ngày tập' }, ...dayBtns),
    h('label', { class: 'rem-time-row' }, h('span', {}, '🕖 Giờ:'), time),
    sum,
    h('div', { class: 'rem-actions' }, button({ icon: '📅', label: 'Tạo lời nhắc trong Lịch', kind: 'primary', onTap: () => void make() })),
    h(
      'p',
      { class: 'rem-hint muted' },
      'Trên iPad: chạm “Thêm vào Lịch” → “Thêm tất cả”. Nếu hiện bảng Chia sẻ: chọn “Lịch” (hoặc “Lưu vào Tệp” rồi mở tệp trong ứng dụng Tệp). Muốn đổi giờ: xóa sự kiện cũ trong Lịch rồi tạo lại.',
    ),
  );
}
