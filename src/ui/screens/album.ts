/**
 * (+ 2026-10-08, OWNER duyệt) 🎧 ALBUM CỦA CON — bản thu hay nhất của mỗi bài (chỉ trên iPad này).
 * Mở từ Thư viện. Mỗi bài: ngày, sao, ▶ nghe / ⏸ dừng, 📤 Gửi (bảng Chia sẻ của iOS — gửi ông bà; không có thì tải tệp).
 * Phần cho bố mẹ (bật/tắt, xoá Album) ở màn Phụ huynh: albumParent.ts.
 */
import { clipFromBlob, type TakeClip } from '../../audio/recorder';
import { albumEnabled, albumFileName, albumStore, type AlbumMeta } from '../../progress/albumStore';
import type { App } from '../App';
import { actionBar, backButton, button, h, toast } from '../components/dom';
import { songEmoji } from '../components/songArt';
import '../../styles/album.css';

const fmtDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};
const fmtLen = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Gửi tệp: bảng Chia sẻ của iOS (navigator.share có tệp) → không có thì tải tệp xuống. */
async function shareFile(file: File, title: string): Promise<'shared' | 'cancel' | 'download' | 'retry'> {
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

export function albumScreen(app: App, onBack: () => void) {
  return (root: HTMLElement) => {
    const store = albumStore();
    let disposed = false;
    let playing: { songId: string; clip: TakeClip } | null = null;
    /** Tệp đã đọc sẵn (để chạm "Gửi" lần sau gọi bảng Chia sẻ ngay — Safari cần) */
    const files = new Map<string, File>();
    const list = h('ul', { class: 'album-list' });
    const wrap = h(
      'div',
      { class: 'album-wrap scrollable' },
      h('p', { class: 'album-note' }, '🔒 Bản thu chỉ nằm trên iPad này. Mỗi bài giữ bản con đàn hay nhất.'),
      list,
    );
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'topbar' }, h('div', { class: 'topbar-title' }, '🎧 Album của con')),
        wrap,
        actionBar(backButton(onBack)),
      ),
    );

    const stopPlaying = () => {
      const p = playing;
      playing = null;
      p?.clip.stopPlayback();
      p?.clip.dispose();
      list.querySelectorAll('.album-item.playing').forEach((x) => x.classList.remove('playing'));
    };

    const loadFile = async (m: AlbumMeta): Promise<File | null> => {
      const have = files.get(m.songId);
      if (have) return have;
      const t = await store?.get(m.songId);
      if (!t) return null;
      const f = new File([t.data], albumFileName(m), { type: m.mime });
      files.set(m.songId, f);
      return f;
    };

    const row = (m: AlbumMeta): HTMLElement => {
      const li = h('li', { class: 'album-item' });
      const playBtn = button({
        icon: '▶',
        label: 'Nghe',
        kind: 'primary',
        onTap: async () => {
          if (playing?.songId === m.songId) return stopPlaying();
          stopPlaying();
          const f = await loadFile(m);
          if (disposed) return;
          if (!f) return toast('Chưa mở được bản thu này');
          const clip = clipFromBlob(f, m.seconds, app.audio);
          playing = { songId: m.songId, clip };
          li.classList.add('playing');
          setLook('⏸', 'Dừng');
          await clip.play().catch(() => undefined);
          if (playing?.clip === clip) stopPlaying();
          setLook('▶', 'Nghe');
        },
      });
      const setLook = (icon: string, label: string) => {
        playBtn.querySelector('.btn-icon')!.textContent = icon;
        playBtn.querySelector('.btn-label')!.textContent = label;
      };
      const shareBtn = button({
        icon: '📤',
        label: 'Gửi',
        onTap: async () => {
          const f = await loadFile(m);
          if (!f) return toast('Chưa mở được bản thu này');
          const r = await shareFile(f, `${m.title} — con đàn`);
          if (r === 'retry') toast('Chạm “Gửi” lần nữa nhé', 2500);
          else if (r === 'download') toast('Đã tải tệp xuống');
        },
      });
      li.append(
        h('span', { class: 'album-emoji', 'aria-hidden': 'true' }, songEmoji({ titleVi: m.title })),
        h(
          'div',
          { class: 'album-info' },
          h('div', { class: 'album-title' }, m.title),
          h(
            'div',
            { class: 'album-sub' },
            h('span', { class: 'album-stars', 'aria-label': `${m.stars} trên 3 sao` }, '★'.repeat(m.stars), h('span', { class: 'stars-off' }, '★'.repeat(3 - m.stars))),
            ` · 📅 ${fmtDay(m.savedAt)} · ${fmtLen(m.seconds)}`,
          ),
        ),
        h('div', { class: 'album-actions' }, playBtn, shareBtn),
      );
      return li;
    };

    const empty = (text: string) =>
      h('li', { class: 'album-empty' }, h('div', { class: 'album-empty-emoji' }, '🎧'), h('p', {}, text));

    if (!store) {
      list.append(empty('iPad này chưa lưu được bản thu (trình duyệt không cho lưu).'));
    } else {
      void store.list().then((metas) => {
        if (disposed) return;
        if (!metas.length) {
          list.append(
            empty(
              albumEnabled()
                ? 'Chưa có bản thu nào. Bật micro rồi đàn cả bài — bản hay nhất sẽ vào đây!'
                : 'Album đang tắt — bố mẹ bật lại ở màn Phụ huynh nhé.',
            ),
          );
          return;
        }
        list.append(...metas.map(row));
      });
    }

    return () => {
      disposed = true;
      stopPlaying();
      files.clear();
    };
  };
}
