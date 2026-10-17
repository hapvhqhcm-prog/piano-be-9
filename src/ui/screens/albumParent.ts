/** (+ 2026-10-08) Thẻ "🎧 Album của con" của màn Phụ huynh (tách khỏi album.ts — màn Album nạp muộn). */
import { ALBUM_MAX_BYTES, albumEnabled, albumShowsFull, albumStore, fmtBytes, setAlbumEnabled, type AlbumStore } from '../../progress/albumStore';
import { button, confirmDialog, h, toast } from '../components/dom';
import '../../styles/album.css';

/**
 * Thẻ "🎧 Album của con" trong màn Phụ huynh: bật/tắt lưu, dung lượng, xoá Album. Album KHÔNG nằm trong bản sao lưu.
 */
/**
 * (+ 2026-10-17, rà soát kỹ sư trưởng) Ô "📀 Album đầy" cho BỐ MẸ (màn Phụ huynh — thẻ Album; màn Album): bản thu hay hơn không
 * lưu được vì quá 60 MB → nói rõ + MỘT nút "🧹 Xóa bản hay nhất cũ" (AlbumStore.freeOldBest: xóa bản hay nhất cũ nhất tới khi
 * còn ≤ 75%; KHÔNG BAO GIỜ xóa bản đầu tiên). Ẩn khi Album không đầy. `onChanged` — vẽ lại sau khi dọn.
 */
export function albumFullNote(store: AlbumStore | null, onChanged?: () => void): HTMLElement {
  const box = h('div', { class: 'album-full', hidden: true, role: 'status' });
  if (!store) return box;
  const paint = () =>
    void store.usage().then((u) => {
      if (!albumShowsFull(u.bytes)) {
        box.hidden = true;
        box.replaceChildren();
        return;
      }
      box.hidden = false;
      box.replaceChildren(
        h(
          'p',
          {},
          h('b', {}, '📀 Album đầy'),
          ` (${fmtBytes(u.bytes)} / ${fmtBytes(ALBUM_MAX_BYTES)}) — bản thu hay hơn của con đang KHÔNG được lưu. Bản đầu tiên của mỗi bài luôn được giữ.`,
        ),
        button({
          icon: '🧹',
          label: 'Xóa bản hay nhất cũ',
          onTap: () =>
            confirmDialog({
              title: 'Xóa bản hay nhất cũ?',
              text: 'App xóa các bản hay nhất CŨ NHẤT cho tới khi Album còn khoảng 3/4 chỗ. Bản đầu tiên của mỗi bài vẫn được giữ. Muốn giữ bản nào thì Gửi / Lưu vào Tệp trước nhé.',
              okIcon: '🧹',
              okLabel: 'Xóa bản cũ',
              danger: true,
              onOk: () =>
                void store.freeOldBest().then((r) => {
                  toast(
                    r.removed
                      ? `Đã xóa ${r.removed} bản cũ · trống thêm ${fmtBytes(r.freed)}`
                      : 'Không còn bản hay nhất cũ để xóa (chỉ còn bản đầu tiên) — bố mẹ Gửi / Lưu vào Tệp rồi Xóa Album nhé',
                    3500,
                  );
                  paint();
                  onChanged?.();
                }),
            }),
        }),
      );
    });
  paint();
  return box;
}

export function albumParentCard(): HTMLElement {
  const store = albumStore();
  const usage = h('p', { class: 'muted' }, store ? 'Đang đếm…' : 'iPad này chưa lưu được bản thu (trình duyệt không cho).');
  const refresh = () =>
    void store?.usage().then((u) => {
      usage.textContent = `Đang có ${u.count} bản thu · ${fmtBytes(u.bytes)} / ${fmtBytes(ALBUM_MAX_BYTES)}.`;
    });
  const full = albumFullNote(store, refresh);
  refresh();
  // Bật / Tắt (kiểu nút chọn như các cài đặt khác của màn Phụ huynh)
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Lưu bản thu vào Album' });
  const paint = () => {
    const on = albumEnabled();
    seg.replaceChildren(
      ...[true, false].map((v) => {
        const b = h('button', { class: `seg-btn${v === on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(v === on) }, v ? 'Bật' : 'Tắt');
        b.addEventListener('click', () => {
          setAlbumEnabled(v);
          paint();
          toast(v ? 'Đã bật lưu bản thu vào Album' : 'Đã tắt — app không lưu bản thu mới');
        });
        return b;
      }),
    );
  };
  paint();
  return h(
    'section',
    { class: 'card album-parent' },
    h('h2', {}, '🎧 Album của con'),
    h(
      'p',
      { class: 'muted' },
      'Khi micro bật, app giữ BẢN THU HAY NHẤT của mỗi bài (tối đa 90 giây/bản) để bé nghe lại và bố mẹ gửi ông bà (Thư viện → 🎧 Album của con → 📤 Gửi). ',
      h('b', {}, 'Chỉ nằm trên iPad này'),
      ', không gửi đi đâu. Album ',
      h('b', {}, 'KHÔNG'),
      ' nằm trong bản “Sao lưu dữ liệu” (quá nặng) — muốn giữ bản nào thì Gửi / Lưu vào Tệp.',
    ),
    usage,
    full,
    store
      ? h(
          'div',
          { class: 'row' },
          h('span', {}, 'Lưu bản thu vào Album:'),
          seg,
          button({
            icon: '🗑️',
            label: 'Xóa Album',
            kind: 'danger',
            onTap: () =>
              confirmDialog({
                title: 'Xóa Album?',
                text: 'Mọi bản thu trong Album sẽ bị xóa khỏi iPad này (tiến độ học không bị ảnh hưởng). Xóa rồi không lấy lại được.',
                okIcon: '🗑️',
                okLabel: 'Xóa Album',
                danger: true,
                onOk: () =>
                  void store.clear().then((ok) => {
                    toast(ok ? 'Đã xóa Album' : 'Chưa xóa được — thử lại nhé');
                    refresh();
                  }),
              }),
          }),
        )
      : null,
  );
}
