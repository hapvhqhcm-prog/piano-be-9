import type { AudioEngine } from '../../audio/AudioEngine';
import type { Target } from '../../lessons/types';
import { noteStyles, onsets, type Tune } from '../../music/tune';
import type { Hand } from '../../piano/fingering';
import type { PianoKeyboard } from '../../piano/PianoKeyboard';
import { pitchFreq, pitchToMidi, viName, type Pitch } from '../../piano/pitchTable';
import { HAND_VIEW, RH_TIP_X, handArt, type HandArt } from './handArt';
import { FINGER_NAMES } from './handDiagram';

/**
 * "VIDEO MINH HỌA" — hoạt hình thầy đàn mẫu, sinh tự động cho mọi bài học / bài hát:
 * bàn tay hoạt hình trượt trên chính bàn phím của màn hình, nhấn đúng NGÓN vào đúng PHÍM, có tiếng và phụ đề.
 * Không dùng file video → app vẫn nhẹ, chạy offline.
 */

export interface DemoNote {
  pitch: Pitch;
  finger?: number;
  hand: Hand;
  /** v4 — âm lượng tương đối (sắc thái p/mf/f); mặc định 1 */
  vol?: number;
  /** v4 — độ dài thật sự kêu (phách): ngắt tiếng ngắn, luyến giữ liền; mặc định 95% độ dài sự kiện */
  len?: number;
}

export interface DemoEvent {
  /** Thời điểm (phách) */
  time: number;
  /** Độ dài (phách) */
  dur: number;
  notes: DemoNote[];
  caption?: string;
}

const captionOf = (ns: DemoNote[]) => {
  const parts = ns.map((n) => `${viName(n.pitch)}${n.finger ? ` — ngón ${n.finger} (${FINGER_NAMES[n.finger]})` : ''}`);
  return parts.length > 2 ? `Hợp âm: ${ns.map((n) => viName(n.pitch)).join(' + ')}` : parts.join(' · ');
};

/** Sự kiện từ bài hát: mỗi nhóm nốt cùng lúc (cả hai tay, hợp âm). */
export function eventsFromTune(t: Tune): DemoEvent[] {
  const styles = noteStyles(t);
  return onsets(t).map((o) => {
    const notes: DemoNote[] = o.notes.flatMap((n) => {
      const st = styles.get(n.index);
      const style = st ? { vol: st.vol, len: st.len } : {};
      return [
        { pitch: n.pitch!, finger: n.finger, hand: n.hand, ...style },
        ...(n.also ?? []).map((a) => ({ pitch: a.pitch, finger: a.finger, hand: n.hand, ...style })),
      ];
    });
    const dur = Math.min(...o.notes.map((n) => n.beats));
    return { time: o.start, dur, notes, caption: captionOf(notes) };
  });
}

/** Sự kiện từ danh sách việc "Từng nốt": nốt rời, nhại lại (lần lượt), hợp âm (cùng lúc), nhóm phím đen. */
export function eventsFromTargets(targets: Target[]): DemoEvent[] {
  const out: DemoEvent[] = [];
  let t = 0;
  for (const tg of targets) {
    if (!tg.keys.length) continue;
    const hand = tg.hand ?? (pitchToMidi(tg.keys[0]) < 60 ? 'LH' : 'RH');
    const fingerAt = (i: number) =>
      tg.fingers?.[i] ?? (tg.keys.length === 1 ? tg.finger : undefined) ?? Math.min(5, i + 2);
    if (tg.noteId.startsWith('chord:')) {
      const notes = tg.keys.map((p, i) => ({ pitch: p, finger: fingerAt(i), hand }));
      out.push({ time: t, dur: 1.6, notes, caption: `${tg.title}: bấm cùng lúc` });
      t += 2.4;
      continue;
    }
    tg.keys.forEach((p, i) => {
      const n = { pitch: p, finger: fingerAt(i), hand };
      out.push({ time: t, dur: 0.8, notes: [n], caption: tg.keys.length === 1 && tg.subtitle ? `${captionOf([n])} · ${tg.subtitle}` : captionOf([n]) });
      t += 1;
    });
    t += 0.6;
  }
  return out;
}

/** Hai bàn tay hoạt hình phủ lên bàn phím (không nhận chạm). */
export class HandOverlay {
  readonly el: HTMLDivElement;
  private hands: Record<Hand, { box: HTMLDivElement; art: HandArt; placed: boolean }>;

  constructor(private readonly kb: PianoKeyboard) {
    this.el = document.createElement('div');
    this.el.className = 'hand-overlay';
    const mk = (hand: Hand) => {
      const box = document.createElement('div');
      box.className = `hand-pos hand-pos-${hand.toLowerCase()}`;
      const art = handArt(hand, { className: 'overlay-hand' });
      box.append(art.el);
      this.el.append(box);
      return { box, art, placed: false };
    };
    this.hands = { RH: mk('RH'), LH: mk('LH') };
    kb.el.append(this.el);
  }

