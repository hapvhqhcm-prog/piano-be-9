/**
 * GIỌNG ĐỌC HƯỚNG DẪN (tiếng Việt) — bọc speechSynthesis của trình duyệt.
 * - Bé 9 tuổi đọc chậm → các câu hướng dẫn ngắn được đọc to (Linh / HoaiMy… tùy máy).
 * - Không có giọng vi-VN, trình duyệt không hỗ trợ, hoặc phụ huynh tắt "Giọng đọc hướng dẫn" → im lặng (no-op).
 * - iOS: lần nói đầu tiên phải nằm trong một thao tác chạm → tự "mở khóa" ở lần chạm đầu tiên.
 * - Không đọc chồng lên tiếng đàn của app (chờ app im rồi mới đọc).
 * - MICRO KHÔNG TỰ BỎ QUA giọng đọc (chỉ bỏ qua âm của AudioEngine) → màn nghe đàn phải hỏi
 *   speechBusy() và bỏ qua nốt nghe được trong lúc / ngay sau khi đọc.
 */

/** Phần tối thiểu của App mà giọng đọc cần (tránh phụ thuộc vòng). */
export interface VoiceHost {
  store: { settings: { voice?: boolean } };
  audio: { isSounding: boolean; whenIdle(): Promise<void> };
}

/** Bỏ qua tiếng micro thêm bao lâu sau khi đọc xong (tiếng vang trong phòng). */
export const SPEECH_TAIL_MS = 450;

const synth = (): SpeechSynthesis | null =>
  typeof globalThis !== 'undefined' && 'speechSynthesis' in globalThis ? globalThis.speechSynthesis : null;

let viVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;
let speaking = false;
let lastEnd = 0;
let gen = 0;
let unlocked = false;

/** Ưu tiên giọng tự nhiên, nghe dễ chịu cho trẻ. */
const PREFERRED = ['linh', 'hoaimy', 'hoai my', 'an', 'namminh', 'google'];

function pickVoice(): void {
  const s = synth();
  if (!s) return;
  const all = s.getVoices();
  if (all.length) voicesLoaded = true;
  const vi = all.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('vi'));
  if (!vi.length) {
    viVoice = null;
    return;
  }
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    const i = PREFERRED.findIndex((p) => n.includes(p));
    return (i < 0 ? 50 : i) + (v.localService ? 0 : 5);
  };
  viVoice = [...vi].sort((a, b) => score(a) - score(b))[0];
}

function init(): void {
  const s = synth();
  if (!s) return;
  pickVoice();
  try {
    s.addEventListener('voiceschanged', pickVoice);
  } catch {
    /* Safari cũ: không có addEventListener trên speechSynthesis */
    (s as unknown as { onvoiceschanged: () => void }).onvoiceschanged = pickVoice;
  }
  // iOS: phải có một lần speak() trong thao tác chạm thì các lần sau (tự động) mới kêu
  if (typeof document !== 'undefined') {
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        if (viVoice) u.voice = viVoice;
        s.speak(u);
      } catch {
        /* bỏ qua */
      }
      pickVoice();
      document.removeEventListener('pointerdown', unlock, true);
    };
    document.addEventListener('pointerdown', unlock, true);
  }
}
init();

/** Trình duyệt có giọng tiếng Việt (true khi chưa nạp xong danh sách giọng — để nút 🔊 không chớp tắt). */
export function voiceSupported(): boolean {
  return !!synth() && (viVoice !== null || !voicesLoaded);
}

/** Đã tìm thấy giọng vi-VN. */
export function hasVietnameseVoice(): boolean {
  return viVoice !== null;
}

/** Đang đọc, hoặc vừa đọc xong chưa lâu (micro phải bỏ qua). */
export function speechBusy(tailMs = SPEECH_TAIL_MS): boolean {
  return speaking || Date.now() - lastEnd < tailMs;
}

/** Bỏ emoji / ký hiệu để máy không đọc "mặt cười", "mũi tên"… */
export function speakable(text: string): string {
  return text
    // Số chỉ nhịp đọc như nhạc sĩ đọc ("nhịp 2/4" → "nhịp hai bốn"), không để máy đọc thành ngày tháng
    .replace(/\b([234])\/4\b/g, (_m, a: string) => `${({ '2': 'hai', '3': 'ba', '4': 'bốn' } as Record<string, string>)[a]} bốn`)
    // Phân số còn lại ("đúng 5/6") → "5 trên 6"
    .replace(/\b(\d+)\/(\d+)\b/g, '$1 trên $2')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[←→▶↻✓★⬆⬇]/g, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*\/\s*[A-G][♯♭#b]?(?=$|[\s,.!?)])/g, '') // "Đô / C" → "Đô"
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

/** Dừng câu đang đọc (vd khi rời màn hình). */
export function cancelSpeech(): void {
  gen++;
  const s = synth();
  if (speaking) lastEnd = Date.now();
  speaking = false;
  try {
    // Safari: cancel() khi đang rảnh có thể làm câu nói ngay sau bị nuốt → chỉ hủy khi thật sự đang đọc
    if (s && (s.speaking || s.pending)) s.cancel();
  } catch {
    /* bỏ qua */
  }
}

/** Phụ huynh bật giọng đọc (mặc định bật) và máy có giọng tiếng Việt. */
export function voiceOn(host: VoiceHost): boolean {
  return host.store.settings.voice !== false && voiceSupported();
}

/**
 * Đọc to `text`. Hủy câu trước đó. Chờ app im tiếng đàn rồi mới đọc.
 * Promise luôn resolve (đọc xong / bị hủy / lỗi / không có giọng) — không bao giờ treo.
 */
export async function speak(host: VoiceHost, text: string): Promise<void> {
  const s = synth();
  const line = speakable(text);
  if (!s || !line || host.store.settings.voice === false) return;
  if (!viVoice) pickVoice();
  if (!viVoice) return;
  cancelSpeech();
  const my = ++gen;
  if (host.audio.isSounding) {
    await host.audio.whenIdle();
    await new Promise((r) => setTimeout(r, 150));
    if (my !== gen) return;
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(guard);
      if (my === gen) {
        speaking = false;
        lastEnd = Date.now();
      }
      resolve();
    };
    // iOS đôi khi không gọi onend → tự kết thúc sau thời gian ước tính
    const guard = window.setTimeout(finish, 2500 + line.length * 110);
    try {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = 'vi-VN';
      u.voice = viVoice;
      u.rate = 0.95;
      u.pitch = 1.05;
      u.onend = finish;
      u.onerror = finish;
      speaking = true;
      s.speak(u);
    } catch {
      finish();
    }
  });
}
