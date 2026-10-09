import { describe, expect, it } from 'vitest';
import { WEEKS } from '../src/lessons/lessonEngine';
import { SONGS, allTimed, validateTune, type Tune } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';
import { songEmoji } from '../src/ui/components/songArt';
import lic from '../LICENSES.md?raw';
import { LIBRARY_2026_10_09 as IDS, LIBRARY_2026_10_09_PD as PD } from './fixtures/library20261009';

/**
 * (2026-10-09, OWNER duyệt "Thêm bài hát") — 24 bài mới CHỈ ĐỂ TRONG THƯ VIỆN, rải Cấp 1–3.
 * Kiểm: hợp lệ, đúng cổng tuần (chỉ dùng kỹ năng đã dạy), ngón tay, không trùng bài cũ, có mục LICENSES, có emoji.
 */
const NEW = IDS.map((id) => SONGS.find((s) => s.id === id)!);
const OLD = SONGS.filter((s) => !IDS.includes(s.id));
const ORIG = 'Bài tự sáng tác cho app (piano-be-9)';
const voices = (t: Tune) => [t.notes, ...(t.lh ? [t.lh] : [])];
const pitchesOf = (t: Tune) =>
  voices(t).flatMap((v) => v.flatMap((n) => (n.rest ? [] : [n.pitch!, ...(n.also ?? []).map((a) => a.pitch)])));

