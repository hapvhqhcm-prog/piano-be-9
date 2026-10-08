/** (+ 2026-10-08) Thẻ "🎧 Album của con" của màn Phụ huynh (tách khỏi album.ts — màn Album nạp muộn). */
import { ALBUM_MAX_BYTES, albumEnabled, albumStore, fmtBytes, setAlbumEnabled } from '../../progress/albumStore';
import { button, confirmDialog, h, toast } from '../components/dom';
import '../../styles/album.css';

/**
 * Thẻ "🎧 Album của con" trong màn Phụ huynh: bật/tắt lưu, dung lượng, xoá Album. Album KHÔNG nằm trong bản sao lưu.
 */
export function albumParentCard(): HTMLElement {
  const store = albumStore();
  const usage = h('p', { class: 'muted' }, store ? 'Đang đếm…' : 'iPad này chưa lưu được bản thu (trình duyệt không cho).');
  const refresh = () =>
    void store?.usage().then((u) => {
      usage.textContent = `Đang có ${u.count} bản thu · ${fmtBytes(u.bytes)} / ${fmtBytes(ALBUM_MAX_BYTES)}.`;
    });
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
    store
      ? h(
          'div',
          { class: 'row' },
          h('span', {}, 'Lưu bản thu vào Album:'),
          seg,
          button({
            icon: '🗑️',
            label: 'Xoá Album',
            kind: 'danger',
            onTap: () =>
              confirmDialog({
                title: 'Xoá Album?',
                text: 'Mọi bản thu trong Album sẽ bị xoá khỏi iPad này (tiến độ học không bị ảnh hưởng). Xoá rồi không lấy lại được.',
                okIcon: '🗑️',
                okLabel: 'Xoá Album',
                danger: true,
                onOk: () =>
                  void store.clear().then((ok) => {
                    toast(ok ? 'Đã xoá Album' : 'Chưa xoá được — thử lại nhé');
                    refresh();
                  }),
              }),
          }),
        )
      : null,
  );
}
