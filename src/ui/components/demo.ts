import type { AudioEngine } from '../../audio/AudioEngine';
import type { Target } from '../../lessons/types';
import { STAC_FRACTION, expressionUsed, noteStyles, onsets, tunePedal, type Tune } from '../../music/tune';
import type { Hand } from '../../piano/fingering';
import type { PianoKeyboard } from '../../piano/PianoKeyboard';
import { pitchFreq, pitchToMidi, viName, type Pitch } from '../../piano/pitchTable';
import { FINGER_NAMES } from './handDiagram';
import { badgeY } from './fingerMapGeo';

/**
 * "VIDEO MINH HỌA" — hoạt hình thầy đàn mẫu, sinh tự động cho mọi bài học / bài hát:
 * số ngón trượt trên chính bàn phím của màn hình, nhấn đúng NGÓN vào đúng PHÍM, có tiếng và phụ đề.
 * Không dùng file video → app vẫn nhẹ, chạy offline.
 *
 * (+ 2026-10-15) Mặc định chính BẢN ĐỒ NGÓN trên bàn phím (keyboardHand.ts) đàn mẫu — demoHands.ts (nạp muộn): đúng
 * ngón nhấn đúng phím lúc nốt kêu, đổi thế / luồn ngón đi trước, hai tay, ngắt / luyến, pedal; hình chạy theo
 * đồng hồ AudioContext trong MỘT vòng requestAnimationFrame. Lớp "thầy đàn mẫu" đơn giản (HandOverlay — một huy hiệu số
 * ngón mỗi tay) chỉ còn là đường dự phòng (`hand: 'teacher'`, hoặc không nạp được demoHands) và gợi ý "phím + ngón" khi
 * micro nghe sai nhiều lần. (2026-10-18: không còn hình bàn tay người.)
 */

export interface DemoNote {
  pitch: Pitch;
  finger?: number;
  hand: Hand;
  /** v4 — âm lượng tương đối (sắc thái p/mf/f); mặc định 1 */
  vol?: number;
  /** v4 — độ dài thật sự kêu (phách): ngắt tiếng ngắn, luyến giữ liền; mặc định 95% độ dài sự kiện */
  len?: number;
  /** (+ 2026-10-12) Cấp 4 — pedal giữ tiếng (len tính tới lúc thay / nhả pedal) */
  pedal?: boolean;
  /** (+ 2026-10-15) Độ dài GIỮ PHÍM (phách) — khác `len` khi có pedal (tiếng ngân tiếp sau khi nhấc tay) */
  key?: number;
  /** (+ 2026-10-15) Ngắt tiếng (staccato) — bàn tay mẫu nhấc ngón nhanh, nảy nhẹ */
  stac?: boolean;
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
      // Có pedal: tiếng ngân tới lúc thay pedal nhưng TAY nhấc theo độ dài nốt
      const key = st?.pedal ? n.beats * (n.stac ? STAC_FRACTION : st.slurred ? 1.02 : 0.95) : st?.len;
      const style = st
        ? { vol: st.vol, len: st.len, ...(st.pedal ? { pedal: true } : {}), ...(key !== undefined ? { key } : {}), ...(n.stac ? { stac: true } : {}) }
        : {};
      return [
        { pitch: n.pitch!, finger: n.finger, hand: n.hand, ...style },
        ...(n.also ?? []).map((a) => ({ pitch: a.pitch, finger: a.finger, hand: n.hand, ...style })),
      ];
    });
    const dur = Math.min(...o.notes.map((n) => n.beats));
    return { time: o.start, dur, notes, caption: captionOf(notes) };
  });
}

/** (+ 2026-10-12) Cấp 4 — các khoảng pedal đạp (phách) của bài, để playDemo đạp pedal thật; [] nếu bài không ghi pedal. */
export function pedalOfTune(t: Tune): Array<[number, number]> {
  return expressionUsed(t).ped ? tunePedal(t) : [];
}

/**
 * Pedal "nhả trước — nhấn sau" (legato pedal): lúc thay pedal, chân nhấc lên NGAY khi nốt mới kêu (giảm chấn rơi xuống
 * dây cũ sau một chút — PEDAL_UP_S) rồi đạp lại sau PEDAL_DOWN_S (nốt mới vẫn giữ phím → được bắt lại).
 */
export const PEDAL_UP_S = 0.04;
export const PEDAL_DOWN_S = 0.1;

export interface PlannedNote {
  freq: number;
  /** Giây (đồng hồ AudioContext) */
  when: number;
  dur: number;
  vol: number;
  pedal: boolean;
}

/**
 * Kế hoạch TIẾNG của bài mẫu (hàm thuần — có test): nốt (giây) + các lần đạp pedal [đạp, nhả] (giây).
 * Nốt pedal ngân tới lúc giảm chấn rơi (nhả / thay pedal + PEDAL_UP_S).
 */
