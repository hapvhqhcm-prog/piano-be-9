/**
 * (2026-10-15, OWNER duyệt — rà soát của thầy giáo nhiều kinh nghiệm) "ĐỌC NHỊP TO TRƯỚC KHI ĐÀN" — bước đứng TRƯỚC màn bài hát:
 * lần đầu bé mở THEO NHỊP một bài có cờ `chant` (lessons/readingAids.ts chantDue), app hiện màn Nhịp (rhythm.ts) với mẫu rút từ
 * câu 1 của chính bài (music/chant.ts) — MỘT lượt: nghe mẫu, rồi bé vỗ tay + đọc vần / đếm số theo tiếng tích; xong (hoặc
 * "⏭ Bỏ qua") thì vào màn bài hát như thường. Nằm TRONG màn bài hát (không phải hoạt động mới) → tiến độ "<bài>#<i>" đã lưu
 * của tuần 1–5 không đổi. Không ghi điểm (bố mẹ chấm cho vui; bé tự học → vào hàng "Chờ bố mẹ xem" như màn Nhịp).
 */
import { chantFor } from '../../music/chant';
import type { Tune } from '../../music/tune';
import { chantDue } from '../../lessons/readingAids';
import type { App, Screen } from '../App';
import { rhythmScreen } from './rhythm';
import type { SongOptions } from './songShared';

/** Nhãn nhỏ trên tiêu đề màn "Đọc nhịp trước" (scripts/e2e.mjs nhận ra màn này qua nhãn) */
export const CHANT_TAG = 'Đọc nhịp trước';

/** Bài đã đọc nhịp trong lần mở app này (bé bỏ dở Câu 1 rồi mở Câu 2 → không hỏi lại) */
const chanted = new Set<string>();

/**
 * Bọc màn bài hát `main` bằng bước "Đọc nhịp trước" nếu tới hạn; không → trả lại chính `main`.
 * `onBack`: bé bấm ← ở bước đọc nhịp = rời bước bài hát (như ← của màn bài hát).
 */
export function withChant(app: App, full: Tune, opts: SongOptions, onBack: () => void, main: Screen): Screen {
  if (chanted.has(full.id) || !chantDue(app.store.get(), full.id, opts)) return main;
  const chant = chantFor(full);
  if (!chant) return main;
  return (root) => {
    let cleanup: (() => void) | void = undefined;
    let left = false;
    const go = () => {
      if (left) return;
      left = true;
      chanted.add(full.id);
      try {
        cleanup?.();
      } finally {
        app.audio.stopAll();
        root.replaceChildren();
        cleanup = main(root);
      }
    };
    cleanup = rhythmScreen(app, {
      title: `🗣️ Đọc nhịp "${full.titleVi || full.title}"`,
      intro: 'Trước khi đàn theo nhịp: vỗ tay và đọc to nhịp của bài một lượt nhé!',
      tag: CHANT_TAG,
      patterns: [chant.pattern],
      once: true,
      meter: chant.meter,
      record: () => undefined,
      onDone: go,
      onBack,
      skip: go,
    })(root);
    // Đánh dấu màn (scripts/e2e.mjs) — rhythmScreen giữ nguyên phần tử .screen qua các bước của nó
    if (!left) root.lastElementChild?.classList.add('chant-pre');
    return () => cleanup?.();
  };
}
