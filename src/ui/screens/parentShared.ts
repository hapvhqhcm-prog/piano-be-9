/**
 * Màn Phụ huynh — phần dùng chung của các thẻ (parent*.ts): kiểu cài đặt thêm, trạng thái màn (ParentCtx),
 * định dạng ngày / nhãn, bảng & nút chọn, các màn con nạp muộn.
 */
import { findLesson, type PostureSettings } from '../../lessons/lessonEngine';
import { findTune } from '../../music/exercises';
import * as progressStoreModule from '../../progress/ProgressStore';
import type { AppData, Settings } from '../../progress/schema';
import type { App, Screen } from '../App';
import { h } from '../components/dom';
import { noteLabelForParent, type HoldSettings } from './tonight';
import { customTuneTitle } from '../../practice/parentSongs';
import { lazy, lazyScreen } from '../lazy';

// Màn con ít dùng của Phụ huynh → chunk riêng (nạp ngầm khi màn Phụ huynh đã vẽ xong).
export const micTestMod = lazy(() => import('./micTest'));
export const songEditorMod = lazy(() => import('./songEditor'));
export const reportMod = lazy(() => import('./report'));
const diagnosticsMod = lazy(() => import('./diagnostics'));
type SongEditorArgs = Parameters<typeof import('./songEditor').songEditorScreen>;
type ReportOpts = Parameters<typeof import('./report').reportScreen>[1];
export const micTestScreen = (app: App): Screen => lazyScreen(micTestMod, (m) => m.micTestScreen(app));
export const songEditorScreen = (app: App, existing: SongEditorArgs[1], hooks: SongEditorArgs[2]): Screen =>
  lazyScreen(songEditorMod, (m) => m.songEditorScreen(app, existing, hooks));
export const reportScreen = (app: App, opts: ReportOpts): Screen => lazyScreen(reportMod, (m) => m.reportScreen(app, opts));
/** 🩺 Kiểm tra iPad (âm thanh, giọng đọc, micro, lưu trữ…) → gửi kết quả cho người hỗ trợ */
export const diagnosticsScreen = (app: App): Screen => lazyScreen(diagnosticsMod, (m) => m.diagnosticsScreen(app));

/** Settings thêm (cộng dồn, không cần migration) của màn Phụ huynh. */
export type ParentUxSettings = Settings &
  HoldSettings &
  PostureSettings & {
    /** Bố mẹ bấm "Để sau" ở thẻ Cài micro → không hiện thẻ đầu trang nữa (vẫn cài được ở Nâng cao) */
    micSetupHidden?: boolean;
    /** Lần cuối hỏi "Sao lưu luôn?" sau khi xem Báo cáo (ms) — hỏi tối đa mỗi tuần một lần */
    backupAskedAt?: number;
  };
export const DAY_MS = 86_400_000;

/** Trạng thái của MỘT lần mở màn Phụ huynh (parent.ts dựng) — các thẻ đọc / ghi qua đây. */
export interface ParentCtx {
  readonly app: App;
  readonly store: App['store'];
  /** Vẽ lại cả màn (giữ vị trí cuộn) */
  render(): void;
  /** Hiện một dòng thông báo đầu màn rồi vẽ lại */
  say(m: string): void;
  /** Đổi cài đặt rồi vẽ lại */
  set(patch: Partial<ParentUxSettings>): void;
  ux(): Readonly<ParentUxSettings>;
  /** Giữ qua các lần vẽ lại: bước "Đặt lại dữ liệu", mục "Nâng cao" / "Chi tiết" đang mở */
  readonly ui: { resetStep: number; advOpen: boolean; detailsOpen: boolean };
}