export function soundPlan(
  events: DemoEvent[],
  spb: number,
  t0: number,
  pedal: ReadonlyArray<readonly [number, number]> = [],
): { notes: PlannedNote[]; pedals: Array<[number, number]> } {
  const notes: PlannedNote[] = [];
  for (const ev of events)
    for (const n of ev.notes) {
      const dur = (n.len ?? ev.dur * 0.95) * spb + (n.pedal ? PEDAL_UP_S : 0);
      notes.push({ freq: pitchFreq(n.pitch), when: t0 + ev.time * spb, dur, vol: n.vol ?? 1, pedal: !!n.pedal });
    }
  const pedals = pedal.map(([a, b]): [number, number] => [t0 + a * spb + PEDAL_DOWN_S, t0 + b * spb + PEDAL_UP_S]);
  return { notes, pedals };
}

/** Hẹn giờ tiếng theo soundPlan() (bài mẫu, đoán bài…). */
export function playPlan(audio: AudioEngine, plan: ReturnType<typeof soundPlan>, track = true): void {
  for (const [down, up] of plan.pedals) audio.pedal(down, up, track);
  for (const n of plan.notes) void audio.scheduleFreq(n.freq, n.when, n.dur, n.vol, track, n.pedal ? { pedal: true } : {});
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

/**
 * Lớp "thầy đàn mẫu" phủ lên bàn phím (không nhận chạm): mỗi tay MỘT huy hiệu số ngón to (màu tay) trượt tới phím cần đàn
 * và nảy lên khi "nhấn". Đặt đúng chỗ số ngón to của chính phím (fingerMapGeo) và tạm ẩn số đó → không hiện hai số trùng.
 * (2026-10-18 — OWNER: bỏ hình bàn tay hoạt hình.)
 */
export class HandOverlay {
  readonly el: HTMLDivElement;
  private hands: Record<Hand, { box: HTMLDivElement; badge: HTMLDivElement; placed: boolean; at: [Pitch, number] | null; key: HTMLElement | null; timer: number }>;
  /** Kích thước bàn phím (px) — đo bằng ResizeObserver, không đọc bố cục ngay sau khi vừa ghi style */
  private kbW = 0;
  private kbH = 0;
  private ro: ResizeObserver | null = null;

  constructor(private readonly kb: PianoKeyboard) {
    this.el = document.createElement('div');
    this.el.className = 'hand-overlay';
    const mk = (hand: Hand) => {
      const box = document.createElement('div');
      box.className = `hand-pos hand-pos-${hand.toLowerCase()}`;
      const badge = document.createElement('div');
      badge.className = 'ho-badge';
      box.append(badge);
      this.el.append(box);
      return { box, badge, placed: false, at: null as [Pitch, number] | null, key: null as HTMLElement | null, timer: 0 };
    };
    this.hands = { RH: mk('RH'), LH: mk('LH') };
    kb.el.append(this.el);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        this.kbW = this.kb.el.clientWidth;
        this.kbH = this.kb.el.clientHeight;
        // Xoay màn hình giữa chừng: đặt lại số ngón đang hiện theo kích thước mới
        for (const hand of ['RH', 'LH'] as Hand[]) {
          const h = this.hands[hand];
          if (h.placed && h.at) this.place(hand, h.at[0], h.at[1], true);
        }
      });
      this.ro.observe(kb.el);
    }
  }

  /** Đặt số ngón `finger` lên phím `pitch`. */
  place(hand: Hand, pitch: Pitch, finger: number, instant = false): void {
    const g = this.kb.keyCenter(pitch);
    if (!g) return;
    const h = this.hands[hand];
    if (!this.kbW) {
      // Chưa có số đo (lần đầu, trước khi ResizeObserver báo) → đọc một lần
      this.kbW = this.kb.el.clientWidth;
      this.kbH = this.kb.el.clientHeight;
    }
    const kbW = this.kbW || 1000;
    const kbH = this.kbH || 300;
    h.box.classList.toggle('instant', instant || !h.placed);
    // Trượt bằng transform (GPU) thay cho left/top (mỗi khung hình chuyển động phải tính lại bố cục)
    h.box.style.transform = `translate3d(${((g.center * kbW) / 100).toFixed(1)}px,${badgeY(kbH, g.black).toFixed(1)}px,0)`;
    h.badge.textContent = String(finger);
    h.at = [pitch, finger];
    h.placed = true;
    h.box.classList.add('show');
    // số to của chính phím tạm ẩn (đã có số ngón của thầy đúng chỗ đó)
    h.key?.classList.remove('fm-own');
    h.key = this.kb.el.querySelector<HTMLElement>(`.key[data-pitch="${pitch}"]`);
    h.key?.classList.add('fm-own');
    // (+ 2026-10-15) bản đồ ngón (keyboardHand.ts) ẩn khi thầy đàn mẫu đang hiện
    this.kb.el.classList.add('demo-hand-on');
  }

  press(hand: Hand, _finger: number, ms: number): void {
    const h = this.hands[hand];
    window.clearTimeout(h.timer);
    h.box.classList.remove('press');
    void h.box.offsetWidth; // chạy lại hiệu ứng nảy
    h.box.classList.add('press');
    h.timer = window.setTimeout(() => h.box.classList.remove('press'), ms);
  }

  release(hand: Hand): void {
    const h = this.hands[hand];
    window.clearTimeout(h.timer);
    h.box.classList.remove('press');
  }

  hide(): void {
    for (const h of Object.values(this.hands)) {
      window.clearTimeout(h.timer);
      h.box.classList.remove('show', 'press');
      h.key?.classList.remove('fm-own');
      h.key = null;
      h.placed = false;
    }
    this.kb.el.classList.remove('demo-hand-on');
  }

  setGhost(on: boolean): void {
    this.el.classList.toggle('ghost', on);
  }

  destroy(): void {
    this.ro?.disconnect();
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
  /** (+ 2026-10-12) Cấp 4 — các khoảng pedal đạp (phách, xem pedalOfTune) */
  pedal?: ReadonlyArray<readonly [number, number]>;
  /**
   * (+ 2026-10-15) Ai đàn mẫu: 'ghost' (mặc định) = bản đồ ngón trên bàn phím đàn cả bài (demoHands.ts);
   * 'teacher' = lớp số ngón đơn giản (HandOverlay).
   */
  hand?: 'ghost' | 'teacher';
  /** (+ 2026-10-15) Giờ bắt đầu (đồng hồ AudioContext) — mặc định now + 0.35 s (để nhạc đệm hẹn cùng mốc) */
  t0?: number;
}

