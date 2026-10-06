import { describe, expect, it } from 'vitest';
import { parseSolfege, parseToken, splitJoined, stripSeparatorCommas } from '../src/music/solfege';

const P = (text: string, bpb = 4) => parseSolfege(text, bpb);
const notesOf = (text: string, bpb = 4) => P(text, bpb).notes.map((n) => (n.rest ? `_${n.beats}` : `${n.pitch}${n.beats === 1 ? '' : `x${n.beats}`}`));
const msgs = (xs: { message: string }[]) => xs.map((x) => x.message).join(' | ');

describe('Gõ chữ dễ tính — gạch / gạch chéo nối tên nốt', () => {
  it('"Đô-Rê-Mi-Đô" → bốn nốt 1 phách + thông báo (không lỗi)', () => {
    const r = P('Đô-Rê-Mi-Đô Đô-Rê-Mi-Đô');
    expect(r.errors).toEqual([]);
    expect(notesOf('Đô-Rê-Mi-Đô')).toEqual(['C4', 'D4', 'E4', 'C4']);
    const j = r.notices.filter((n) => n.message.includes('nối hai tên nốt'));
    expect(j).toHaveLength(1);
    expect(j[0].message).toContain('“Đô Rê Mi Đô”');
    expect(j[0].message).toContain('và 1 chỗ nữa');
  });
  it('"Mi-" hậu tố vẫn là 2 phách; "Mi-Fa-Sol-" = Mi Fa Sol-; "Sol/La/" = hậu tố từng nốt', () => {
    expect(notesOf('Mi- Rê')).toEqual(['E4x2', 'D4']);
    expect(notesOf('Mi-Fa-Sol-')).toEqual(['E4', 'F4', 'G4x2']);
    expect(notesOf('Sol/La/Sol/Fa/')).toEqual(['G4x0.5', 'A4x0.5', 'G4x0.5', 'F4x0.5']);
    expect(notesOf('Mi--Rê')).toEqual(['E4x2', 'D4']); // một gạch là dấu ngăn, phần còn lại là hậu tố
    expect(splitJoined('Sol,/.')).toEqual({ parts: ['Sol,/.'], joined: false });
    expect(splitJoined('Mi-')).toEqual({ parts: ['Mi-'], joined: false });
  });
  it('"/" hoặc "-" đứng riêng (kiểu sách bài hát) → bỏ qua + thông báo', () => {
    const r = P('do re mi do / do re mi do / mi fa sol');
    expect(r.errors).toEqual([]);
    expect(r.notes).toHaveLength(11);
    expect(msgs(r.notices)).toContain('đứng riêng');
    expect(msgs(r.notices)).toContain('2 chỗ');
  });
});

