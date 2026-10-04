import { fingerOnKeyboard, type Hand } from './fingering';
import { PianoKey, type KeyMark } from './PianoKey';
import { KEYBOARD_PITCHES, viName, type Pitch } from './pitchTable';

export interface KeyboardOptions {
  onPress?: (pitch: Pitch) => void;
  onRelease?: (pitch: Pitch) => void;
  /** Hiện tên tiếng Việt trên phím trắng: 'c' = chỉ phím Đô, 'all' = mọi phím trắng */
  labels?: 'none' | 'c' | 'all';
  /** Khi chạm phím: hiện số ngón to trên phím (mặc định: tay phải thế Đô, §6). false = tắt. */
  fingerOnPress?: ((pitch: Pitch) => number | { finger: number; hand: Hand } | null | undefined) | false;
}

/** Phase 1: chỉ tay phải thế Đô (tay trái mở ở Phase 3). */
const defaultFinger = (pitch: Pitch) => fingerOnKeyboard(pitch, false);

export interface KeyTarget {
  pitch: Pitch;
  finger?: number;
  hand?: Hand;
  label?: string;
}

/**
 * Bàn phím ảo C3–C5 (15 phím trắng, 10 phím đen).
 * Dùng Pointer Events → nhiều ngón cùng lúc, không chờ 300 ms.
 */
export class PianoKeyboard {
  readonly el: HTMLDivElement;
  private keys = new Map<Pitch, PianoKey>();
  private pointers = new Map<number, Pitch>();
  private enabled = true;
  private hideTimers = new Map<Pitch, number>();

  constructor(private readonly opts: KeyboardOptions = {}) {
    this.el = document.createElement('div');
    this.el.className = 'keyboard';
    const whites = KEYBOARD_PITCHES.filter((p) => !p.isBlack);
    const whiteW = 100 / whites.length;
    const blackW = whiteW * 0.62;
    let whiteIndex = -1;
    for (const info of KEYBOARD_PITCHES) {
      const key = new PianoKey(info);
      if (info.isBlack) {
        key.el.style.left = `${(whiteIndex + 1) * whiteW - blackW / 2}%`;
        key.el.style.width = `${blackW}%`;
      } else {
        whiteIndex++;
        key.el.style.left = `${whiteIndex * whiteW}%`;
        key.el.style.width = `${whiteW}%`;
        const labels = opts.labels ?? 'c';
        if (labels === 'all' || (labels === 'c' && info.letter === 'C')) key.setBaseLabel(viName(info.pitch));
      }
      this.keys.set(info.pitch, key);
      this.el.append(key.el);
    }
    this.el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    const keyEl = (e.target as Element).closest<HTMLElement>('[data-pitch]');
    const pitch = keyEl?.dataset.pitch;
    if (!pitch) return;
    this.pointers.set(e.pointerId, pitch);
    const key = this.keys.get(pitch);
    key?.setPressed(true);
    const fingerOf = this.opts.fingerOnPress === undefined ? defaultFinger : this.opts.fingerOnPress;
    const r = fingerOf ? fingerOf(pitch) : undefined;
    const mark = typeof r === 'number' ? { finger: r, hand: 'RH' as Hand } : r;
    if (key && mark) {
      window.clearTimeout(this.hideTimers.get(pitch));
      key.showPressFinger(mark.finger, mark.hand);
    }
    this.opts.onPress?.(pitch);
  };

  private onUp = (e: PointerEvent): void => {
    const pitch = this.pointers.get(e.pointerId);
    if (!pitch) return;
    this.pointers.delete(e.pointerId);
    if (![...this.pointers.values()].includes(pitch)) {
      const key = this.keys.get(pitch);
      key?.setPressed(false);
      // Giữ số ngón thêm một chút cho bé kịp nhìn.
      this.hideTimers.set(
        pitch,
        window.setTimeout(() => key?.showPressFinger(null), 900),
      );
    }
    this.opts.onRelease?.(pitch);
  };

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.el.classList.toggle('is-disabled', !on);
  }

  /** Sáng các phím cần đánh (xóa đánh dấu cũ). */
  setTargets(targets: KeyTarget[]): void {
    this.keys.forEach((k) => k.setTarget(null));
    for (const t of targets) {
      const mark: KeyMark = { hand: t.hand, finger: t.finger, label: t.label };
      this.keys.get(t.pitch)?.setTarget(mark);
    }
  }

  setGuides(pitches: Pitch[]): void {
    const set = new Set(pitches);
    this.keys.forEach((k, p) => k.setGuide(set.has(p)));
  }

  setResult(pitch: Pitch | null, kind: 'good' | 'show' | 'heard' | null): void {
    this.keys.forEach((k, p) => k.setResult(p === pitch ? kind : null));
  }

  /** Nháy phím khi app phát âm mẫu. */
  flash(pitch: Pitch, on: boolean): void {
    this.keys.get(pitch)?.setPressed(on);
  }

  clear(): void {
    this.keys.forEach((k) => {
      k.setTarget(null);
      k.setGuide(false);
      k.setResult(null);
      k.setPressed(false);
    });
  }

  destroy(): void {
    this.hideTimers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.el.remove();
  }
}
