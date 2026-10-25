/**
 * 🎧 "Nghe lại con đàn" trên màn bài hát — chỉ khi micro bật, bản ghi nằm trong bộ nhớ.
 * Ghi một lượt (start → stop), bản ghi tới sau (bất đồng bộ) thì hiện nút "Nghe lại" ở màn kết quả của CHÍNH lượt đó.
 * (+ 2026-10-08) Lượt cả bài HAY HƠN bản đang có trong "🎧 Album của con" → tự lưu (mặc định có), kèm nút "Không lưu"
 * (hoàn tác). Album chỉ nằm trên iPad này (src/progress/albumStore.ts).
 */
import { clipFromBlob, takeRecorder, type RecorderMic, type TakeClip, type TakeRecorder } from '../../audio/recorder';
import { albumStore, type AlbumTake, type TakeScore } from '../../progress/albumStore';
import { isGuestMode } from '../../progress/ProgressStore';
import { rememberTake, scoreTake, type MemTake } from './sessionTakes';
import type { App } from '../App';
import { button, h } from '../components/dom';
import { clipLoader, progressCompare, type CompareSide } from '../components/progressCompare';
import '../../styles/album.css';

export interface TakeReplayDeps {
  mic: RecorderMic;
  micOn(): boolean;
  /** Đang ở màn kết quả (được phép hiện nút) */
  showing(): boolean;
  /** Đã rời màn */
  disposed(): boolean;
  /** Bài này được lưu vào Album (không có = không lưu, vd đọc nhạc ngẫu nhiên) */
  album?: { songId: string; title: string };
}

export class TakeReplay {
  private rec: TakeRecorder | null = null;
  private clip: TakeClip | null = null;
  private gen = 0;
  /** Ô "Nghe lại" trên màn kết quả (null = không ở màn kết quả) */
  private slot: HTMLElement | null = null;
  /** Bản ghi của lượt vừa dừng (tới sau) — cho Album */
  private pending: Promise<TakeClip | null> | null = null;
  /**
   * (+ 2026-10-09) GIỮ bản ghi lượt vừa chơi trong lúc "🎯 Luyện ngay chỗ này" (các lượt luyện không ghi, không xoá
   * bản này) → quay về màn kết quả vẫn "🎧 Nghe lại" được. Rời màn thì vẫn xoá như thường.
   */
  private held = false;
  /** (+ 2026-10-16) Lúc bắt đầu ghi lượt hiện tại (ms) — bản "lần đầu" phải cũ hơn lượt này */
  private startedAt = 0;
  /** (+ 2026-10-16) Album đã cân nhắc xong bản ghi lượt vừa dừng (đã lưu / không lưu) */
  private albumDone: Promise<unknown> | null = null;
  /** (+ 2026-10-16) "🎧 Nghe lần đầu → hôm nay" đang hiện (dừng phát khi rời / lượt mới) */
  private progress: { stop(): void } | null = null;
  /** (+ 2026-10-17) Lượt vừa dừng trong bộ nhớ của buổi (sessionTakes) — cho "🎧 Nghe con vừa đàn" ở màn kết buổi */
  private memP: Promise<MemTake | null> | null = null;

  constructor(private readonly d: TakeReplayDeps) {}

  /** Bắt đầu ghi lượt mới — KHÔNG BAO GIỜ ghi khi micro tắt */
  start(): void {
    if (this.held) return;
    this.drop();
    if (!this.d.micOn()) return;
    this.startedAt = Date.now();
    this.rec = takeRecorder(this.d.mic);
    this.rec?.start();
  }

  /** Hết lượt: dừng ghi; bản ghi tới sau (bất đồng bộ) thì hiện nút nếu vẫn đang ở màn kết quả lượt này */
  stop(): void {
    if (this.held) return;
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    const my = this.gen;
    const a = this.d.album;
    const raw = r.stop().catch(() => null);
    // Nhớ cho màn kết buổi TRƯỚC khi xét lượt mới / rời màn (bản ghi thường tới sau khi đã sang màn kế)
    this.memP = raw.then((c) => {
      const blob = c?.blob?.() ?? null;
      return c && blob ? rememberTake({ blob, seconds: c.seconds, songId: a?.songId ?? null, title: a?.title ?? '' }) : null;
    });
    this.pending = raw
      .then((c) => {
        if (my !== this.gen || this.d.disposed()) {
          c?.dispose();
          return null;
        }
        this.clip = c;
        this.render();
        return c;
      });
  }

