/**
 * (+ 2026-10-17, OWNER duyệt) "✅ HÔM NAY BỐ MẸ CẦN" — thẻ ĐẦU màn Phụ huynh: ≤ 3 việc có thứ tự, mỗi việc một ô tích.
 * Ưu tiên: 🕑 nghe lại việc bé tự học (nếu có) → 📝 việc tối nay (+ ▶ Làm ngay + 30 giây để ý) → MỘT việc lúc cần:
 * 📊 xem báo cáo tuần & sao lưu (mỗi tuần một lần) / 🎤 cài micro (chưa từng cài) / 🩺 kiểm tra sức khỏe app (đầu tháng…).
 * Xong hết → "✅ Hôm nay xong — chỉ cần bấm Học tiếp".
 *
 * Trạng thái trong ngày (việc đã hiện + đã tích tay) ở localStorage riêng của iPad (không phải tiến độ học, không vào sao
 * lưu): việc đã hiện hôm nay vẫn ở lại (tích ✓) khi xong, danh sách không "nhảy" giữa các lần mở.
 * Logic thuần: todayPlan() (tests/parentToday.test.ts).
 */
import type { AppData } from '../../progress/schema';
import { localDateStr } from '../../progress/schema';
import { button, h } from '../components/dom';
import { tonightPlan, type TonightPractice } from './tonight';
import { todayFocus } from './parentTodayCards';
import { addDays } from '../../progress/weeklyReportDue';
import { HEALTH_REASON_TEXT, type HealthReason } from '../../pwa/healthCheck';

export type TodayId = 'review' | 'tonight' | 'weekly' | 'mic' | 'health';
export const TODAY_ORDER: readonly TodayId[] = ['review', 'tonight', 'weekly', 'mic', 'health'];
export const TODAY_MAX = 3;

export interface TodayInput {
  /** Số việc chờ bố mẹ chấm + lời nhắc xem tay */
  pending: number;
  /** Thứ 2 của báo cáo tuần chưa xem (null = đã xem / không có) */
  weeklyDue: string | null;
  /** Cần sao lưu tuần này (chưa sao lưu trong 7 ngày và đã tập ≥ 7 ngày) */
  backupNeeded: boolean;
  /** Chưa từng cài micro (và bố mẹ chưa bấm "Để sau") */
  micNever: boolean;
  /** Đến lúc 🩺 kiểm tra sức khỏe app */
  healthDue: boolean;
}

export interface TodayState {
  date: string;
  shown: TodayId[];
  ticked: TodayId[];
}

export interface TodayItemState {
  id: TodayId;
  done: boolean;
}

/** Việc nào hiện hôm nay + đã xong chưa (thuần). `st` = trạng thái đã lưu (khác ngày → bỏ). */
export function todayPlan(input: TodayInput, st: TodayState | null, date: string): { items: TodayItemState[]; state: TodayState } {
  const prev: TodayState = st && st.date === date ? st : { date, shown: [], ticked: [] };
  const ticked = new Set(prev.ticked);
  const need: Record<TodayId, boolean> = {
    review: input.pending > 0,
    tonight: true,
    weekly: !!input.weeklyDue || input.backupNeeded,
    mic: input.micNever,
    health: input.healthDue,
  };
  const done = (id: TodayId) => ticked.has(id) || (id !== 'tonight' && !need[id]);
  const shown = new Set(prev.shown);
  const ids = TODAY_ORDER.filter((id) => shown.has(id) || (need[id] && !ticked.has(id)));
  // Ưu tiên việc CHƯA xong khi phải cắt bớt (việc đã xong vẫn hiện nếu còn chỗ)
  const keep = [...ids.filter((id) => !done(id)), ...ids.filter((id) => done(id))].slice(0, TODAY_MAX);
  const items = TODAY_ORDER.filter((id) => keep.includes(id)).map((id) => ({ id, done: done(id) }));
  return { items, state: { date, shown: items.map((x) => x.id), ticked: [...ticked].filter((x) => TODAY_ORDER.includes(x)) } };
}

/* ---------------- Trạng thái trong ngày (localStorage) ---------------- */

export const TODAY_KEY = 'piano-be-9:parent-today';
type KV = Pick<Storage, 'getItem' | 'setItem'>;
const kv = (): KV | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function loadToday(store: KV | null = kv()): TodayState | null {
  try {
    const v = JSON.parse(store?.getItem(TODAY_KEY) ?? 'null') as TodayState | null;
    return v && typeof v.date === 'string' && Array.isArray(v.shown) && Array.isArray(v.ticked) ? v : null;
  } catch {
    return null;
  }
}
export function saveToday(st: TodayState, store: KV | null = kv()): void {
  try {
    store?.setItem(TODAY_KEY, JSON.stringify(st));
  } catch {
    /* bỏ qua */
  }
}
/** Tích / bỏ tích một việc (hôm nay). */
export function tickToday(id: TodayId, on = true, now: Date = new Date()): void {
  const date = localDateStr(now);
  const cur = loadToday();
  const st: TodayState = cur && cur.date === date ? cur : { date, shown: [], ticked: [] };
  const set = new Set(st.ticked);
  if (on) set.add(id);
  else set.delete(id);
  if (!st.shown.includes(id)) st.shown.push(id);
  saveToday({ ...st, ticked: [...set] });
}

/* ---------------- Thẻ ---------------- */

export interface TodayHandlers {
  /** Nghe lại việc bé tự học */
  review(): void;
  /** ▶ Làm ngay (5') */
  practice(p: TonightPractice): void;
  /** 📊 báo cáo tuần (có bước sao lưu) */
  weekly(): void;
  /** 💾 sao lưu thẳng (tuần không có báo cáo mới) */
  backup(): void;
  mic(): void;
  micLater(): void;
  health(): void;
  /** Vẽ lại màn */
  render(): void;
}

