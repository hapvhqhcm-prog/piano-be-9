import { describe, expect, it } from 'vitest';
import { clipKeysFor, normSentence, splitSentences, voiceKey } from '../src/audio/voiceClips';
import { speakable } from '../src/audio/voice';

describe('Giọng đọc thu sẵn — tách câu & mã câu (khớp scripts/voice-gen.py)', () => {
  it('mã câu giống hệt bản Python', () => {
    // python scripts/voice-gen.py --keys "Giỏi lắm!" "Con đặt ngón một lên nốt Đô." "Fa thăng"
    expect(voiceKey('Giỏi lắm!')).toBe(PY[0]);
    expect(voiceKey('Con đặt ngón một lên nốt Đô.')).toBe(PY[1]);
    expect(voiceKey('Fa thăng')).toBe(PY[2]);
    // chuẩn hóa: NFD / khoảng trắng thừa → cùng mã
    expect(voiceKey('  Giỏi   lắm! '.normalize('NFD'))).toBe(PY[0]);
  });

  it('tách câu sau . ! ? … khi có khoảng trắng; không cắt "2.5" hay dấu ở giữa từ', () => {
    expect(splitSentences('Chào con! Hôm nay học bài mới nhé. Sẵn sàng chưa?')).toEqual(['Chào con!', 'Hôm nay học bài mới nhé.', 'Sẵn sàng chưa?']);
    expect(splitSentences('Tempo 2.5 nhé')).toEqual(['Tempo 2.5 nhé']);
    expect(splitSentences('Ồ!! Hay quá… Tiếp nào')).toEqual(['Ồ!!', 'Hay quá…', 'Tiếp nào']);
    expect(splitSentences('')).toEqual([]);
  });

  it('chỉ dùng giọng thu khi có ĐỦ mọi câu của lời', () => {
    const have = new Set([voiceKey('Chào con!'), voiceKey('Giỏi lắm!')]);
    expect(clipKeysFor('Chào con! Giỏi lắm!', have)).toEqual([voiceKey('Chào con!'), voiceKey('Giỏi lắm!')]);
    expect(clipKeysFor('Chào con! Câu lạ.', have)).toBeNull();
    expect(clipKeysFor('Chào con!', null)).toBeNull();
  });

  it('speakable đọc dấu thăng / giáng thành chữ', () => {
    expect(speakable('Gam Sol trưởng cần Fa♯.')).toBe('Gam Sol trưởng cần Fa thăng.');
    expect(speakable('Si♭ nhé')).toBe('Si giáng nhé');
    expect(speakable('Giáng ♭: xuống phím bên trái.')).toBe('Giáng: xuống phím bên trái.');
    expect(normSentence(' a  b ')).toBe('a b');
  });
});

const PY = ['0eb2e4a1d57f52a3', '041598b2f71c00e0', 'b43a2c762ec7c5bc'];
