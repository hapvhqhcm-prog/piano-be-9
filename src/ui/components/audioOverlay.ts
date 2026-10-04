import type { AudioEngine } from '../../audio/AudioEngine';
import { h } from './dom';

/**
 * Khi AudioContext bị suspended/interrupted (iPad khóa màn hình, chuyển app…)
 * → hiện nút to "Bật lại âm thanh". Chạm = user gesture → resume.
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
  btn.addEventListener('click', async () => {
    await audio.unlock();
    refresh();
  });
  audio.onStateChange(refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') window.setTimeout(refresh, 300);
  });
  window.addEventListener('pageshow', refresh);
  window.setInterval(refresh, 2000);
}