/** Hình vẽ ra màn hình chậm hơn lệnh vẽ khoảng một khung hình → số ngón đi trước chừng ấy để khớp tiếng */
export const FRAME_LEAD_S = 1 / 60;

/** Giờ "đang nghe thấy" theo đồng hồ âm thanh: currentTime − độ trễ ra loa + một khung hình. */
export function heardClock(audio: Pick<AudioEngine, 'now'> & { outputLatency?: number }): number {
  return audio.now() - (audio.outputLatency || 0) + FRAME_LEAD_S;
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
  let finished = false;
  const timers: number[] = [];
  const spb = 60 / (o.bpm ?? 60);
  const t0 = o.t0 ?? audio.now() + 0.35;
  const wall0 = performance.now() + (t0 - audio.now()) * 1000;
  const plan = soundPlan(events, spb, t0, o.pedal);
  if (o.sound !== false) playPlan(audio, plan);
  const end = events.length ? Math.max(...events.map((e) => e.time + e.dur)) : 0;
  const endT = t0 + end * spb;
  const ghost = o.hand !== 'teacher';
  let hands: { tick(t: number): void; stop(): void } | null = null;
  let raf = 0;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => (resolveDone = resolve));

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    timers.forEach((t) => window.clearTimeout(t));
    hands?.stop();
    overlay.release('RH');
    overlay.release('LH');
    resolveDone();
  };

  /** Đường dự phòng: số ngón của thầy (HandOverlay) + phím sáng hẹn bằng setTimeout. */
  const teacher = () => {
    for (const hand of ['RH', 'LH'] as Hand[]) {
      const first = events.flatMap((e) => e.notes).find((n) => n.hand === hand && n.finger);
      if (first) overlay.place(hand, first.pitch, first.finger!, true);
    }
    for (const ev of events) {
      const at = ev.time * spb * 1000;
      // Ngắt tiếng: phím sáng / ngón nhấn ngắn theo đúng độ dài kêu
      const lenOf = (n: DemoNote) => Math.min(ev.dur * 0.9, n.key ?? n.len ?? ev.dur);
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
  };

  // MỘT vòng rAF: bản đồ ngón đàn mẫu + con trỏ khuông nhạc theo đồng hồ âm thanh; hết bài → xong
  const loop = () => {
    if (cancelled || finished) return;
    const t = heardClock(audio);
    hands?.tick(t);
    o.onBeat?.((t - t0) / spb);
    if (ghost && t > endT + 0.4) return finish();
    raf = requestAnimationFrame(loop);
  };
  if (ghost || o.onBeat) raf = requestAnimationFrame(loop);

  if (ghost) {
    void import('./demoHands')
      .then((m) => {
        if (cancelled || finished) return;
        hands = m.startDemoHands(kb, events, plan, spb, { onCaption: o.onCaption });
        hands.tick(heardClock(audio));
      })
      .catch(() => {
        if (!cancelled && !finished) teacher(); // không nạp được → lớp số ngón đơn giản
      });
  } else teacher();

  // Dự phòng (tab ẩn → rAF dừng): vẫn xong theo đồng hồ tường
  timers.push(window.setTimeout(finish, Math.max(0, wall0 - performance.now() + end * spb * 1000 + (ghost ? 1500 : 400))));
  return {
    done,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf);
      audio.stopAll();
      hands?.stop();
      hands = null;
      overlay.hide();
      kb.clear();
      finished = true;
      resolveDone();
    },
  };
}
