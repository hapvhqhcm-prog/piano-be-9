import { fingerOnKeyboard, type Hand } from './fingering';
import { PianoKey, type KeyMark } from './PianoKey';
import { KEYBOARD_HIGH, KEYBOARD_LOW, keyboardPitches, pitchToMidi, viName, type Pitch } from './pitchTable';

export interface KeyboardOptions {
  onPress?: (pitch: Pitch) => void;
  onRelease?: (pitch: Pitch) => void;
  /** Hiện tên tiếng Việt trên phím trắng: 'c' = chỉ phím Đô, 'all' = mọi phím trắng */
  labels?: 'none' | 'c' | 'all';
  /** Khi chạm phím: hiện số ngón to trên phím (mặc định: tay phải thế Đô, §6). false = tắt. */
  fingerOnPress?: ((pitch: Pitch) => number | { finger: number; hand: Hand } | null | undefined) | false;
  /** Dải phím (mặc định C3–C5) */
  low?: Pitch;
  high?: Pitch;
}

const defaultFinger = (pitch: Pitch) => fingerOnKeyboard(pitch, false);

export interface KeyTarget {
  pitch: Pitch;
  finger?: number;
  hand?: Hand;
  label?: string;
}

/**
 * Bàn phím ảo (mặc định C3–C5; đổi dải được để chơi thế Sol, gam, hai tay…).
 * Phím được tra theo MIDI nên "Bb4" và "A#4" là cùng một phím.
 * Dùng Pointer Events → nhiều ngón cùng lúc, không chờ 300 ms.
 */
export class PianoKeyboard {
  readonly el: HTMLDivElement;
  private keys = new Map<number, PianoKey>();
  private pointers = new Map<number, Pitch>();
  private enabled = true;
  private hideTimers = new Map<number, number>();
  private low: Pitch;
  private high: Pitch;

  constructor(private readonly opts: KeyboardOptions = {}) {
    this.el = document.createElement('div');
    this.el.className = 'keyboard';
    this.low = opts.low ?? KEYBOARD_LOW;
    this.high = opts.high ?? KEYBOARD_HIGH;
    this.build();
    this.el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private build(): void {
    this.el.replaceChildren();
    this.keys.clear();
    const all = keyboardPitches(this.low, this.high);
    const whites = all.filter((p) => !p.isBlack);
    const whiteW = 100 / whites.length;
    const blackW = whiteW * 0.62;
    this.el.classList.toggle('wide', whites.length > 15);
    let whiteIndex = -1;
    for (const info of all) {
      const key = new PianoKey(info);
      if (info.isBlack) {
        key.el.style.left = `${(whiteIndex + 1) * whiteW - blackW / 2}%`;
        key.el.style.width = `${blackW}%`;
      } else {
        whiteIndex++;
        key.el.style.left = `${whiteIndex * whiteW}%`;
        key.el.style.width = `${whiteW}%`;
        const labels = this.opts.labels ?? 'c';
        if (labels === 'all' || (labels === 'c' && info.letter === 'C')) key.setBaseLabel(viName(info.pitch));
      }
      this.keys.set(info.midi, key);
      this.el.append(key.el);
    }
  }

  /** Đổi dải phím (vd chuyển sang thế Sol). */
  setRange(low: Pitch, high: Pitch): void {
    if (pitchToMidi(low) === pitchToMidi(this.low) && pitchToMidi(high) === pitchToMidi(this.high)) return;
    this.low = low;
    this.high = high;
    this.build();
  }

  get range(): [Pitch, Pitch] {
    return [this.low, this.high];
  }

  private key(pitch: Pitch): PianoKey | undefined {
    try {
      return this.keys.get(pitchToMidi(pitch));
    } catch {
      return undefined;
    }
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    const keyEl = (e.target as Element).closest<HTMLElement>('[data-pitch]');
    const pitch = keyEl?.dataset.pitch;
    if (!pitch) return;
    this.pointers.set(e.pointerId, pitch);
    const key = this.key(pitch);
    key?.setPressed(true);
    const fingerOf = this.opts.fingerOnPress === undefined ? defaultFinger : this.opts.fingerOnPress;
    const r = fingerOf ? fingerOf(pitch) : undefined;
    const mark = typeof r === 'number' ? { finger: r, hand: 'RH' as Hand } : r;
    if (key && mark) {
      window.clearTimeout(this.hideTimers.get(pitchToMidi(pitch)));
      key.showPressFinger(mark.finger, mark.hand);
    }
    this.opts.onPress?.(pitch);
  };

  private onUp = (e: PointerEvent): void => {
    const pitch = this.pointers.get(e.pointerId);
    if (!pitch) return;
    this.pointers.delete(e.pointerId);
    if (![...this.pointers.values()].includes(pitch)) {
      const key = this.key(pitch);
      key?.setPressed(false);
      // Giữ số ngón thêm một chút cho bé kịp nhìn.
      this.hideTimers.set(
        pitchToMidi(pitch),
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
      this.key(t.pitch)?.setTarget(mark);
    }
  }

  setGuides(pitches: Pitch[]): void {
    const set = new Set(pitches.map(pitchToMidi));
    this.keys.forEach((k, m) => k.setGuide(set.has(m)));
  }

  setResult(pitch: Pitch | null, kind: 'good' | 'show' | 'heard' | null): void {
    const target = pitch ? pitchToMidi(pitch) : -1;
    this.keys.forEach((k, m) => k.setResult(m === target ? kind : null));
  }

  /** Nháy phím khi app phát âm mẫu. */
  flash(pitch: Pitch, on: boolean): void {
    this.key(pitch)?.setPressed(on);
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
