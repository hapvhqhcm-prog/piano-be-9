/**
 * (+ 2026-10-12, OWNER duyệt "Bé tự học, bố mẹ đỡ vất") 🕑 CHỜ BỐ MẸ XEM — bố mẹ xem lại các việc bé làm lúc TỰ HỌC
 * (~2 phút/ngày): mỗi mục một dòng, ▶ nghe bản ghi, ✅ Đạt / 🔁 Chưa đạt, "✅ Đạt hết". Thẻ xem tay (Cấp 4) không chấm
 * bằng tai được → lời nhắc "Lần sau ngồi cùng xem tay nhé" (nút "Đã nhớ").
 * Logic: progress/reviewQueue.ts (✅ Đạt ghi như bố mẹ chấm vào ĐÚNG ngày bé đàn). Bản ghi: progress/reviewAudio.ts.
 * Mở từ việc "🕑 Nghe lại việc bé tự học" của thẻ "✅ Hôm nay bố mẹ cần" (parentToday.ts). (2026-10-17) Bỏ chip
 * "Mặc định mỗi ngày" trùng với màn của bé (studyModeRow ở màn chính vẫn còn).
 */
import { clipFromBlob, type TakeClip } from '../../audio/recorder';
import { gradable, reminders } from '../../progress/reviewQueue';
import { reviewAudio } from '../../progress/reviewAudio';
import type { ReviewItem } from '../../progress/schema';
import { localDateStr } from '../../progress/schema';
import type { App } from '../App';
import { actionBar, backButton, button, confirmDialog, h, toast } from '../components/dom';
import { cleanReviewAudio } from '../selfStudy';
import '../../styles/selfstudy.css';

const pad = (n: number) => String(n).padStart(2, '0');