/** "2026-10-06" → "06/10" (bố mẹ đọc ngày kiểu Việt Nam). */
export function fmtDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? `${m[3]}/${m[2]}` : key;
}
export function fmtMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const EAR_WORD: Record<string, string> = {
  up: 'Đi lên',
  down: 'Đi xuống',
  same: 'Giữ nguyên',
  step: 'Liền bậc',
  skip: 'Nhảy bậc',
  major: 'Trưởng (vui)',
  minor: 'Thứ (buồn)',
};
/** Mã nốt / việc → lời thường cho bảng của bố mẹ ("F4" → "Fa (F4)", "twins-4" → "Sinh đôi"). */
export function parentLabel(id: string): string {
  if (EAR_WORD[id]) return EAR_WORD[id];
  return noteLabelForParent(id).label.replace(/^Nốt /, '');
}

/** Dung lượng lưu trữ — dùng storageStatus() của ProgressStore nếu có (DATA agent), không có thì bỏ qua. */
export function storageText(store: unknown): Promise<string | null> {
  const mod = progressStoreModule as unknown as Record<string, unknown>;
  const s = store as Record<string, unknown>;
  const fn = (typeof s.storageStatus === 'function' ? (s.storageStatus as () => unknown).bind(store) : null) ??
    (typeof mod.storageStatus === 'function' ? () => (mod.storageStatus as (x: unknown) => unknown)(store) : null);
  if (!fn) return Promise.resolve(null);
  const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return Promise.resolve()
    .then(fn)
    .then((r) => {
      if (r == null) return null;
      if (typeof r === 'string') return r;
      const o = r as Record<string, unknown>;
      if (typeof o.text === 'string') return o.text;
      if (typeof o.message === 'string') return o.message;
      const num = (...ks: string[]) => ks.map((k) => o[k]).find((v): v is number => typeof v === 'number');
      const used = num('usedBytes', 'bytes', 'used', 'usage', 'size');
      const quota = num('quotaBytes', 'quota', 'limit', 'max');
      if (used === undefined) return null;
      const pct = num('percent', 'pct') ?? (quota ? Math.round((used / quota) * 100) : undefined);
      return `Bộ nhớ dữ liệu: ${kb(used)}${quota ? ` / ${kb(quota)}` : ''}${pct !== undefined ? ` (${pct}%)` : ''}`;
    })
    .catch(() => null);
}

export const RATING_LABEL = { all: '😄 Dễ — đàn được', some: '🙂 Vừa — còn vấp chút', hard: '😅 Khó — cần tập thêm' } as const;

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Thứ 2 = 0
  x.setDate(x.getDate() - dow);
  return x;
}

export function lessonName(id: string, d?: Readonly<AppData>): string {
  const l = findLesson(id);
  if (l) return `${l.emoji} ${l.title}`;
  const m = /^w\d+-song-(.+)$/.exec(id);
  if (m) return `🎵 ${findTune(m[1])?.titleVi ?? (d && customTuneTitle(m[1], d)) ?? m[1]} (tự chọn)`;
  if (/^w\d+-daily$/.test(id)) return '🔁 Luyện tập mỗi ngày';
  return id;
}

export const MODE_LABEL = { wait: 'Từng nốt', tempo: 'Theo nhịp' } as const;
export const HINT_LABEL = { full: 'phím sáng', names: 'tên nốt', staff: 'chỉ khuông' } as const;

export function table(head: string[], rows: (string | number)[][]): HTMLElement {
  if (rows.length === 0) return h('p', { class: 'muted' }, 'Chưa có dữ liệu');
  // Bảng rộng: bọc trong khung cuộn ngang (.scrollable chỉ cho cuộn dọc)
  return h(
    'div',
    { class: 'tbl-wrap' },
    h(
      'table',
      { class: 'tbl' },
      h('thead', {}, h('tr', {}, ...head.map((c) => h('th', {}, c)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, String(c)))))),
    ),
  );
}

export function segmented<T extends string | number>(
  options: Array<{ value: T; label: string }>,
  current: T,
  onPick: (v: T) => void,
  disabled = false,
): HTMLElement {
  return h(
    'div',
    { class: 'seg' },
    ...options.map((o) => {
      const b = h('button', { class: `seg-btn${o.value === current ? ' on' : ''}`, type: 'button' }, o.label);
      b.disabled = disabled;
      b.addEventListener('click', () => onPick(o.value));
      return b;
    }),
  );
}
