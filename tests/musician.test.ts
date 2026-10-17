import { describe, expect, it } from 'vitest';
import {
  CHORDS,
  HINT_LISTEN_AT,
  HINT_SHOW_AT,
  POLISH_TRIES,
  SeqJudge,
  accompanyBars,
  byEarPhrase,
  chordFitsBar,
  hasDynamics,
  musicianMinutes,
  polishStep,
  transposeHome,
  transposePitch,
  transposeSource,
  transposeTargets,
  type MusicianActivity,
} from '../src/lessons/musician';
import { WEEKS } from '../src/lessons/lessonEngine';
import { findTune } from '../src/music/exercises';
import { accompaniment, duetPart, playable, slice, timeline, validateDuet, validateTune, type Tune } from '../src/music/tune';
import { pitchToMidi } from '../src/piano/pitchTable';

/**
 * (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) "🎹 Nhạc công nhỏ": dịch giọng, đàn theo tai, đệm hợp âm I – V7,
 * đánh bóng, buổi diễn nhỏ (lessons/musician.ts) + song tấu với thầy (Tune.duet). Phần THUẦN + dữ liệu bài học.
 */
const musicianActs = (): Array<{ week: number; lessonId: string; a: MusicianActivity }> =>
  WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'musician' ? [{ week: w.week, lessonId: l.id, a }] : []))));

