import { isIOS, isStandalone } from '../../progress/backup';
import { h } from './dom';

/**
 * Thẻ "Thêm vào Màn hình chính" cho phụ huynh (màn Phụ huynh, màn làm quen).
 * Mở bằng tab Safari thường: dữ liệu có thể bị Safari xóa sau 7 ngày không mở, app không chạy toàn màn hình.
 * Trả về null khi app ĐÃ chạy từ Màn hình chính (không cần nhắc).
 */
export function installCard(): HTMLElement | null {
  if (isStandalone()) return null;
  const ios = isIOS();
  const steps = ios
    ? h(
        'ol',
        {},
        h('li', {}, 'Mở app này bằng ', h('b', {}, 'Safari'), '.'),
        h('li', {}, 'Chạm nút ', h('b', {}, 'Chia sẻ ⬆️'), ' (góc trên, cạnh thanh địa chỉ).'),
        h('li', {}, 'Chọn ', h('b', {}, '"Thêm vào MH chính"'), ' rồi chạm ', h('b', {}, 'Thêm'), '.'),
        h('li', {}, 'Từ nay mở app bằng biểu tượng 🎹 trên Màn hình chính.'),
      )
    : h(
        'ol',
        {},
        h('li', {}, 'Mở menu của trình duyệt (⋮ hoặc ⬆️).'),
        h('li', {}, 'Chọn ', h('b', {}, '"Cài đặt ứng dụng"'), ' hoặc ', h('b', {}, '"Thêm vào Màn hình chính"'), '.'),
      );
  return h(
    'div',
    { class: 'card install-card' },
    h('h2', {}, '📲 Thêm vào Màn hình chính'),
    h(
      'p',
      { class: 'banner' },
      'Giữ dữ liệu học của bé an toàn: khi mở bằng tab trình duyệt, iPad có thể tự xóa tiến độ nếu vài ngày không mở.',
    ),
    steps,
    h('p', { class: 'muted' }, 'Lợi ích: dữ liệu được giữ lâu dài, app mở toàn màn hình, chạy được khi không có mạng.'),
    ios
      ? h(
          'p',
          { class: 'muted' },
          '⚠️ App trên Màn hình chính có bộ nhớ RIÊNG. Nếu bé đã học ở tab Safari này: xuất sao lưu ở đây trước, ' +
            'rồi nhập lại trong app trên Màn hình chính.',
        )
      : null,
  );
}
