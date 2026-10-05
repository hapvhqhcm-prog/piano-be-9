import { hasVietnameseVoice, speak, voiceOn, type VoiceHost } from '../../audio/voice';
import { h, toast } from './dom';

/**
 * Nút nhỏ 🔊 cạnh câu hướng dẫn: chạm để nghe đọc lại (bé đọc chậm).
 * Không hiện khi phụ huynh tắt "Giọng đọc hướng dẫn" hoặc máy không có giọng tiếng Việt.
 * `text` có thể là hàm — để đọc đúng câu đang hiện (vd lời nhắc micro thay đổi liên tục).
 */
export function speakChip(
  host: VoiceHost,
  text: string | (() => string),
  opts: { onSpoken?: () => void; label?: string } = {},
): HTMLButtonElement | null {
  if (!voiceOn(host)) return null;
  const b = h(
    'button',
    { class: 'speak-chip', type: 'button', 'aria-label': opts.label ?? 'Nghe đọc lại' },
    h('span', { 'aria-hidden': 'true' }, '🔊'),
  );
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!hasVietnameseVoice()) return toast('iPad chưa có giọng đọc tiếng Việt');
    b.classList.add('on');
    void speak(host, typeof text === 'function' ? text() : text).then(() => {
      b.classList.remove('on');
      opts.onSpoken?.();
    });
  });
  return b;
}
