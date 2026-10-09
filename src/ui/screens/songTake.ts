/**
 * 🎧 "Nghe lại con đàn" trên màn bài hát — chỉ khi micro bật, bản ghi nằm trong bộ nhớ.
 * Ghi một lượt (start → stop), bản ghi tới sau (bất đồng bộ) thì hiện nút "Nghe lại" ở màn kết quả của CHÍNH lượt đó.
 * (+ 2026-10-08) Lượt cả bài HAY HƠN bản đang có trong "🎧 Album của con" → tự lưu (mặc định có), kèm nút "Không lưu"
 * (hoàn tác). Album chỉ nằm trên iPad này (src/progress/albumStore.ts).
 */
import { takeRecorder, type RecorderMic, type TakeClip, type TakeRecorder } from '../../audio/recorder';
import { albumStore, type AlbumTake, type TakeScore } from '../../progress/albumStore';
import { button, h } from '../components/dom';
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

  constructor(private readonly d: TakeReplayDeps) {}

  /** Bắt đầu ghi lượt mới — KHÔNG BAO GIỜ ghi khi micro tắt */
  start(): void {
    this.drop();
    if (!this.d.micOn()) return;
    this.rec = takeRecorder(this.d.mic);
    this.rec?.start();
  }

  /** Hết lượt: dừng ghi; bản ghi tới sau (bất đồng bộ) thì hiện nút nếu vẫn đang ở màn kết quả lượt này */
  stop(): void {
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    const my = this.gen;
    this.pending = r
      .stop()
      .catch(() => null)
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
    if (!p || !score || !a) return;
    const my = this.gen;
    void p.then(async (c) => {
      const blob = c?.blob?.() ?? null;
      const store = albumStore();
      if (!c || !blob || !store || my !== this.gen) return;
      const v = await store.consider({ songId: a.songId, title: a.title, blob, seconds: c.seconds, ...score });
      if (my !== this.gen || this.d.disposed()) return;
      if (v.saved) this.showSaved(a.songId, v.previous);
      else if (v.reason === 'full') this.note(h('span', { class: 'take-album-text' }, '📀 Album đầy — bố mẹ xóa bớt ở màn Phụ huynh nhé'));
    }).catch(() => undefined);
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
            .then((ok) => (text.textContent = ok ? 'Không lưu bản này.' : '📀 Chưa bỏ được — bố mẹ xóa ở Album nhé'));
        },
      },
      'Không lưu',
    );
    this.note(text, undo);
  }

  /** Bỏ bản ghi (lượt mới / rời màn): dừng phát, giải phóng bộ nhớ */
  drop(): void {
    this.gen++;
    this.rec?.cancel();
    this.rec = null;
    this.clip?.stopPlayback();
    this.clip?.dispose();
    this.clip = null;
    this.slot = null;
    this.pending = null;
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
    slot.replaceChildren(b, h('span', { class: 'take-ask' }, 'Con nghe thấy chỗ nào chưa đều?'));
  }
}