  /** Đặt bàn tay để ngón `finger` nằm trên phím `pitch`. */
  place(hand: Hand, pitch: Pitch, finger: number, instant = false): void {
    const g = this.kb.keyCenter(pitch);
    if (!g) return;
    const h = this.hands[hand];
    const widthPct = (this.kb.whiteKeyWidth * HAND_VIEW.w) / HAND_VIEW.spacing;
    const tip = hand === 'RH' ? RH_TIP_X[finger - 1] : HAND_VIEW.w - RH_TIP_X[finger - 1];
    const left = g.center - (tip / HAND_VIEW.w) * widthPct;
    const kbW = this.kb.el.clientWidth || 1000;
    const kbH = this.kb.el.clientHeight || 300;
    const handPxH = ((widthPct / 100) * kbW * HAND_VIEW.h) / HAND_VIEW.w;
    // Đầu ngón chạm phím ở ~45% chiều cao (phím đen: cao hơn, ~28%)
    const tipLine = (g.black ? 0.28 : 0.45) * kbH;
    const top = tipLine - (HAND_VIEW.tipY / HAND_VIEW.h) * handPxH;
    h.box.classList.toggle('instant', instant || !h.placed);
    h.box.style.width = `${widthPct}%`;
    h.box.style.left = `${left}%`;
    h.box.style.top = `${top}px`;
    h.placed = true;
    h.box.classList.add('show');
  }

  press(hand: Hand, finger: number, ms: number): void {
    const a = this.hands[hand].art;
    a.setActive(finger);
    a.press(finger, ms);
  }

  release(hand: Hand): void {
    this.hands[hand].art.setActive(null);
  }

  hide(): void {
    for (const h of Object.values(this.hands)) {
      h.box.classList.remove('show');
      h.art.setActive(null);
      h.placed = false;
    }
  }

  setGhost(on: boolean): void {
    this.el.classList.toggle('ghost', on);
  }

  destroy(): void {
    this.el.remove();
  }
}

export interface DemoOptions {
  bpm?: number;
  /** Phụ đề cho từng nốt */
  onCaption?: (text: string, ev: DemoEvent) => void;
  /** Gọi mỗi khung hình với phách hiện tại (để con trỏ khuông nhạc chạy theo) */
  onBeat?: (beat: number) => void;
  /** Phát tiếng (mặc định có) */
  sound?: boolean;
}

/**
 * Phát "video": hẹn giờ tiếng đàn theo đồng hồ âm thanh, hoạt hình tay/phím theo đúng lúc.
 * Trả về hàm hủy; promise `done` xong khi hết bài hoặc bị hủy.
 */
export function playDemo(
  audio: AudioEngine,
  kb: PianoKeyboard,
  overlay: HandOverlay,
  events: DemoEvent[],
  o: DemoOptions = {},
): { cancel: () => void; done: Promise<void> } {
  let cancelled = false;
  const timers: number[] = [];
  const spb = 60 / (o.bpm ?? 60);
  const t0 = audio.now() + 0.35;
  const wall0 = performance.now() + 350;
  // Đặt tay sẵn ở vị trí đầu tiên của mỗi tay
  for (const hand of ['RH', 'LH'] as Hand[]) {
    const first = events.flatMap((e) => e.notes).find((n) => n.hand === hand && n.finger);
    if (first) overlay.place(hand, first.pitch, first.finger!, true);
  }
  for (const ev of events) {
    if (o.sound !== false) {
      for (const n of ev.notes) {
        void audio.scheduleFreq(pitchFreq(n.pitch), t0 + ev.time * spb, (n.len ?? ev.dur * 0.95) * spb, n.vol ?? 1);
      }
    }
    const at = ev.time * spb * 1000;
    // Ngắt tiếng: phím sáng / ngón nhấn ngắn theo đúng độ dài kêu
    const lenOf = (n: DemoNote) => Math.min(ev.dur * 0.9, n.len ?? ev.dur);
    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        for (const n of ev.notes) {
          if (n.finger) {
            overlay.place(n.hand, n.pitch, n.finger);
            overlay.press(n.hand, n.finger, Math.max(140, lenOf(n) * spb * 890));
          }
          kb.flash(n.pitch, true);
        }
        if (ev.caption) o.onCaption?.(ev.caption, ev);
      }, Math.max(0, wall0 - performance.now() + at)),
    );
    for (const n of ev.notes) {
      timers.push(
        window.setTimeout(() => kb.flash(n.pitch, false), Math.max(0, wall0 - performance.now() + at + lenOf(n) * spb * 1000)),
      );
    }
  }
  const end = events.length ? Math.max(...events.map((e) => e.time + e.dur)) : 0;
  let raf = 0;
  const loop = () => {
    if (cancelled) return;
    o.onBeat?.((audio.now() - t0) / spb);
    raf = requestAnimationFrame(loop);
  };
  if (o.onBeat) raf = requestAnimationFrame(loop);
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
    timers.push(
      window.setTimeout(() => {
        cancelAnimationFrame(raf);
        overlay.release('RH');
        overlay.release('LH');
        resolve();
      }, Math.max(0, wall0 - performance.now() + end * spb * 1000 + 400)),
    );
  });
  return {
    done,
    cancel() {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf);
      audio.stopAll();
      overlay.hide();
      kb.clear();
      resolveDone();
    },
  };
}