describe('Thư viện bổ sung 2026-10-09', () => {
  it('đủ 24 bài, id không trùng, tuần 3–28 (Cấp 1–3; Cấp 4 chỉ dùng bài trong bài học), không có trong bài học nào', () => {
    expect(IDS).toHaveLength(24);
    expect(new Set(IDS).size).toBe(24);
    for (const [i, t] of NEW.entries()) expect(t, IDS[i]).toBeDefined();
    const used = new Set(WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])))));
    for (const t of NEW) {
      expect(t.week, t.id).toBeGreaterThanOrEqual(3);
      expect(t.week, t.id).toBeLessThanOrEqual(28);
      expect(used.has(t.id), t.id).toBe(false);
      expect(validateTune(t), t.id).toEqual([]);
    }
    // Cấp 1 / 2 / 3 đều có bài mới
    expect(NEW.filter((t) => t.week! <= 10).length).toBeGreaterThanOrEqual(8);
    expect(NEW.filter((t) => t.week! >= 11 && t.week! <= 21).length).toBeGreaterThanOrEqual(6);
    expect(NEW.filter((t) => t.week! >= 22).length).toBeGreaterThanOrEqual(5);
  });

  it('bé đang ở tuần 4: ≥ 6 bài mới đàn được ở tuần 3–6 — một tay phải, thế Đô (Đô–Sol)', () => {
    const early = NEW.filter((t) => t.week! >= 3 && t.week! <= 6);
    expect(early.length).toBeGreaterThanOrEqual(6);
    for (const t of early) {
      expect(t.hand, t.id).toBe('RH');
      expect(t.position ?? 'C', t.id).toBe('C');
      for (const p of pitchesOf(t)) expect(['C4', 'D4', 'E4', 'F4', 'G4'], `${t.id} ${p}`).toContain(p);
    }
  });

  it('mỗi bài chỉ dùng kỹ năng đã dạy tới tuần của bài', () => {
    for (const t of NEW) {
      const w = t.week!;
      const all = voices(t).flat();
      const notes = all.filter((n) => !n.rest);
      const gate = (cond: boolean, from: number, what: string) => {
        if (cond) expect(w, `${t.id}: ${what} chỉ từ tuần ${from}`).toBeGreaterThanOrEqual(from);
      };
      gate(notes.some((n) => n.beats < 1 && n.beats >= 0.5), 4, 'móc đơn');
      gate(all.some((n) => n.rest), 4, 'dấu lặng');
      gate(notes.some((n) => n.beats === 3), 6, 'nốt trắng chấm');
      gate(notes.some((n) => n.dyn) || all.some((n) => n.dyn), 6, 'p / mf / f');
      gate(notes.some((n) => n.slur), 6, 'dấu luyến');
      gate(t.hand === 'LH', 7, 'tay trái');
      gate(pitchesOf(t).includes('A4'), 8, 'La (A4)');
      gate(t.timeSignature === '2/4', 9, 'nhịp 2/4');
      gate(pitchesOf(t).includes('B4'), 10, 'Si (B4)');
      gate(t.timeSignature === '3/4', 11, 'nhịp 3/4');
      gate(t.hand === 'BOTH', 11, 'hai tay');
      gate(notes.some((n) => n.stac), 12, 'ngắt');
      gate(t.position === 'G', 14, 'thế Sol');
      gate(pitchesOf(t).some((p) => p.length > 2), 16, 'phím đen');
      gate(notes.some((n) => n.beats === 1.5), 17, 'đen chấm dôi');
      gate(notes.some((n) => n.beats < 0.5), 18, 'móc kép');
      gate(!!t.lh && t.lh.some((n) => !n.rest && n.also), 22, 'hợp âm tay trái');
      gate(t.hand !== 'LH' && t.notes.some((n) => !n.rest && pitchToMidi(n.pitch!) < pitchToMidi('C4')), 23, 'nốt dòng kẻ phụ dưới (tay phải)');
      gate(t.position === 'C5', 26, 'thế Đô cao');
      expect(t.timeSignature, t.id).not.toBe('6/8');
      for (const n of all) expect(n.ped ?? n.hairpin ?? n.rit, t.id).toBeUndefined();
      expect(t.tempoTerm, t.id).toBeUndefined();
    }
  });

  it('ngón tay: 1–5, hai nốt liền nhau cùng ngón khác phím chỉ khi có thời gian dời tay; bước nhảy ≤ quãng 8', () => {
    for (const t of NEW) {
      for (const hand of ['RH', 'LH'] as const) {
        const ns = allTimed(t).filter((n) => !n.rest && n.pitch && n.hand === hand);
        for (const n of ns) {
          expect(n.finger, `${t.id} ${hand}`).toBeGreaterThanOrEqual(1);
          expect(n.finger, `${t.id} ${hand}`).toBeLessThanOrEqual(5);
        }
        for (let i = 1; i < ns.length; i++) {
          const a = ns[i - 1];
          const b = ns[i];
          const dp = pitchToMidi(b.pitch!) - pitchToMidi(a.pitch!);
          expect(Math.abs(dp), `${t.id} ${hand} ô ${b.measure + 1}`).toBeLessThanOrEqual(12);
          const relaxed = b.start - (a.start + a.beats) > 1e-9 || a.beats >= 2;
          if (dp !== 0 && a.finger === b.finger && !a.also && !b.also)
            expect(relaxed, `${t.id} ${hand} ô ${b.measure + 1}: ngón ${a.finger} ${a.pitch}→${b.pitch}`).toBe(true);
        }
      }
    }
  });

  it('không trùng bài cũ: tên khác, giai điệu (8 quãng đầu, bỏ giọng) khác mọi bài cũ', () => {
    const titles = new Set(OLD.flatMap((s) => [s.title.toLowerCase(), s.titleVi.toLowerCase()]));
    const shape = (t: Tune) => {
      const ms = allTimed(t)
        .filter((n) => !n.rest && n.pitch)
        .sort((a, b) => a.start - b.start)
        .map((n) => pitchToMidi(n.pitch!));
      return ms.slice(1, 9).map((m, i) => m - ms[i]).join(',');
    };
    const oldShapes = new Map(OLD.map((s) => [shape(s), s.id]));
    for (const t of NEW) {
      expect(titles.has(t.title.toLowerCase()), t.id).toBe(false);
      expect(titles.has(t.titleVi.toLowerCase()), t.id).toBe(false);
      expect(oldShapes.get(shape(t)), `${t.id} trùng giai điệu`).toBeUndefined();
    }
    // Trong đợt mới: chỉ "Vịt con bơi hồ" có hai bản (một tay / hai tay)
    const fam = (id: string) => id.replace(/_(swim|both)$/, '');
    for (const a of NEW) for (const b of NEW) if (a.id < b.id && fam(a.id) !== fam(b.id)) expect(shape(a), `${a.id} ~ ${b.id}`).not.toBe(shape(b));
  });

  it('nguồn gốc: bài tự sáng tác ghi rõ; giai điệu public domain ghi tác giả / xuất xứ; mọi id có trong LICENSES.md', () => {
    for (const t of NEW) {
      expect(lic, t.id).toContain(`\`${t.id}\``);
      expect(t.sourceStatus).toBe('public-domain');
      if (PD.includes(t.id)) {
        expect(t.composer, t.id).not.toBe(ORIG);
        expect(t.arrangementBy, t.id).not.toContain('tự sáng tác');
        expect(t.composer!, t.id).toMatch(/Dân ca|Grieg|Tchaikovsky/);
      } else {
        expect(t.composer, t.id).toBe(ORIG);
        expect(t.arrangementBy, t.id).toContain('tự sáng tác');
      }
      // Đợt này KHÔNG có dân ca Việt Nam (chưa đủ 2 bản ký âm để đối chiếu). Bài Việt Nam sau này phải ghi ≥ 2 nguồn
      // trong LICENSES.md và có đối chiếu từng nốt ở tests/folk-songs.test.ts.
      expect(t.vn, t.id).toBeUndefined();
    }
  });

  it('mỗi bài có emoji riêng trên thẻ Thư viện (không rơi về 🎵)', () => {
    for (const t of NEW) expect(songEmoji(t), t.id).not.toBe('🎵');
  });
});
