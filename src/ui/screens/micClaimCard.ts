/**
 * (+ 2026-11-09) ⚙️ Cài đặt — thẻ "🙉 Bé báo app nghe sai": chỉ hiện khi có ít nhất một lần báo. Gửi MỘT tệp JSON (các
 * đoạn tiếng 4 giây dạng WAV base64 + bối cảnh) qua bảng Chia sẻ của iPad (Zalo / AirDrop / thư) cho người sửa app.
 * Tệp chỉ có tiếng micro quanh lúc bé đàn — bố mẹ tự quyết gửi hay không; xóa được.
 */
import { clearClaims, listClaims, type MicClaimRecord } from '../../progress/micClaimStore';
import { APP_VERSION } from '../../pwa/updater';
import { button, confirmDialog, h, toast } from '../components/dom';
import { shareFile } from '../components/shareFile';

function b64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function claimsFile(list: readonly MicClaimRecord[], now = new Date()): File {
  const body = JSON.stringify({
    kind: 'piano-be-9-mic-claims',
    v: APP_VERSION,
    exportedAt: now.toISOString(),
    claims: list.map((c) => ({ id: c.id, at: new Date(c.at).toISOString(), where: c.where, songId: c.songId, info: c.info, wavBase64: b64(c.wav) })),
  });
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return new File([body], `piano-be-micro-nghe-sai-${d}.json`, { type: 'application/json' });
}

export function micClaimCard(): HTMLElement {
  const card = h('section', { class: 'card mic-claim-card', hidden: true });
  const render = (list: MicClaimRecord[]) => {
    if (!list.length) {
      card.hidden = true;
      card.replaceChildren();
      return;
    }
    card.hidden = false;
    let file: File | null = null;
    card.replaceChildren(
      h('h2', {}, `🙉 Bé báo "app nghe sai" ${list.length} lần`),
      h(
        'p',
        { class: 'muted' },
        'Mỗi lần app đã tự chỉnh nếu được. Muốn sửa tận gốc: gửi tệp này cho người làm app (Zalo / AirDrop). Tệp chỉ có tiếng micro 4 giây quanh lúc bé đàn, lưu trên iPad này.',
      ),
      h(
        'div',
        { class: 'row' },
        button({
          icon: '📤',
          label: 'Gửi tệp',
          kind: 'primary',
          onTap: async () => {
            file ??= claimsFile(list);
            const r = await shareFile(file, 'Micro nghe sai');
            if (r === 'retry') toast('Chạm "Gửi tệp" lần nữa nhé', 2400);
            else if (r === 'download') toast('Đã tải tệp xuống (mục Tệp / Tải về)', 2600);
          },
        }),
        button({
          icon: '🗑️',
          label: 'Xóa',
          onTap: () =>
            confirmDialog({
              title: 'Xóa các đoạn tiếng?',
              text: 'Xóa mọi lần bé báo "app nghe sai" trên iPad này.',
              okLabel: 'Xóa',
              danger: true,
              onOk: () => void clearClaims().then(() => render([])),
            }),
        }),
      ),
    );
  };
  void listClaims().then(render, () => render([]));
  return card;
}
