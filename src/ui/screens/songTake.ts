/**
 * 🎧 "Nghe lại con đàn" trên màn bài hát — chỉ khi micro bật, bản ghi chỉ nằm trong bộ nhớ.
 * Ghi một lượt (start → stop), bản ghi tới sau (bất đồng bộ) thì hiện nút "Nghe lại" ở màn kết quả của CHÍNH lượt đó.
 */
import { takeRecorder, type RecorderMic, type TakeClip, type TakeRecorder } from '../../audio/recorder';
import { button, h } from '../components/dom';

export interface TakeReplayDeps {
  mic: RecorderMic;
  micOn(): boolean;
  /** Đang ở màn kết quả (được phép hiện nút) */
  showing(): boolean;
  /** Đã rời màn */
  disposed(): boolean;
}

export class TakeReplay {
  private rec: TakeRecorder | null = null;
  private clip: TakeClip | null = null;
  private gen = 0;
  /** Ô "Nghe lại" trên màn kết quả (null = không ở màn kết quả) */
  private slot: HTMLElement | null = null;

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
    void r
      .stop()
      .catch(() => null)
      .then((c) => {
        if (my !== this.gen || this.d.disposed()) return c?.dispose();
        this.clip = c;
        this.render();
      });
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
