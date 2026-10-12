/**
 * (+ 2026-10-12, OWNER duyệt "Bé tự học, bố mẹ đỡ vất") 👦 CON TỰ HỌC — phần giao diện dùng chung:
 * - `selfStudy(app)`: hôm nay bé tự học? (store.studyMode — chọn ở màn chính, nhớ tới hết ngày; mặc định "Có bố mẹ").
 * - `deferCheck` / `deferSong`: việc cần bố mẹ → hàng chờ "🕑 Chờ bố mẹ xem" (progress/reviewQueue.ts) thay vì bắt bé chờ;
 *   bài hát kèm bản ghi âm của lượt đó (progress/reviewAudio.ts) khi micro bật.
 * - `studyModeRow`: hai nút "👪 Có bố mẹ ngồi cùng" / "👦 Con tự học" ở màn chính (một chạm).
 * - `reviewPill`: viên nhỏ "🕑 Chờ bố mẹ xem (N)" cạnh nút Phụ huynh (cho bố mẹ, không phải màn phủ của bé).
 * Lời cho bé luôn tích cực: "Bố mẹ sẽ nghe lại bài con đàn nhé!".
 */
import { isVisualNote, pendingCount, type ReviewInput } from '../progress/reviewQueue';
import { reviewAudio } from '../progress/reviewAudio';
import type { ReviewRun } from '../progress/schema';
import type { App } from './App';
import { h } from './components/dom';
import '../styles/selfstudy.css';

export const SELF_PRAISE = 'Bố mẹ sẽ nghe lại bài con đàn nhé!';
/** Nút của BÉ thay cho nút "👪 Bố mẹ…" khi tự học */
export const SELF_DONE = { icon: '✋', label: 'Con đàn xong' } as const;

/** Hôm nay bé tự học? */
export function selfStudy(app: App): boolean {
  try {
    return app.store.studyMode() === 'self';
  } catch {
    return false;
  }
}

/**
 * Hoãn một thẻ / nốt bố mẹ cần xác nhận (PARENT_ASSESSMENT 'correct' khi bố mẹ duyệt). Thẻ xem tay (`relax:*`) thành
 * lời nhắc "Lần sau ngồi cùng xem tay nhé". Các lần cùng `group` trong một buổi gộp vào MỘT mục.
 */
export function deferCheck(app: App, o: { group: string; label: string; note: string; mic?: string }): string | null {
  try {
    const visual = isVisualNote(o.note);
    return app.store.deferReview({
      kind: 'check',
      group: visual ? `look:${o.note}` : o.group,
      label: o.label,
      notes: [{ note: o.note, ts: Date.now() }],
      ...(visual ? { visual: true } : {}),
      ...(o.mic ? { mic: o.mic } : {}),
    });
  } catch {
    return null;
  }
}

/** Hoãn một việc bất kỳ (huy chương, thử thách…). */
export function deferOther(app: App, input: ReviewInput): string | null {
  try {
    return app.store.deferReview(input);
  } catch {
    return null;
  }
}

/** Bản ghi của lượt vừa chơi (TakeReplay.clipNow) — null = không có (micro tắt). */
export type ClipSource = Promise<{ blob: Blob; seconds: number } | null> | null;

/** Hoãn một lượt cả bài (phiếu 3 ý) + giữ bản ghi âm của lượt (nếu có) để bố mẹ ▶ nghe lại. */
export function deferSong(app: App, run: ReviewRun, label: string, mic: string | undefined, clip: ClipSource): string | null {
  let id: string | null = null;
  try {
    id = app.store.deferReview({ kind: 'song', group: `song:${run.songId}:${Date.now().toString(36)}`, label, run, ...(mic ? { mic } : {}) });
  } catch {
    return null;
  }
  const rid = id;
  const store = reviewAudio();
  if (clip && store) {
    void clip
      .then(async (c) => {
        if (!c) return;
        const r = await store.save(rid, c.blob, c.seconds);
        if (!r.saved) return;
        app.store.setReviewAudio(rid, true);
        for (const ev of r.evicted) app.store.setReviewAudio(ev, false);
      })
      .catch(() => undefined);
  }
  return rid;
}

/** Xoá bản ghi âm của mục đã chấm / hết hạn / không còn trong hàng chờ (gọi khi mở màn chờ / màn Phụ huynh). */
export function cleanReviewAudio(app: App): Promise<void> {
  const store = reviewAudio();
  const dropped = app.store.takeDroppedReviews();
  if (!store) return Promise.resolve();
  const keep = new Set(app.store.reviews().map((r) => r.id));
  return store
    .remove(dropped)
    .then(() => store.prune(keep))
    .then(() => store.has())
    .then((have) => {
      // Mục ghi "có bản ghi" mà bản ghi không còn (bị bỏ vì đầy, iPad xoá dữ liệu) → bỏ dấu
      for (const r of app.store.reviews()) if (r.audio && !have.has(r.id)) app.store.setReviewAudio(r.id, false);
    })
    .catch(() => undefined);
}

/** Hai nút chọn cách học hôm nay (màn chính, trên nút "Học tiếp"). */
export function studyModeRow(app: App, onChange: () => void): HTMLElement {
  const mode = app.store.studyMode();
  const micOff = !app.store.settings.micEnabled;
  const chip = (m: 'parent' | 'self', icon: string, label: string) =>
    h(
      'button',
      {
        type: 'button',
        class: `study-chip${mode === m ? ' on' : ''}`,
        'data-mode': m,
        'aria-pressed': String(mode === m),
        onClick: () => {
          if (app.store.studyMode() === m) return;
          app.store.setStudyMode(m);
          onChange();
        },
      },
      h('span', { 'aria-hidden': 'true' }, icon),
      ` ${label}`,
    );
  return h(
    'div',
    { class: 'study-mode', role: 'group', 'aria-label': 'Hôm nay con học thế nào?' },
    chip('parent', '👪', 'Có bố mẹ ngồi cùng'),
    chip('self', '👦', 'Con tự học'),
    mode === 'self'
      ? h('span', { class: 'study-note' }, micOff ? 'Bố mẹ sẽ xem lại sau nhé!' : '🎤 App nghe con đàn · bố mẹ xem lại sau')
      : null,
  );
}

/** Viên "🕑 Chờ bố mẹ xem (N)" cho bố mẹ ở thanh trên cùng màn chính. null = không có mục chờ. */
export function reviewPill(app: App, openParent: () => void): HTMLElement | null {
  let n = 0;
  try {
    n = pendingCount(app.store.get());
  } catch {
    n = 0;
  }
  if (!n) return null;
  return h(
    'button',
    { type: 'button', class: 'review-pill', 'aria-label': `${n} việc chờ bố mẹ xem — mở màn Phụ huynh`, onClick: openParent },
    h('span', { 'aria-hidden': 'true' }, '🕑'),
    h('span', { class: 'review-pill-text' }, `Chờ bố mẹ xem (${n})`),
  );
}
