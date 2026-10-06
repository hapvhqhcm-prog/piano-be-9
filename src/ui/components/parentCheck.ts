import { button, h } from './dom';
import '../../styles/parentux.css';

export interface CheckItem<K extends string> {
  key: K;
  icon: string;
  label: string;
  /** Một dòng hướng dẫn chấm bằng lời thường cho bố mẹ không biết nhạc (rà soát 2026-10-06) */
  hint?: string;
}

/**
 * v5 — PHIẾU CHẤM CỦA BỐ MẸ (khi không dùng micro, OWNER duyệt 2026-10-05): thay một nút "Rồi!" bằng vài ý
 * chạm để bật/tắt (✔ Đúng nốt · ✔ Đều nhịp · ✔ Đúng ngón & dáng tay). Lượt chỉ "đạt" khi TẤT CẢ đều được tích.
 * Trả về hàng thẻ (đặt trong màn) + nút "Xong" (đặt ở thanh nút).
 */
export function parentChecklist<K extends string>(
  items: ReadonlyArray<CheckItem<K>>,
  onDone: (values: Record<K, boolean>, all: boolean) => void,
): { row: HTMLElement; done: HTMLButtonElement } {
  const values = Object.fromEntries(items.map((i) => [i.key, false])) as Record<K, boolean>;
  const row = h('div', { class: 'pcheck', role: 'group', 'aria-label': 'Bố mẹ chấm' });
  for (const it of items) {
    const b = h(
      'button',
      { class: `pcheck-item${it.hint ? ' has-hint' : ''}`, type: 'button', 'aria-pressed': 'false' },
      h('span', { class: 'pcheck-box', 'aria-hidden': 'true' }, ''),
      h('span', { class: 'pcheck-icon', 'aria-hidden': 'true' }, it.icon),
      it.hint
        ? h('span', { class: 'pcheck-text' }, h('span', { class: 'pcheck-label' }, it.label), h('span', { class: 'pcheck-hint' }, it.hint))
        : h('span', { class: 'pcheck-label' }, it.label),
    );
    b.addEventListener('click', () => {
      values[it.key] = !values[it.key];
      b.classList.toggle('on', values[it.key]);
      b.setAttribute('aria-pressed', String(values[it.key]));
      (b.firstChild as HTMLElement).textContent = values[it.key] ? '✔' : '';
      refresh();
    });
    row.append(b);
  }
  const done = button({
    icon: '✓',
    label: 'Xong',
    kind: 'primary',
    onTap: () => onDone({ ...values }, items.every((i) => values[i.key])),
  });
  const refresh = () => {
    const all = items.every((i) => values[i.key]);
    done.classList.toggle('btn-good', all);
    done.classList.toggle('btn-primary', !all);
  };
  return { row, done };
}

/** Ba ý chấm của bài hát (SongRun.checklist). */
export const SONG_CHECKS: ReadonlyArray<CheckItem<'notes' | 'beat' | 'fingers'>> = [
  { key: 'notes', icon: '🎵', label: 'Đúng nốt', hint: 'Bé bấm đúng phím đang sáng' },
  { key: 'beat', icon: '🥁', label: 'Đều nhịp', hint: 'Không dừng chờ quá 1 tiếng tích' },
  { key: 'fingers', icon: '🖐️', label: 'Đúng ngón & dáng tay', hint: 'Đúng số ngón trên màn, ngón cong' },
];

/**
 * v5.1 — Chế độ "Từng nốt" (chờ): app CHỜ bé nên không có nhịp để chấm → chỉ 2 ý (Đúng nốt · Đúng ngón & dáng tay).
 * SongRun.checklist vẫn giữ đủ {notes, beat, fingers}: song.ts ghi `beat: true` (không áp dụng = không trừ).
 */
export const SONG_CHECKS_WAIT: ReadonlyArray<CheckItem<'notes' | 'fingers'>> = SONG_CHECKS.filter(
  (c): c is CheckItem<'notes' | 'fingers'> => c.key !== 'beat',
);

/** Hai ý chấm của trò vỗ nhịp (không có ngón tay). */
export const RHYTHM_CHECKS: ReadonlyArray<CheckItem<'notes' | 'beat'>> = [
  { key: 'notes', icon: '👏', label: 'Đúng tiếng vỗ', hint: 'Vỗ đủ tiếng, dài–ngắn giống mẫu' },
  { key: 'beat', icon: '🥁', label: 'Đều nhịp', hint: 'Không dừng chờ quá 1 tiếng tích' },
];
