import { describe, expect, it } from 'vitest';
import { SONG_CHECKS, SONG_CHECKS_WAIT } from '../src/ui/components/parentCheck';
import { hardestPhrase, shortIntro } from '../src/ui/screens/song';

describe('v5.1 giao diện bài hát', () => {
  it('phiếu chấm chế độ chờ chỉ 2 ý (không "Đều nhịp"); theo nhịp giữ 3 ý', () => {
    expect(SONG_CHECKS_WAIT.map((c) => c.key)).toEqual(['notes', 'fingers']);
    expect(SONG_CHECKS.map((c) => c.key)).toEqual(['notes', 'beat', 'fingers']);
  });

  it('lời dẫn: ngắn giữ nguyên; dài → câu đầu hoặc cắt "…" (≤ 61 ký tự)', () => {
    expect(shortIntro('Đoạn nhạc mới toanh — đọc rồi đàn nhé!')).toBe('Đoạn nhạc mới toanh — đọc rồi đàn nhé!');
    const long =
      'Nốt mới La ở ngay bên phải Sol. Khi Sol và La đi cùng nhau, bàn tay NHÍCH sang phải một phím: ngón 4 đánh Sol, ngón 5 đánh La.';
    expect(shortIntro(long)).toBe('Nốt mới La ở ngay bên phải Sol.');
    const noStop =
      'NGẮT (dấu chấm trên nốt) chạm rồi nhấc ngón lên ngay như quả bóng nảy và LIỀN thì giữ nốt tới khi nốt sau vang lên';
    const s = shortIntro(noStop);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(61);
  });

  it('câu khó = câu có nhiều lỗi nhất; không lỗi / một câu → null', () => {
    const ranges: Array<[number, number]> = [
      [0, 4],
      [4, 8],
      [8, 12],
    ];
    expect(hardestPhrase(ranges, new Map())).toBeNull();
    expect(hardestPhrase([[0, 4]], new Map([[1, 3]]))).toBeNull();
    const r = hardestPhrase(
      ranges,
      new Map([
        [1, 1],
        [5, 2],
        [6, 1],
        [9, 2],
      ]),
    );
    expect(r).toEqual({ range: [4, 8], index: 1, misses: 3 });
  });
});

describe('v5.1 màn chính: mục tiêu của bé gọn một dòng', () => {
  it('bỏ cụm "2 hôm" (đã có chấm ●○), giữ emoji và phần còn lại', async () => {
    const { stripKidDays } = await import('../src/ui/screens/home');
    expect(stripKidDays('Đàn Ếch con nhảy thật đều — 2 hôm nhé! 🐸')).toBe('Đàn Ếch con nhảy thật đều 🐸');
    expect(stripKidDays('Tay phải hỏi, tay trái đáp — trọn bài 2 hôm nhé! 💬')).toBe('Tay phải hỏi, tay trái đáp — trọn bài 💬');
    expect(stripKidDays('Đọc 5 đoạn nhạc mới toanh — trong 2 hôm nhé! 🏛️')).toBe('Đọc 5 đoạn nhạc mới toanh 🏛️');
    expect(stripKidDays('Các thánh tiến bước — hai tay theo nhịp, 2 hôm nhé! 🎺')).toBe('Các thánh tiến bước — hai tay theo nhịp 🎺');
    expect(stripKidDays('Qua Cầu Vạch Phụ: đọc đúng 8 nốt trong 10 — 2 hôm, thêm một bài đọc nhạc nhé! 🌁')).toBe(
      'Qua Cầu Vạch Phụ: đọc đúng 8 nốt trong 10, thêm một bài đọc nhạc nhé! 🌁',
    );
    expect(stripKidDays('Đại hòa nhạc — nhận huy chương vàng! 🎆')).toBe('Đại hòa nhạc — nhận huy chương vàng! 🎆');
  });
});
