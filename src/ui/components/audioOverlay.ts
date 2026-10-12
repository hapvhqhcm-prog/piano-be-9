import type { AudioEngine } from '../../audio/AudioEngine';
import { h } from './dom';

/**
 * Khi AudioContext bị suspended/interrupted (iPad khóa màn hình, chuyển app…)
 * → hiện nút to "Bật lại âm thanh". Chạm = user gesture → resume.
 *
 * (2026-10-12) Thêm: BẤT KỲ lần chạm nào (pha capture, trước mọi nút/phím) cũng thử bật lại âm thanh — bé chạm thẳng
 * vào phím đàn sau cuộc gọi / Siri / chuyển app thì tiếng về ngay, không phải chạm thêm một lần vào nút riêng.
 * Chỉ sau khi app đã "Bắt đầu" (AudioContext có rồi). iOS chỉ coi lúc NHẤC ngón (pointerup/touchend/click) là thao tác
 * người dùng → unlock() đầy đủ ở đó; pointerdown chỉ thử resume() nhẹ (đủ cho trình duyệt khác, vô hại trên iOS).
 */
export function installAudioOverlay(audio: AudioEngine, isStarted: () => boolean): void {
  const btn = h(
    'button',
    { class: 'btn btn-primary btn-big', type: 'button' },
    h('span', { class: 'btn-icon' }, '🔊'),
    h('span', { class: 'btn-label' }, 'Chạm để bật lại âm thanh'),
  );
  const overlay = h('div', { class: 'audio-overlay', hidden: true }, btn);
  document.body.append(overlay);

  const refresh = () => {
    overlay.hidden = !isStarted() || audio.isRunning;
  };
  /** Cần bật lại: đã bắt đầu, có AudioContext, nhưng đang suspended/interrupted (không phải 'closed'). */
  const needsResume = () => {
    const s = audio.state;
    return isStarted() && (s === 'suspended' || s === 'interrupted');
  };
  let pending = false;
  const resumeOnGesture = () => {
    if (pending || !needsResume()) return;
    pending = true;
    audio
      .unlock()
      .catch(() => false)
      .finally(() => {
        pending = false;
        refresh();
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

  btn.addEventListener('click', async () => {
    await audio.unlock();
    refresh();
  });
  audio.onStateChange(refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Quay lại app: thử resume() ngay (iOS thường cho phép sau 'interrupted') — không được thì nút / lần chạm kế tiếp lo.
    if (needsResume()) audio.context?.resume().catch(() => undefined);
    window.setTimeout(refresh, 300);
  });
  window.addEventListener('pageshow', refresh);
  window.setInterval(refresh, 2000);
}
