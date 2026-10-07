import { describe, expect, it } from 'vitest';
import { speak, speakable, speechBusy, voiceOn } from '../src/audio/voice';

const host = (voice = true) => ({
  store: { settings: { voice } },
  audio: { isSounding: false, whenIdle: () => Promise.resolve() },
});

describe('giọng đọc hướng dẫn', () => {
  it('bỏ emoji / ký hiệu và chữ cái tên nốt trước khi đọc', () => {
    expect(speakable('🎤 Con vừa đàn Rê — tìm Đô nhé')).toBe('Con vừa đàn Rê, tìm Đô nhé');
    expect(speakable('Đô / C')).toBe('Đô');
    expect(speakable('Thám tử Đô 🕵️')).toBe('Thám tử Đô');
    expect(speakable('▶ Học tiếp')).toBe('Học tiếp');
  });

  it('không có speechSynthesis (hoặc phụ huynh tắt) → im lặng, không lỗi, không treo', async () => {
    expect(voiceOn(host())).toBe(false);
    await expect(speak(host(), 'Xin chào')).resolves.toBeUndefined();
    await expect(speak(host(false), 'Xin chào')).resolves.toBeUndefined();
    expect(speechBusy()).toBe(false);
  });
});

import { speakable as sp2 } from '../src/audio/voice';
describe('speakable — số chỉ nhịp & phân số', () => {
  it('đọc nhịp như nhạc sĩ, phân số thành "trên"', () => {
    expect(sp2('Hôm nay học nhịp 2/4 nhé!')).toBe('Hôm nay học nhịp hai bốn nhé!');
    expect(sp2('Điệu valse 3/4')).toBe('Điệu valse ba bốn');
    expect(sp2('Đúng 5/6 câu')).toBe('Đúng 5 trên 6 câu');
  });
});