describe('dịch giọng', () => {
  it('transposePitch: thế Sol / thế Rê dùng dấu thăng, Fa trưởng dùng Si♭', () => {
    expect(transposePitch('C4', 7)).toBe('G4');
    expect(transposePitch('E4', 7)).toBe('B4');
    expect(transposePitch('E4', 2)).toBe('F#4');
    expect(transposePitch('F4', 5)).toBe('Bb4');
    expect(transposePitch('G4', 5)).toBe('C5');
    expect(pitchToMidi(transposePitch('A4', 5))).toBe(pitchToMidi('A4') + 5);
  });

  it('"Chú cừu" sang thế Sol: cùng SỐ NGÓN, nốt dịch +7; nhà mới ngón cái ở Sol; bản thế Đô cắt đúng 4 ô', () => {
    const task = { type: 'transpose' as const, songId: 'mary_lamb', semitones: 7, keyName: 'thế Sol', measures: 4 };
    const ts = transposeTargets(task);
    expect(ts.slice(0, 7).map((n) => n.pitch)).toEqual(['B4', 'A4', 'G4', 'A4', 'B4', 'B4', 'B4']);
    for (const n of ts) {
      expect(pitchToMidi(n.pitch) - pitchToMidi(n.orig)).toBe(7);
      expect(n.finger, n.orig).toBeDefined();
    }
    expect(ts.map((n) => n.finger)).toEqual(playable(findTune('mary_lamb')!).filter((n) => n.measure < 4).map((n) => n.finger));
    expect(transposeHome(ts)).toBe('G4');
    const src = transposeSource(task)!;
    expect(src.notes.reduce((x, n) => x + n.beats, 0)).toBe(16);
    expect(src.duet).toBeUndefined();
  });

  it('mọi bài dịch giọng trong giáo trình: bài gốc ở thế Đô, có ngón; phím đen chỉ từ tuần 16; có thẻ "Dịch giọng" trước/ở bài đầu', () => {
    const tr = musicianActs().filter((x) => x.a.task.type === 'transpose');
    expect(tr.map((x) => x.week)).toEqual([14, 16, 24, 35]);
    for (const { week, lessonId, a } of tr) {
      if (a.task.type !== 'transpose') continue;
      const t = findTune(a.task.songId)!;
      expect(t.position ?? 'C', lessonId).toBe('C');
      expect(t.week!, lessonId).toBeLessThan(week);
      const ns = transposeTargets(a.task);
      expect(ns.length).toBeGreaterThanOrEqual(8);
      if (ns.some((n) => /[#b]/.test(n.pitch))) expect(week, `${lessonId}: phím đen`).toBeGreaterThanOrEqual(16);
    }
    const card = WEEKS.flatMap((w) => w.lessons).find((l) => l.activities.some((a) => a.kind === 'theory' && a.ids.includes('transpose')))!;
    expect(card.week).toBeLessThanOrEqual(tr[0].week);
  });
});

describe('đàn theo tai', () => {
  it('byEarPhrase: đúng N nốt đầu của bài quen, có trường độ để thầy đàn mẫu', () => {
    const ph = byEarPhrase({ type: 'by-ear', songId: 'hot_cross_buns', count: 6 });
    expect(ph.map((n) => n.pitch)).toEqual(['E4', 'D4', 'C4', 'E4', 'D4', 'C4']);
    expect(ph.map((n) => n.start)).toEqual([0, 1, 2, 4, 5, 6]);
  });

  it('mỗi tháng (≤ 5 tuần một lần) từ tuần 9; bài quen (đã học trước), câu 6–11 nốt', () => {
    const ear = musicianActs().filter((x) => x.a.task.type === 'by-ear');
    const weeks = ear.map((x) => x.week);
    expect(weeks[0]).toBe(9);
    for (let i = 1; i < weeks.length; i++) expect(weeks[i] - weeks[i - 1], `sau tuần ${weeks[i - 1]}`).toBeLessThanOrEqual(5);
    expect(weeks[weeks.length - 1]).toBeGreaterThanOrEqual(40);
    for (const { week, a } of ear) {
      if (a.task.type !== 'by-ear') continue;
      expect(findTune(a.task.songId)!.week!).toBeLessThan(week);
      expect(a.task.count).toBeGreaterThanOrEqual(6);
      expect(a.task.count).toBeLessThanOrEqual(11);
      expect(byEarPhrase(a.task)).toHaveLength(a.task.count);
    }
  });
});

describe('SeqJudge — theo thứ tự, không chấm nhịp, gợi ý tăng dần', () => {
  const notes = ['E4', 'D4', 'C4'].map((p) => ({ pitch: p, orig: p }));
  it('đúng thứ tự → xong; sai KHÔNG bắt làm lại từ đầu', () => {
    const j = new SeqJudge(notes);
    expect(j.feed(pitchToMidi('E4'))).toEqual({ kind: 'ok', index: 0, done: false });
    expect(j.feed(pitchToMidi('F4')).kind).toBe('wrong');
    expect(j.index).toBe(1); // vẫn ở nốt 2
    expect(j.feed(pitchToMidi('D4')).kind).toBe('ok');
    expect(j.feed(pitchToMidi('C4'))).toEqual({ kind: 'ok', index: 2, done: true });
    expect(j.result()).toBe('correct');
  });

  it('gợi ý: cao hơn / thấp hơn → nghe lại (lần 3) → chỉ phím (lần 5, tính "nhờ chỉ phím")', () => {
    const j = new SeqJudge(notes);
    const v1 = j.feed(pitchToMidi('C4'));
    expect(v1.kind === 'wrong' && v1.hint).toBe('up');
    const v2 = j.feed(pitchToMidi('G4'));
    expect(v2.kind === 'wrong' && v2.hint).toBe('down');
    for (let k = 3; k < HINT_LISTEN_AT; k++) j.feed(pitchToMidi('G4'));
    const v3 = j.feed(pitchToMidi('G4'));
    expect(v3.kind === 'wrong' && v3.hint).toBe('listen');
    for (let k = HINT_LISTEN_AT + 1; k < HINT_SHOW_AT; k++) j.feed(pitchToMidi('G4'));
    const v5 = j.feed(pitchToMidi('G4'));
    expect(v5.kind === 'wrong' && v5.hint).toBe('show');
    for (const p of ['E4', 'D4', 'C4']) j.feed(pitchToMidi(p));
    expect(j.done).toBe(true);
    expect(j.result()).toBe('retry');
  });

  it('đàn theo tai: cùng tên nốt ở quãng 8 khác cũng đúng; nốt quá xa (giọng nói…) bị bỏ qua', () => {
    const j = new SeqJudge(notes, true);
    expect(j.feed(pitchToMidi('E5')).kind).toBe('ok');
    expect(j.feed(pitchToMidi('F#7')).kind).toBe('ignore');
    const strict = new SeqJudge(notes);
    expect(strict.feed(pitchToMidi('E5')).kind).toBe('wrong');
  });
});

describe('đệm hợp âm I – V7 / I – IV – V7', () => {
  it('hợp âm tay trái thế Đô giản lược: V7 = Si – Fa – Sol (ngón 5 – 2 – 1)', () => {
    expect(CHORDS.V7.pitches).toEqual(['B2', 'F3', 'G3']);
    expect(CHORDS.V7.fingers).toEqual([5, 2, 1]);
    expect(CHORDS.I.pitches).toEqual(['C3', 'E3', 'G3']);
  });

  it('mọi bài đệm trong giáo trình: hợp âm HỢP giai điệu từng ô; V7 từ tuần 24 (có thẻ "V7" trước/ở bài đầu), IV từ tuần 29', () => {
    const acc = musicianActs().filter((x) => x.a.task.type === 'accompany');
    expect(acc.map((x) => x.week)).toEqual([24, 29, 37]);
    const v7card = WEEKS.flatMap((w) => w.lessons).find((l) => l.activities.some((a) => a.kind === 'theory' && a.ids.includes('dominant-7')))!;
    for (const { week, lessonId, a } of acc) {
      if (a.task.type !== 'accompany') continue;
      const bars = accompanyBars(a.task);
      expect(bars).toHaveLength(a.task.chords.length);
      a.task.chords.forEach((c, i) => expect(chordFitsBar(c, bars[i]), `${lessonId} ô ${i + 1}: ${c}`).toBe(true));
      if (a.task.chords.includes('V7')) expect(week).toBeGreaterThanOrEqual(v7card.week);
      if (a.task.chords.includes('IV')) expect(week).toBeGreaterThanOrEqual(29);
      expect(findTune(a.task.songId)!.week!).toBeLessThan(week);
    }
    // bài đầu dạy V7 bằng thẻ Từng nốt (hợp âm) TRƯỚC trò đệm
    const first = WEEKS.flatMap((w) => w.lessons).find((l) => l.id === acc[0].lessonId)!;
    const iNotes = first.activities.findIndex((a) => a.kind === 'notes' && a.segment.targets.some((t) => t.keys.join() === 'B2,F3,G3'));
    const iAcc = first.activities.findIndex((a) => a.kind === 'musician');
    expect(iNotes).toBeGreaterThanOrEqual(0);
    expect(iNotes).toBeLessThan(iAcc);
  });
});

describe('đánh bóng: thang tốc độ', () => {
  it('đạt → lên nấc; chưa đạt → thử lại tối đa POLISH_TRIES lượt rồi "mai leo tiếp"; nấc cuối đạt → xong', () => {
    const L = [50, 60, 72];
    expect(polishStep(L, 0, 1, true)).toEqual({ next: 'up', rung: 1 });
    expect(polishStep(L, 1, 1, false)).toEqual({ next: 'again', rung: 1 });
    expect(polishStep(L, 1, POLISH_TRIES, false)).toEqual({ next: 'done', rung: 1 });
    expect(polishStep(L, 2, 1, true)).toEqual({ next: 'done', rung: 2 });
  });

  it('mọi hoạt động đánh bóng: bài cũ, thang tăng dần, nấc cuối ≥ tốc độ tiêu chí (60)', () => {
    const pol = musicianActs().filter((x) => x.a.task.type === 'polish');
    expect(new Set(pol.map((x) => x.week))).toEqual(new Set([27, 32, 38]));
    for (const { week, a } of pol) {
      if (a.task.type !== 'polish') continue;
      expect(findTune(a.task.songId)!.week!).toBeLessThan(week);
      const l = a.task.ladder;
      for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1]);
      expect(l[l.length - 1]).toBeGreaterThanOrEqual(60);
    }
    expect(hasDynamics(findTune('ninja_tiptoe')!)).toBe(true);
  });

  it('ước lượng thời lượng có cho mọi loại', () => {
    for (const { a } of musicianActs()) expect(musicianMinutes(a), a.title).toBeGreaterThan(0);
  });
});

describe('song tấu với thầy (Tune.duet)', () => {
  const DUETS: Record<string, [string, number]> = {
    duet_mary: ['mary_lamb', 6],
    duet_lightly_row: ['lightly_row', 9],
    duet_aunt_rhody_g: ['aunt_rhody_g', 14],
    duet_twinkle: ['twinkle_easy', 20],
    duet_minuet: ['minuet_g', 30],
  };
  const mel = (t: Tune) => timeline(t).map((n) => `${n.pitch ?? 'R'}:${n.beats}:${n.finger ?? ''}`);

  it.each(Object.entries(DUETS))('%s: bè bé GIỐNG HỆT bài gốc; bè thầy thấp hơn, không trùng tên nốt; nằm trong bài học tuần %s', (id, [base, week]) => {
    const t = findTune(id)!;
    expect(t.week).toBe(week);
    expect(validateTune(t)).toEqual([]);
    expect(mel(t)).toEqual(mel(findTune(base)!));
    const part = duetPart(t);
    expect(part.length).toBeGreaterThan(8);
    // nhạc đệm của bài song tấu = bè thầy (thay nhạc đệm tự động)
    expect(accompaniment(t)).toEqual(part);
    const low = Math.min(...playable(t).map((n) => pitchToMidi(n.pitch!)));
    for (const a of part) expect(a.midi).toBeLessThan(low);
    // bài học: chờ (nhớ lại) → theo nhịp (thầy đàn cùng); bài gốc đã học trước đó
    const uses = WEEKS.flatMap((w) => w.lessons).filter((l) => l.activities.some((a) => a.kind === 'song' && a.songId === id));
    expect(uses.map((l) => l.week)).toEqual([week]);
    expect(uses[0].activities.some((a) => a.kind === 'song' && a.songId === id && a.mode === 'tempo' && !a.phrase)).toBe(true);
    expect(findTune(base)!.week!).toBeLessThanOrEqual(week);
  });

  it('cắt một câu vẫn giữ bè thầy đúng câu đó', () => {
    const t = findTune('duet_mary')!;
    const s = slice(t, 4, 8);
    expect(s.duet!.reduce((x, n) => x + n.beats, 0)).toBe(16);
    expect(duetPart(s)[0].midi).toBe(duetPart(t).find((a) => a.start === 16)!.midi);
  });

  it('validateDuet bắt lỗi: bè thầy trùng tên nốt bé / cao bằng nốt bé / lệch số phách', () => {
    const base = findTune('mary_lamb')!;
    const bad: Tune = { ...base, duet: [{ pitch: 'E3', beats: 1 }, ...Array(31).fill({ rest: true, beats: 1 })] };
    expect(validateDuet(bad).join()).toMatch(/trùng tên nốt/);
    const high: Tune = { ...base, duet: [{ pitch: 'C5', beats: 1 }, ...Array(31).fill({ rest: true, beats: 1 })] };
    expect(validateDuet(high).join()).toMatch(/không thấp hơn/);
    const short: Tune = { ...base, duet: [{ pitch: 'G2', beats: 4 }] };
    expect(validateDuet(short).join()).toMatch(/phách/);
  });

  it('bài cũ (không bè thầy) giữ nguyên nhạc đệm tự động', () => {
    expect(findTune('mary_lamb')!.duet).toBeUndefined();
    expect(duetPart(findTune('mary_lamb')!)).toEqual([]);
  });
});
