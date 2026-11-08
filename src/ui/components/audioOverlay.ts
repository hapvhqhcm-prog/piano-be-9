import type { AudioEngine } from '../../audio/AudioEngine';
import { AudioResumeWatch } from '../audioResume';
import { h } from './dom';

/**
 * Âm thanh bị iPad ngắt (giọng đọc, micro, cuộc gọi, khóa màn hình, chuyển app…) → TỰ bật lại, không làm phiền bé.
 *
 * (2026-11-08, OWNER: "cứ nói chạm lại để bật âm thanh hoài, học cứ bị gián đoạn") Bỏ màn che toàn màn hình.
 * Tự thử bật lại vài lần (ui/audioResume.ts); chỉ khi dừng lâu mà không bật được mới hiện nút NHỎ ở góc trên.
 *
 * (2026-10-12) BẤT KỲ lần chạm nào (pha capture, trước mọi nút/phím) cũng thử bật lại âm thanh — bé chạm thẳng
 * vào phím đàn thì tiếng về ngay. iOS chỉ coi lúc NHẤC ngón (pointerup/touchend/click) là thao tác người dùng →
 * unlock() đầy đủ ở đó; pointerdown chỉ thử resume() nhẹ.
 */
export function installAudioOverlay(audio: AudioEngine, isStarted: () => boolean): AudioResumeWatch {
  const btn = h(
    'button',
    { class: 'audio-chip', type: 'button', 'data-test': 'audio-chip', 'aria-label': 'Bật lại âm thanh' },
    '🔇 Chạm để có tiếng',
  );
  btn.hidden = true;
  document.body.append(btn);

  /** Cần bật lại: đã bắt đầu, có AudioContext, nhưng đang suspended/interrupted (không phải 'closed'). */
  const needsResume = () => {
    const s = audio.state;
    return isStarted() && (s === 'suspended' || s === 'interrupted');
  };
  const watch = new AudioResumeWatch({
    needsResume,
    tryResume: () => void audio.context?.resume().catch(() => undefined),
    speaking: () => {
      try {
        return globalThis.speechSynthesis?.speaking === true;
      } catch {
        return false;
      }
    },
    visible: () => document.visibilityState !== 'hidden',
    now: () => Date.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
    setChip: (show) => {
      btn.hidden = !show;
    },
  });

  let pending = false;
  const resumeOnGesture = () => {
    if (pending || !needsResume()) return;
    pending = true;
    audio
      .unlock()
      .catch(() => false)
      .finally(() => {
        pending = false;
        watch.check();
      });
  };
  const opts = { capture: true, passive: true } as const;
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, resumeOnGesture, opts);
  document.addEventListener(
    'pointerdown',
    () => {
      if (needsResume()) audio.context?.resume().catch(() => undefined);
    },
    opts,
  );

  audio.onStateChange(() => watch.check());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (needsResume()) audio.context?.resume().catch(() => undefined);
    window.setTimeout(() => watch.check(), 300);
  });
  window.addEventListener('pageshow', () => watch.check());
  window.setInterval(() => watch.check(), 2000);
  return watch;
}
