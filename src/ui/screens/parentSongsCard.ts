/**
 * Màn Phụ huynh — "📝 Bài bố mẹ thêm" (2026-10-06): thêm / sửa / xóa bài bố mẹ tự nhập — chỉ lưu trên iPad này.
 */
import { measureCount } from '../../music/tune';
import { button, confirmDialog, h } from '../components/dom';
import { PRIVACY_NOTE, parentSongToTune } from '../../practice/parentSongs';
import { playSong } from './library';
import { songEditorScreen, type ParentCtx } from './parentShared';

/** `back`: màn Phụ huynh mới (sau khi sửa bài xong) */
export function parentSongsCard(c: ParentCtx, back: () => void): HTMLElement {
  const { app, store, say } = c;
  const openEditor = (id: string | null) =>
    app.show(songEditorScreen(app, id ? store.findParentSong(id) ?? null : null, { onDone: back }));
  const list = [...store.parentSongs()].sort((a, b) => b.createdAt - a.createdAt);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, '📝 Bài bố mẹ thêm'),
    h(
      'p',
      { class: 'muted' },
      'Con thích bài nào mà app chưa có (cả bài thiếu nhi mới)? Bố mẹ gõ nốt Đô Rê Mi hoặc chạm phím — app tự ghi số ngón, bé tập như bài thường. ',
      h('b', {}, PRIVACY_NOTE),
    ),
    button({ icon: '📝', label: 'Thêm bài hát', kind: 'primary', onTap: () => openEditor(null) }),
    list.length
      ? h(
          'ul',
          { class: 'psong-list' },
          ...list.map((x) => {
            const t = parentSongToTune(x);
            return h(
              'li',
              { class: 'psong-item' },
              h('span', { class: 'psong-name' }, x.title, h('span', { class: 'psong-meta' }, `${measureCount(t)} ô nhịp · nhịp ${x.timeSignature} · tốc độ ${x.bpm}`)),
              button({ icon: '▶', label: 'Chơi thử', kind: 'mint', onTap: () => playSong(app, t) }),
              button({ icon: '✏️', label: 'Sửa', onTap: () => openEditor(x.id) }),
              button({
                icon: '🗑️',
                label: 'Xóa',
                kind: 'danger',
                onTap: () =>
                  confirmDialog({
                    title: `Xóa “${x.title}”?`,
                    text: 'Bài sẽ biến mất khỏi Thư viện (các lượt bé đã chơi vẫn giữ trong lịch sử). Sao lưu dữ liệu trước nếu muốn giữ.',
                    okLabel: 'Xóa bài',
                    okIcon: '🗑️',
                    danger: true,
                    onOk: () => {
                      store.deleteParentSong(x.id);
                      say(`Đã xóa bài “${x.title}”.`);
                    },
                  }),
              }),
            );
          }),
        )
      : null,
  );
}
