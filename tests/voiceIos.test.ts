import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * (2026-10-12) iPad thật: getVoices() trống ở lần gọi đầu, danh sách đến sau qua 'voiceschanged'.
 * Câu đọc đầu tiên phải CHỜ danh sách (không im lặng bỏ câu); không có giọng vi → KHÔNG đọc (không giọng Anh đọc chữ Việt).
 */
type V = { name: string; lang: string; localService: boolean };

function installFakeSynth(voicesLater: V[]) {
  let voices: V[] = [];
  const spoken: Array<{ text: string; voice: V | null; lang: string }> = [];
  const listeners: Array<() => void> = [];
  const synth = {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    addEventListener: (_t: string, f: () => void) => listeners.push(f),
    speak: (u: { text: string; voice: V | null; lang: string; onend?: () => void }) => {
      spoken.push({ text: u.text, voice: u.voice, lang: u.lang });
      setTimeout(() => u.onend?.(), 5);
    },
    cancel: () => undefined,
  };
  class Utt {
    voice: V | null = null;
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    onend?: () => void;
    onerror?: () => void;
    constructor(public text: string) {}
  }
  const g = globalThis as Record<string, unknown>;
  g.speechSynthesis = synth;
  g.SpeechSynthesisUtterance = Utt;
  g.window = globalThis;
  return {
    spoken,
    arrive() {
      voices = voicesLater;
      listeners.forEach((f) => f());
    },
  };
}

const host = { store: { settings: { voice: true } }, audio: { isSounding: false, whenIdle: () => Promise.resolve() } };

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.speechSynthesis;
  delete g.SpeechSynthesisUtterance;
  delete g.window;
  vi.resetModules();
});

describe('giọng đọc trên iPad — danh sách giọng nạp chậm', () => {
  it('danh sách trống lúc đầu → chờ rồi đọc bằng giọng vi-VN', async () => {
    const fake = installFakeSynth([
      { name: 'Samantha', lang: 'en-US', localService: true },
      { name: 'Linh', lang: 'vi-VN', localService: true },
    ]);
    const voice = await import('../src/audio/voice');
    setTimeout(() => fake.arrive(), 250);
    await voice.speak(host, 'Xin chào');
    expect(fake.spoken).toHaveLength(1);
    expect(fake.spoken[0].voice?.name).toBe('Linh');
  });

  it('máy không có giọng vi-VN → im lặng (không đọc bằng giọng tiếng Anh)', async () => {
    const fake = installFakeSynth([{ name: 'Samantha', lang: 'en-US', localService: true }]);
    const voice = await import('../src/audio/voice');
    setTimeout(() => fake.arrive(), 100);
    await voice.speak(host, 'Xin chào');
    expect(fake.spoken).toHaveLength(0);
    expect(voice.hasVietnameseVoice()).toBe(false);
    expect(voice.voiceSupported()).toBe(false);
  });

  it('danh sách không bao giờ đến → hết chờ, không treo, không đọc', async () => {
    const fake = installFakeSynth([]);
    const voice = await import('../src/audio/voice');
    const t0 = Date.now();
    await voice.speak(host, 'Xin chào');
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(fake.spoken).toHaveLength(0);
  });
});