  /**
   * Màn kết quả của lượt vừa dừng: điểm của lượt (null = lượt không tính cho Album: một câu, tách tay…).
   * Hay hơn bản trong Album → lưu luôn (mặc định có) + "Không lưu" để hoàn tác.
   */
  offerAlbum(score: TakeScore | null): void {
    const p = this.pending;
    const a = this.d.album;
    if (score) void this.memP?.then((m) => m && scoreTake(m, score)).catch(() => undefined);
    if (!p || !score || !a) return;
    if (isGuestMode()) return; // (+ 2026-10-17) 👤 khách chơi: không lưu Album
    const my = this.gen;
    this.albumDone = p.then(async (c) => {
      const blob = c?.blob?.() ?? null;
      const store = albumStore();
      if (!c || !blob || !store || my !== this.gen) return;
      const v = await store.consider({ songId: a.songId, title: a.title, blob, seconds: c.seconds, ...score });
      if (my !== this.gen || this.d.disposed()) return;
      if (v.saved) this.showSaved(a.songId, v.previous);
      else if (v.reason === 'full') this.note(h('span', { class: 'take-album-text' }, '📀 Album đầy rồi — bản này không lưu nhé'));
    }).catch(() => undefined);
  }

  /**
   * (+ 2026-10-16, OWNER duyệt — "Nghe lại tiến bộ của con") Lượt này làm bài chuyển sang ĐÃ THUỘC: Album có bản ĐẦU TIÊN
   * (cũ hơn lượt này) → hiện hai thẻ "🌱 Lần đầu → 🌟 Hôm nay" + nút nghe liền mạch (dưới nút Nghe lại). "Hôm nay" = bản ghi
   * của chính lượt này (trong bộ nhớ — kể cả khi Album TẮT: không lưu gì); micro tắt → bản hay nhất trong Album (nếu khác
   * bản đầu). Không có bản đầu → không hiện gì. Chờ Album lưu xong (bản cũ có thể vừa chuyển sang ô "lần đầu").
   */
  offerProgress(app: App, score: TakeScore): void {
    const a = this.d.album;
    const store = albumStore();
    if (!a || !store) return;
    const my = this.gen;
    const since = this.pending && this.startedAt ? this.startedAt : Date.now();
    const clipP = this.pending ?? Promise.resolve(null);
    void Promise.resolve(this.albumDone)
      .then(async () => {
        const first = await store.firstOf(a.songId);
        if (!first || first.meta.savedAt >= since || my !== this.gen || this.d.disposed()) return;
        const c = await clipP;
        const blob = c?.blob?.() ?? null;
        let now: CompareSide | null = null;
        if (c && blob) {
          const sec = c.seconds;
          now = { at: Date.now(), stars: score.stars, accuracy: score.accuracy, load: async () => clipFromBlob(blob, sec, app.audio) };
        } else {
          const best = (await store.list()).find((m) => m.songId === a.songId);
          if (best && best.savedAt !== first.meta.savedAt)
            now = { at: best.savedAt, stars: best.stars, accuracy: best.accuracy, load: clipLoader(app.audio, () => store.getSlot(a.songId, 'best')) };
        }
        if (!now || my !== this.gen || this.d.disposed() || !this.slot || !this.d.showing()) return;
        const f = first.meta;
        const pc = progressCompare(app, {
          compact: true,
          first: { at: f.savedAt, stars: f.stars, accuracy: f.accuracy, trueFirst: !!f.firstTake, load: clipLoader(app.audio, () => store.getSlot(a.songId, first.slot)) },
          now,
        });
        this.progress?.stop();
        this.progress = pc;
        this.slot.querySelector('.take-progress')?.remove();
        this.slot.append(h('div', { class: 'take-progress' }, h('div', { class: 'take-progress-head' }, '⭐ Con thuộc bài này rồi! Nghe con tiến bộ thế nào nhé:'), pc.el));
      })
      .catch(() => undefined);
  }