describe('Gõ chữ dễ tính — dấu chấm hết câu', () => {
  it('"Đô." cuối dòng / giữa câu như dấu chấm → bỏ qua + thông báo', () => {
    const r = P('Đô Rê Mi Đô. Mi Fa Sol.');
    expect(r.notes.map((n) => n.beats)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(r.warnings).toEqual([]);
    expect(msgs(r.notices)).toContain('chấm hết câu');
    expect(notesOf('Đô Rê Mi Đô. Đô Rê Mi Đô. Mi Fa Sol-.')).toEqual(['C4', 'D4', 'E4', 'C4', 'C4', 'D4', 'E4', 'C4', 'E4', 'F4', 'G4x2']);
  });
  it('chấm dôi thật vẫn giữ: Sol. La/ · nốt trắng chấm cuối bài 3/4 · Sol,/.', () => {
    expect(notesOf('Sol. La/ Sol Fa Mi')).toEqual(['G4x1.5', 'A4x0.5', 'G4', 'F4', 'E4']);
    expect(P('Sol. La/ Sol Fa Mi').notices).toEqual([]);
    expect(notesOf('Mi Rê Đô | Đô-.', 3)).toEqual(['E4', 'D4', 'C4', 'C4x3']);
    expect(P('Sol,/. Sol,// | La, Sol, Đô', 3).notes[0].beats).toBe(0.75);
    expect(notesOf('Mi. Mi. Mi | Đô-')).toEqual(['E4x1.5', 'E4x1.5', 'E4', 'C4x2']); // nhịp 3+3+2
  });
});

describe('Gõ chữ dễ tính — dấu phẩy ngăn cách', () => {
  it('"Đô, Rê, Mi" → lỗi chặn lưu + sửa một chạm', () => {
    const r = P('Đô, Rê, Mi, Đô, Đô, Rê, Mi, Đô');
    const e = r.errors.find((x) => x.fix === 'commas');
    expect(e).toBeTruthy();
    expect(e!.line).toBe(1);
    const fixed = stripSeparatorCommas('Đô, Rê, Mi, Đô,\nSol, La, Si,');
    expect(fixed).toBe('Đô Rê Mi Đô\nSol La Si');
    expect(P(fixed).errors).toEqual([]);
    expect(P(fixed).notes.map((n) => n.pitch)).toEqual(['C4', 'D4', 'E4', 'C4', 'G4', 'A4', 'B4']);
  });
  it('nốt thấp thật ("Sol," vài chỗ, "Sol,/") không bị chặn; sửa một chạm chỉ bỏ MỘT dấu phẩy', () => {
    expect(P('Đô Sol, Đô- | Đô Sol, Đô-').errors).toEqual([]);
    expect(stripSeparatorCommas('Sol,, Đô, Sol,/')).toBe('Sol, Đô Sol,/');
  });
});

describe('Gõ chữ dễ tính — thông báo kiểm tra', () => {
  it('mọi nốt 1 phách (≥ 8 nốt) → nhắc Nghe thử', () => {
    expect(msgs(P('Đô Rê Mi Đô Đô Rê Mi Đô Mi Fa Sol').notices)).toContain('Tất cả nốt 1 phách');
    expect(msgs(P('Đô Rê Mi Đô').notices)).not.toContain('Tất cả nốt 1 phách');
    expect(msgs(P('Đô Rê Mi Đô Đô Rê Mi Đô Mi Fa Sol-').notices)).not.toContain('Tất cả nốt 1 phách');
  });
  it('app tự hiểu nhịp lấy đà → thông báo', () => {
    const r = P('Đô Rê Mi | Đô Rê Mi Đô | Fa Sol');
    expect(r.pickupRest).toBe(1);
    expect(msgs(r.notices)).toContain('NHỊP LẤY ĐÀ');
    expect(msgs(P('Đô Rê Mi Fa | Sol- Sol-').notices)).not.toContain('LẤY ĐÀ');
  });
});

describe('Dây nối "~"', () => {
  it('nối hai nốt cùng cao độ → một nốt dài', () => {
    expect(notesOf('Mi-~Mi Rê')).toEqual(['E4x3', 'D4']);
    expect(notesOf('Mi~Mi Rê')).toEqual(['E4x2', 'D4']);
    expect(notesOf('Mi- ~Mi Rê')).toEqual(['E4x3', 'D4']);
    expect(notesOf('Mi- ~ Mi')).toEqual(['E4x3']);
    expect(notesOf('Sol/~Sol/ Mi')).toEqual(['G4', 'E4']);
    expect(P('Mi-~Mi').errors).toEqual([]);
  });
  it('qua xuống dòng cũng nối được', () => {
    expect(notesOf('Đô Rê Mi~\nMi Fa')).toEqual(['C4', 'D4', 'E4x2', 'F4']);
  });
  it('vắt qua vạch nhịp hoặc không ghi được một nốt → giữ hai nốt + thông báo', () => {
    const r = P('Đô Rê Mi Sol- | ~Sol Fa Mi Rê');
    expect(r.notes.map((n) => n.beats)).toEqual([1, 1, 1, 2, 1, 1, 1, 1]);
    expect(msgs(r.notices)).toContain('hai nốt Sol');
    expect(P('Mi---~Mi').notes.map((n) => n.beats)).toEqual([4, 1]); // 5 phách không ghi được
  });
  it('khác cao độ → lỗi; "~" cuối bài → bỏ qua', () => {
    expect(P('Mi~Rê').errors[0].message).toContain('CÙNG cao độ');
    expect(msgs(P('Đô Rê Mi~').notices)).toContain('cuối bài');
  });
  it('"~" không còn là gạch kéo dài', () => {
    expect(parseToken('Mi~')).not.toMatchObject({ beats: 2 });
  });
});

describe('Gợi ý tách nốt quá dài theo đúng tên nốt', () => {
  it('Mi---- → "Mi--- Mi"; Sol,---- → "Sol,--- Sol,"', () => {
    expect(P('Mi----').errors[0].message).toContain('tách thành hai nốt: Mi--- Mi');
    expect(P('Sol,----').errors[0].message).toContain('Sol,--- Sol,');
    expect(P('Đô--.').errors[0].message).toContain('Đô--- Đô/');
  });
});