export interface TodayCtx extends TodayInput {
  reminders: number;
  lastBackupAt: number;
  healthReasons: HealthReason[];
}

const fmt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const fmtMs = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function todayCard(d: Readonly<AppData>, now: Date, x: TodayCtx, on: TodayHandlers): HTMLElement {
  const date = localDateStr(now);
  const plan = todayPlan(x, loadToday(), date);
  saveToday(plan.state);
  const t = tonightPlan(d, now);
  const allDone = plan.items.every((i) => i.done);

  const row = (id: TodayId, done: boolean, title: string, ...body: (HTMLElement | string | null)[]) => {
    const tick = h(
      'button',
      {
        type: 'button',
        class: `today-tick${done ? ' on' : ''}`,
        'aria-pressed': String(done),
        'aria-label': done ? `Bỏ đánh dấu xong: ${title}` : `Đánh dấu xong: ${title}`,
        onClick: () => {
          tickToday(id, !done, now);
          on.render();
        },
      },
      done ? '✓' : '',
    );
    return h(
      'li',
      { class: `today-item${done ? ' done' : ''}`, dataset: { today: id } },
      tick,
      h('div', { class: 'today-main' }, h('p', { class: 'today-title' }, title), ...(done ? [] : body)),
    );
  };

  const items = plan.items.map(({ id, done }, i) => {
    const n = `${i + 1}. `;
    switch (id) {
      case 'review': {
        const mins = Math.max(1, Math.round(x.pending / 3));
        return row(
          id,
          done,
          `${n}🕑 Nghe lại việc bé tự học${x.pending ? ` (${x.pending})` : ''}`,
          h('p', { class: 'muted' }, `Khoảng ${mins} phút: ▶ nghe, chạm ✅ Đạt / 🔁 Chưa đạt. Chỉ việc bố mẹ chấm Đạt mới tính cho mục tiêu tuần.`),
          button({ icon: '▶', label: 'Xem ngay', kind: 'primary', onTap: on.review }),
        );
      }
      case 'tonight': {
        const f = todayFocus(d, now);
        return row(
          id,
          done,
          `${n}${t.welcomeBack ? `👋 Mừng bé quay lại (nghỉ ${t.daysAway} ngày)` : '📝 Tối nay'}`,
          h('p', { class: 'todo-action' }, t.action),
          f ? h('p', { class: 'todo-focus' }, h('b', {}, `👪 30 giây — để ý: ${f.icon} `), f.detail) : null,
          t.practice
            ? h(
                'div',
                { class: 'todo-go' },
                button({ icon: '▶', label: t.welcomeBack ? "Ôn nhẹ ngay (5')" : "Làm ngay (5')", kind: 'good', onTap: () => on.practice(t.practice!) }),
                h('span', { class: 'muted' }, 'Làm trước khi bấm nút ▶ to.'),
              )
            : null,
          t.struggles.length
            ? h('p', { class: 'muted today-struggles' }, `Chỗ hay vấp: ${t.struggles.map((s) => `${s.label} (${s.misses})`).join(' · ')}`)
            : null,
        );
      }
      case 'weekly':
        return x.weeklyDue
          ? row(
              id,
              done,
              `${n}📊 Xem báo cáo tuần & sao lưu`,
              h('p', { class: 'muted' }, `Tuần ${fmt(x.weeklyDue)} – ${fmt(addDays(x.weeklyDue, 6))}, khoảng 2 phút. Xem xong: một chạm “💾 Sao lưu” ở cuối báo cáo.`),
              button({ icon: '📊', label: 'Xem báo cáo tuần', kind: 'primary', onTap: on.weekly }),
            )
          : row(
              id,
              done,
              `${n}💾 Sao lưu tuần này`,
              h(
                'p',
                { class: 'muted' },
                x.lastBackupAt ? `Lần gần nhất: ${fmtMs(x.lastBackupAt)}. ` : 'Chưa sao lưu lần nào. ',
                'Bảng Chia sẻ mở ra → “Lưu vào Tệp”.',
              ),
              button({ icon: '💾', label: 'Sao lưu ngay', kind: 'primary', onTap: on.backup }),
            );
      case 'mic':
        return row(
          id,
          done,
          `${n}🎤 Cài micro một lần (~3 phút)`,
          h('p', { class: 'muted' }, 'Micro nghe đàn thật và tự chấm — bố mẹ đỡ phải bấm. Không bắt buộc; xử lý ngay trên iPad.'),
          h(
            'div',
            { class: 'row' },
            button({ icon: '🎤', label: 'Bắt đầu cài micro', kind: 'primary', onTap: on.mic }),
            button({ label: 'Để sau', onTap: on.micLater }),
          ),
        );
      case 'health':
        return row(
          id,
          done,
          `${n}🩺 Kiểm tra sức khỏe app (~3 phút)`,
          h('p', { class: 'muted' }, `Vì ${x.healthReasons.map((r) => HEALTH_REASON_TEXT[r]).join(', ') || 'đến hạn'}: sao lưu, thử tiếng, đo micro, đo độ trễ, gửi kết quả.`),
          button({ icon: '🩺', label: 'Bắt đầu kiểm tra', kind: 'primary', onTap: on.health }),
        );
    }
  });

  return h(
    'section',
    { class: `card today-card${allDone ? ' all-done' : ''}`, 'aria-label': 'Hôm nay bố mẹ cần' },
    h('h2', {}, allDone ? '✅ Hôm nay xong — chỉ cần bấm nút ▶ to' : '✅ Hôm nay bố mẹ cần'),
    h('ol', { class: 'today-list' }, ...items),
  );
}
