import type { Hand } from './fingering';
import type { PitchInfo } from './pitchTable';

export interface KeyMark {
  hand?: Hand;
  finger?: number;
  label?: string;
}

/** Một phím trên bàn phím ảo. Chỉ quản lý giao diện của chính nó. */
export class PianoKey {
  readonly el: HTMLDivElement;
  private badge: HTMLDivElement;
  private labelEl: HTMLDivElement;
  private pressBadge: HTMLDivElement;
  private baseLabel = '';

  constructor(readonly info: PitchInfo) {
    this.el = document.createElement('div');
    this.el.className = `key ${info.isBlack ? 'key-black' : 'key-white'}`;
    this.el.dataset.pitch = info.pitch;
    this.badge = document.createElement('div');
    this.badge.className = 'key-badge';
    this.labelEl = document.createElement('div');
    this.labelEl.className = 'key-label';
    this.pressBadge = document.createElement('div');
    this.pressBadge.className = 'key-press-finger';
    this.el.append(this.badge, this.labelEl, this.pressBadge);
  }

  /** Số ngón to, nảy lên khi bé chạm phím; null để ẩn. */
  showPressFinger(finger: number | null, hand: Hand = 'RH'): void {
    this.el.classList.toggle('finger-pressed', finger !== null);
    if (finger === null) {
      this.pressBadge.classList.remove('show');
      return;
    }
    this.pressBadge.textContent = String(finger);
    this.pressBadge.classList.toggle('lh', hand === 'LH');
    this.pressBadge.classList.remove('show');
    void this.pressBadge.offsetWidth; // chạy lại hiệu ứng nảy
    this.pressBadge.classList.add('show');
  }

  get pitch(): string {
    return this.info.pitch;
  }

  setPressed(on: boolean): void {
    this.el.classList.toggle('is-pressed', on);
  }

  /** Nhãn mặc định (vd "Đô" trên mọi phím C) — hiện khi không có đánh dấu. */
  setBaseLabel(text: string): void {
    this.baseLabel = text;
    if (!this.el.classList.contains('is-target')) this.labelEl.textContent = text;
  }

  /** Phím cần đánh: sáng + số ngón to; null để xóa. */
  setTarget(mark: KeyMark | null): void {
    this.el.classList.toggle('is-target', !!mark);
    this.el.classList.toggle('hand-rh', mark?.hand === 'RH' || (!!mark && !mark.hand));
    this.el.classList.toggle('hand-lh', mark?.hand === 'LH');
    this.badge.textContent = mark?.finger ? String(mark.finger) : '';
    this.badge.classList.toggle('show', !!mark?.finger);
    this.labelEl.textContent = mark?.label ?? (mark ? '' : this.baseLabel);
  }

  setGuide(on: boolean): void {
    this.el.classList.toggle('is-guide', on);
  }

  setResult(kind: 'good' | 'show' | null): void {
    this.el.classList.toggle('is-good', kind === 'good');
    this.el.classList.toggle('is-show', kind === 'show');
  }
}