/** "Hôm nay 17:05" / "Hôm qua 17:05" / "10/10 17:05" */
export function whenText(ts: number, now: Date = new Date()): string {
  const d = new Date(ts);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = localDateStr(d);
  if (day === localDateStr(now)) return `Hôm nay ${time}`;
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === localDateStr(y)) return `Hôm qua ${time}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

const iconOf = (r: ReviewItem): string =>
  r.visual ? '👀' : r.kind === 'song' ? '🎵' : r.kind === 'challenge' ? '🏆' : r.notes?.some((n) => n.note === 'medal') ? '🏅' : '🎹';

/** Dòng phụ: lúc nào · bao nhiêu lần · nhận xét tạm của micro · có bản ghi không */
function metaText(r: ReviewItem, now: Date): string {
  const parts = [whenText(r.ts, now)];
  if (r.kind === 'check' && !r.visual && (r.notes?.length ?? 0) > 1) parts.push(`${r.notes!.length} lần`);
  if (r.mic) parts.push(`🎤 ${r.mic}`);
  else if (r.kind === 'song') parts.push(r.audio ? '🎧 có bản ghi' : 'micro tắt — không có bản ghi');
  return parts.join(' · ');
}

/** Màn chờ bố mẹ xem. */
export function parentReviewScreen(app: App, onBack: () => void) {
  return (root: HTMLElement) => {
    const store = app.store;
    let playing: { id: string; clip: TakeClip } | null = null;
    const stopPlaying = () => {
      playing?.clip.stopPlayback();
      playing?.clip.dispose();
      playing = null;
    };
    const list = h('div', { class: 'review-body' });
    const bar = h('div', {});
    const screen = h(
      'div',
      { class: 'screen review-screen' },
      h(
        'div',
        { class: 'parent scrollable' },
        h('header', { class: 'parent-head' }, h('h1', {}, '🕑 Chờ bố mẹ xem')),
        h(
          'p',
          { class: 'muted' },
          'Bé tự học — đây là những lượt app chưa tự chấm được. ▶ Nghe lại, rồi chạm ✅ Đạt hoặc 🔁 Chưa đạt. ',
          'Lượt Đạt được tính cho tiêu chí tuần vào ĐÚNG ngày bé đàn. Mục quá 14 ngày tự bỏ.',
        ),
        list,
      ),
      bar,
    );
    root.append(screen);

    const act = (fn: () => void) => {
      stopPlaying();
      fn();
      void cleanReviewAudio(app);
      render();
    };

    const playBtn = (r: ReviewItem, row: HTMLElement) => {
      const b = button({
        icon: '▶',
        label: 'Nghe',
        kind: 'sun',
        onTap: async () => {
          if (playing?.id === r.id) {
            stopPlaying();
            row.classList.remove('playing');
            return setLook('▶', 'Nghe');
          }
          stopPlaying();
          screen.querySelectorAll('.review-row.playing').forEach((x) => x.classList.remove('playing'));
          const c = await reviewAudio()?.get(r.id);
          if (!c) {
            store.setReviewAudio(r.id, false);
            return toast('Bản ghi không còn trên iPad này');
          }
          const clip = clipFromBlob(new Blob([c.data], { type: c.mime }), c.seconds, app.audio);
          playing = { id: r.id, clip };
          row.classList.add('playing');
          setLook('⏸', 'Dừng');
          await clip.play().catch(() => undefined);
          if (playing?.clip === clip) stopPlaying();
          row.classList.remove('playing');
          setLook('▶', 'Nghe');
        },
      });
      const setLook = (icon: string, label: string) => {
        b.querySelector('.btn-icon')!.textContent = icon;
        b.querySelector('.btn-label')!.textContent = label;
      };
      return b;
    };

    const row = (r: ReviewItem, now: Date): HTMLElement => {
      const li = h('li', { class: `review-row${r.visual ? ' reminder' : ''}`, 'data-review': r.id });
      li.append(
        h('div', { class: 'review-icon', 'aria-hidden': 'true' }, iconOf(r)),
        h(
          'div',
          { class: 'review-what' },
          h('div', { class: 'review-title' }, r.label),
          h('div', { class: 'review-meta' }, r.visual ? `${whenText(r.ts, now)} · Lần sau ngồi cùng xem tay nhé 👀` : metaText(r, now)),
        ),
        h(
          'div',
          { class: 'review-actions' },
          ...(r.visual
            ? [button({ icon: '✓', label: 'Đã nhớ', onTap: () => act(() => store.dismissReview(r.id)) })]
            : [
                r.audio ? playBtn(r, li) : null,
                button({ icon: '✅', label: 'Đạt', kind: 'good', onTap: () => act(() => store.approveReview(r.id)) }),
                button({ icon: '🔁', label: 'Chưa đạt', kind: 'retry', onTap: () => act(() => store.dismissReview(r.id)) }),
              ]),
        ),
      );
      return li;
    };

    const render = () => {
      const d = store.get();
      const now = new Date();
      const items = gradable(d).sort((a, b) => a.ts - b.ts);
      const rem = reminders(d);
      list.replaceChildren(
        ...[
        items.length
          ? h('ul', { class: 'review-list', 'aria-label': 'Việc chờ bố mẹ chấm' }, ...items.map((r) => row(r, now)))
          : h('div', { class: 'review-done' }, '🎉 Xong hết rồi! Không còn lượt nào chờ bố mẹ chấm.'),
        rem.length ? h('h2', { class: 'review-sub' }, '👀 Lần sau ngồi cùng xem tay nhé') : null,
        rem.length ? h('ul', { class: 'review-list', 'aria-label': 'Lời nhắc xem tay' }, ...rem.map((r) => row(r, now))) : null,
        ].filter((x) => x !== null),
      );
      bar.replaceChildren(
        actionBar(
          backButton(() => (stopPlaying(), onBack())),
          items.length > 1
            ? button({
                icon: '✅',
                label: `Đạt hết (${items.length})`,
                kind: 'good',
                onTap: () =>
                  confirmDialog({
                    title: `✅ Đạt hết ${items.length} việc?`,
                    text: 'Mỗi lượt được tính như bố mẹ chấm “Đạt” vào đúng ngày bé đàn (tiêu chí tuần). Lời nhắc xem tay vẫn giữ.',
                    okIcon: '✅',
                    okLabel: 'Đạt hết',
                    onOk: () => act(() => toast(`✅ Đã ghi ${store.approveAllReviews()} việc`)),
                  }),
              })
            : null,
        ),
      );
    };
    void cleanReviewAudio(app).then(() => root.isConnected && render());
    render();
    return () => stopPlaying();
  };
}