  private note(...kids: HTMLElement[]): void {
    if (!this.slot || !this.d.showing()) return;
    this.slot.querySelector('.take-album')?.remove();
    this.slot.append(h('div', { class: 'take-album' }, ...kids));
  }

  private showSaved(songId: string, previous: AlbumTake | null): void {
    const text = h('span', { class: 'take-album-text' }, '📀 Đã lưu vào Album của con!');
    const undo = h(
      'button',
      {
        class: 'take-album-undo',
        type: 'button',
        onClick: () => {
          undo.remove();
          void albumStore()
            ?.undo(songId, previous)
            .then((ok) => (text.textContent = ok ? 'Không lưu bản này.' : '📀 Chưa bỏ được bản này — không sao đâu!'));
        },
      },
      'Không lưu',
    );
    this.note(text, undo);
  }

  /**
   * (+ 2026-10-12) Bản ghi của lượt vừa dừng (Blob + giây) — (bé nghe lại / Album). null = không có
   * (micro tắt / lượt đã bị bỏ). Lấy Blob NGAY khi bản ghi tới (trước khi lượt mới / rời màn giải phóng nó).
   */
  clipNow(): Promise<{ blob: Blob; seconds: number } | null> | null {
    const p = this.pending;
    if (!p) return null;
    return p.then((c) => {
      const blob = c?.blob?.() ?? null;
      return c && blob ? { blob, seconds: c.seconds } : null;
    });
  }

  /** Bỏ bản ghi (lượt mới / rời màn): dừng phát, giải phóng bộ nhớ */
  drop(): void {
    if (this.held && !this.d.disposed()) return;
    this.gen++;
    this.progress?.stop();
    this.progress = null;
    this.albumDone = null;
    this.rec?.cancel();
    this.rec = null;
    this.clip?.stopPlayback();
    this.clip?.dispose();
    this.clip = null;
    this.slot = null;
    this.pending = null;
    this.memP = null;
  }

  /** Giữ / thôi giữ bản ghi hiện có (xem `held`). Đang giữ: start/stop/drop không làm gì (trừ khi đã rời màn). */
  hold(on: boolean): void {
    this.held = on;
    if (on) {
      this.clip?.stopPlayback();
      this.progress?.stop();
    }
  }

  /** Ô trống cho màn kết quả; có bản ghi (ngay hoặc tới sau) thì điền nút + một câu hỏi nhẹ. */
  makeSlot(): HTMLElement {
    this.slot = h('div', { class: 'take-row' });
    return this.slot;
  }

  render(): void {
    const c = this.clip;
    const slot = this.slot;
    if (!c || !slot || !this.d.showing()) return;
    let playing = false;
    const b = button({
      icon: '🎧',
      label: 'Nghe lại',
      kind: 'sun',
      onTap: () => {
        if (playing) return c.stopPlayback();
        playing = true;
        setLook('⏹', 'Dừng');
        void c
          .play()
          .catch(() => undefined)
          .then(() => {
            playing = false;
            setLook('🎧', 'Nghe lại');
          });
      },
    });
    const setLook = (icon: string, label: string) => {
      b.querySelector('.btn-icon')!.textContent = icon;
      b.querySelector('.btn-label')!.textContent = label;
    };
    b.classList.add('take-btn');
    // (+ 2026-10-16) giữ dòng Album / "Nghe lần đầu → hôm nay" nếu đã có trong ô
    const keep = Array.from(slot.querySelectorAll<HTMLElement>(':scope > .take-album, :scope > .take-progress'));
    slot.replaceChildren(b, h('span', { class: 'take-ask' }, 'Con nghe thấy chỗ nào chưa đều?'), ...keep);
  }
}
