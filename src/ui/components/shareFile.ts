import { h } from './dom';

/** (Tách từ album.ts 2026-10-25 — dùng chung với 🎙️ Máy ghi âm) Gửi tệp: bảng Chia sẻ của iOS (navigator.share có tệp) → không có thì tải tệp xuống. */
export async function shareFile(file: File, title: string): Promise<'shared' | 'cancel' | 'download' | 'retry'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'AbortError') return 'cancel';
      // Safari đòi chạm trực tiếp: lần chạm đầu phải chờ đọc tệp → chạm lại là gửi được (tệp đã sẵn)
      if (name === 'NotAllowedError') return 'retry';
    }
  }
  try {
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'download';
  } catch {
    return 'cancel';
  }
}
