import { describe, expect, it } from 'vitest';
import { SOURCE_WEEKS, WEEKS } from '../src/lessons/curriculum';
import { buildSessionPlan, estimateLessonMinutes, findLesson, MAX_SESSION_STEPS, nextLesson } from '../src/lessons/lessonEngine';
import {
  PHRASE_STEPS_FROM_WEEK,
  PHRASE_STEPS_SKIP,
  firstTempoActivities,
  lessonWithPhraseSteps,
  phraseStepsFor,
} from '../src/lessons/phraseSteps';
import { chantDue, chantSongIds, songFamiliar } from '../src/lessons/readingAids';
import { CHANT_MIN } from '../src/lessons/sessionEstimate';
import type { Activity, Lesson, RhythmSymbol } from '../src/lessons/types';
import { CHANT_MEASURES, chantFor, rhythmSymbolsOf } from '../src/music/chant';
import { findTune } from '../src/music/exercises';
import { beatsPerMeasure, phraseRanges } from '../src/music/tune';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import type { SongRun } from '../src/progress/schema';
import {
  NOTE_COLOR_FAMILIAR_TEMPO_OFF_FROM,
  NOTE_COLOR_WEEKS,
  STAFF_ONLY_FAMILIAR_FROM,
  noteColorsOn,
  readingHints,
} from '../src/ui/components/noteColors';
import { SYMBOL } from '../src/ui/screens/rhythm';
import { fixtureWeek4Child } from './fixtures/week4Child';

/**
 * (2026-10-15, OWNER duyệt — rà soát của thầy giáo nhiều kinh nghiệm):
 * 1. "Từng câu rồi cả bài" (lessons/phraseSteps.ts) · 2. "Đọc nhịp to trước khi đàn" (music/chant.ts, ui/screens/songChant.ts)
 * · 3. "Bớt màu & tên nốt sớm hơn" (ui/components/noteColors.ts + lessons/readingAids.ts songFamiliar).
 * Bé thật đang ở tuần 4–5 có tiến độ đã lưu → tuần 1–5 CHỈ thêm (không chèn / đổi chỗ hoạt động).
 */

const sig = (a: Activity) =>
  a.kind === 'song' ? `song:${a.songId}@${a.mode}${a.level ?? ''}${a.phrase ? `[${a.phrase}]` : ''}${a.hand ? `/${a.hand}` : ''}` : a.kind;
const ordered = (weeks: readonly { lessons: readonly Lesson[] }[]) => weeks.flatMap((w) => w.lessons);

const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
  songId: 'choo_choo_train', mode: 'wait', bpm: 60, hints: 'full', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ...o,
});

describe('an toàn tiến độ (tuần 1–5 chỉ thêm; bé đang ở tuần 4)', () => {
  it('tuần 1–5: cùng hoạt động, cùng chỉ số như dữ liệu gốc (chỉ thêm cờ `chant`)', () => {
    for (let w = 0; w < 5; w++) {
      expect(WEEKS[w]).toBe(SOURCE_WEEKS[w]); // không áp "từng câu" trước tuần 6
      for (const l of WEEKS[w].lessons) for (const a of l.activities) if (a.kind === 'song') expect(a.phrase, `${l.id} ${a.songId}`).toBeUndefined();
    }
    // các chỉ số đã lưu của tuần 4–5 vẫn trỏ đúng hoạt động
    expect(findLesson('w4-l3')!.activities.map(sig)).toEqual(['song:hot_cross_buns@tempo2', 'song:choo_choo_train@wait', 'song:choo_choo_train@tempo2']);
    expect(findLesson('w5-l2')!.activities.map(sig)).toEqual(['song:raindrops@wait', 'song:raindrops@tempo2', 'theory']);
    const choo = findLesson('w4-l3')!.activities[2];
    expect(choo.kind === 'song' && choo.chant).toBe(true);
  });

  it('bé thật (fixture tuần 4): "Học tiếp" vẫn là w4-l2, cùng các hoạt động như trước', () => {
    const d = fixtureWeek4Child(new Date(2026, 9, 15, 12));
    expect(d.progress.currentWeek).toBe(4);
    const next = nextLesson(d);
    expect(next.id).toBe('w4-l2');
    const acts = buildSessionPlan(next, d).flatMap((s) => (s.kind === 'activity' ? [`${s.index}:${sig(s.activity)}`] : []));
    expect(acts).toEqual(['0:song:ex_c_quarter@tempo2', '1:song:ex_cde_walk@tempo2']);
  });
});

describe('1. Từng câu rồi cả bài (tuần ≥ 6)', () => {
  const first = firstTempoActivities(SOURCE_WEEKS);

  it('Bài ca niềm vui (w6-l2 "Tập từng câu, rồi cả bài"): Câu 1 → Câu 2 → cả bài, giữ lời dẫn & các bước sau', () => {
    const l = findLesson('w6-l2')!;
    const pr = phraseRanges(findTune('ode_to_joy_easy')!);
    expect(l.activities.map(sig)).toEqual([
      `song:ode_to_joy_easy@tempo2[${pr[0]}]`,
      `song:ode_to_joy_easy@tempo2[${pr[1]}]`,
      'song:ode_to_joy_easy@tempo2',
      'improv',
      'sing',
    ]);
    const whole = l.activities[2];
    expect(whole.kind === 'song' && whole.intro).toContain('Tập từng câu');
  });

  it('mọi lượt theo nhịp ĐẦU TIÊN của bản nhạc mới (tuần ≥ 6) có 2 bước câu ngay trước — trừ bài trong danh sách bỏ qua', () => {
    let applied = 0;
    for (const src of ordered(SOURCE_WEEKS)) {
      const cur = findLesson(src.id)!;
      if (src.week < PHRASE_STEPS_FROM_WEEK || PHRASE_STEPS_SKIP.has(src.id)) {
        expect(cur, src.id).toBe(src);
        continue;
      }
      const expected = lessonWithPhraseSteps(src, first);
      expect(cur.activities.map(sig), src.id).toEqual(expected.activities.map(sig));
      src.activities.forEach((a, i) => {
        if (a.kind !== 'song' || !first.has(`${src.id}#${i}`)) return;
        const steps = phraseStepsFor(a);
        // bài đã tập tách tay / một câu, hoặc có trò sắc thái (≤ 3 hoạt động) → không thêm
        if (!steps.length || src.activities.some((b) => b.kind === 'dynamics' || (b.kind === 'song' && b.songId === a.songId && (b.hand || b.phrase)))) return;
        applied++;
        const k = cur.activities.indexOf(a);
        expect(k, `${src.id} ${a.songId}`).toBeGreaterThanOrEqual(2);
        const [p1, p2] = [cur.activities[k - 2], cur.activities[k - 1]];
        const pr = phraseRanges(findTune(a.songId)!);
        for (const [p, r] of [[p1, pr[0]], [p2, pr[1]]] as const) {
          expect(p.kind === 'song' && p.songId === a.songId && p.mode === 'tempo' && p.level === 2, `${src.id} ${a.songId}`).toBe(true);
          if (p.kind === 'song') expect(p.phrase).toEqual(r);
        }
      });
    }
    expect(applied).toBeGreaterThanOrEqual(25);
  });

  it('danh sách bỏ qua là tối thiểu: mỗi bài trong đó, nếu thêm bước câu, sẽ quá 7 màn (> 5 hoạt động) hoặc quá 12 phút', () => {
    for (const id of PHRASE_STEPS_SKIP) {
      const src = ordered(SOURCE_WEEKS).find((l) => l.id === id)!;
      expect(src, id).toBeTruthy();
      const would = lessonWithPhraseSteps(src, first);
      expect(would.activities.length, `${id}: không có bước câu nào để bỏ`).toBeGreaterThan(src.activities.length);
      expect(would.activities.length > MAX_SESSION_STEPS - 2 || estimateLessonMinutes(would) > 12, id).toBe(true);
    }
  });

  it('bài đã thêm bước câu vẫn trong giới hạn buổi: ≤ 5 hoạt động (≤ 7 màn) và ≤ 12 phút', () => {
    for (const l of ordered(WEEKS)) {
      if (!l.activities.some((a) => a.kind === 'song' && a.phrase && a.mode === 'tempo' && !a.hand)) continue;
      expect(l.activities.length, l.id).toBeLessThanOrEqual(MAX_SESSION_STEPS - 2);
      expect(estimateLessonMinutes(l), l.id).toBeLessThanOrEqual(12);
    }
  });
});

describe('2. Đọc nhịp to trước khi đàn', () => {
  it('rút mẫu nhịp từ trường độ', () => {
    expect(rhythmSymbolsOf([{ beats: 0.5 }, { beats: 0.5 }, { beats: 1 }, { beats: 2 }])).toEqual(['run', 'walk', 'long']);
    expect(rhythmSymbolsOf([{ beats: 1.5 }, { beats: 0.5 }, { beats: 2, rest: true }])).toEqual(['dotted', 'rest', 'rest']);
    expect(rhythmSymbolsOf([{ beats: 0.5 }, { beats: 1 }, { beats: 0.5 }, { beats: 0.75 }, { beats: 0.25 }])).toEqual(['sync', 'dotted8']);
    expect(rhythmSymbolsOf([{ beats: 0.25 }, { beats: 0.25 }, { beats: 0.25 }, { beats: 0.25 }, { beats: 0.5 }, { beats: 0.25 }, { beats: 0.25 }])).toEqual(['run4', 'run3']);
    expect(rhythmSymbolsOf([{ beats: 0.5, rest: true }, { beats: 0.5 }])).toBeNull();
    expect(rhythmSymbolsOf([{ beats: 2.5 }])).toBeNull();
  });

  /** Bài có cờ `chant` → hình nhịp mới mà bài dạy (phải có trong mẫu đọc) */
  const NEW_RHYTHM: Record<string, RhythmSymbol> = {
    choo_choo_train: 'run',
    raindrops: 'run',
    ode_to_joy_original: 'dotted',
    rabbit_run: 'run4',
    ly_cay_da: 'run3',
    cyclo_ride: 'sync',
    bac_kim_thang: 'dotted8',
  };

  it('các bài có cờ chant: đúng danh sách; mẫu rút từ câu 1 của chính bài, đủ 2 ô, có hình nhịp mới', () => {
    expect([...chantSongIds()].sort()).toEqual(Object.keys(NEW_RHYTHM).sort());
    for (const [id, sym] of Object.entries(NEW_RHYTHM)) {
      const t = findTune(id)!;
      const c = chantFor(t)!;
      expect(c, id).toBeTruthy();
      expect(c.pattern, id).toContain(sym);
      expect(c.meter).toBe(beatsPerMeasure(t));
      const [p0, p1] = phraseRanges(t)[0];
      expect(c.measures[0]).toBeGreaterThanOrEqual(p0);
      expect(c.measures[1]).toBeLessThanOrEqual(p1);
      const beats = c.pattern.reduce((s, x) => s + SYMBOL[x].beats, 0);
      expect(beats, id).toBe(c.meter * Math.min(CHANT_MEASURES, p1 - p0));
    }
    expect(chantFor(findTune('choo_choo_train')!)!.pattern).toEqual(['run', 'run', 'walk', 'walk', 'run', 'run', 'long']);
  });

  it('cờ chant nằm ở lượt theo nhịp (không phải chờ) và ở lượt theo nhịp ĐẦU TIÊN của bài; buổi vẫn ≤ 12 phút', () => {
    const first = firstTempoActivities(SOURCE_WEEKS);
    for (const l of ordered(SOURCE_WEEKS))
      l.activities.forEach((a, i) => {
        if (a.kind !== 'song' || !a.chant) return;
        expect(a.mode, l.id).toBe('tempo');
        expect(first.has(`${l.id}#${i}`), `${l.id} ${a.songId}`).toBe(true);
      });
    for (const l of ordered(WEEKS)) if (l.activities.some((a) => a.kind === 'song' && a.chant)) expect(estimateLessonMinutes(l), l.id).toBeLessThanOrEqual(12);
    expect(CHANT_MIN).toBeGreaterThan(0);
  });

  it('chỉ hiện trước lượt theo nhịp ĐẦU TIÊN, trong buổi học (không Thư viện / sân khấu / ôn bài cũ / lặp câu)', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 15, 17));
    st.setCurrentWeek(4);
    const d0 = st.get();
    expect(chantDue(d0, 'choo_choo_train', { mode: 'tempo' })).toBe(true);
    expect(chantDue(d0, 'choo_choo_train', { mode: 'wait' })).toBe(false);
    for (const o of [{ free: true }, { stage: true }, { review: true }, { loop: true }]) expect(chantDue(d0, 'choo_choo_train', { mode: 'tempo', ...o })).toBe(false);
    expect(chantDue(d0, 'hot_cross_buns', { mode: 'tempo' })).toBe(false); // bài không có cờ
    // lượt chờ chưa tính; có một lượt theo nhịp (kể cả một câu) → thôi
    const s = st.startSession('w4-l3').id;
    st.addSongRun(s, run({}));
    expect(chantDue(st.get(), 'choo_choo_train', { mode: 'tempo' })).toBe(true);
    st.addSongRun(s, run({ mode: 'tempo', level: 2, phrase: [0, 4], passed: false }));
    expect(chantDue(st.get(), 'choo_choo_train', { mode: 'tempo' })).toBe(false);
  });
});

describe('3. Bớt màu & tên nốt sớm hơn', () => {
  it('nốt màu "Tự động": lần đầu (chờ) có màu tới tuần 8; lượt theo nhịp bài QUEN tắt từ tuần 4', () => {
    expect(NOTE_COLOR_WEEKS).toBe(8);
    expect(NOTE_COLOR_FAMILIAR_TEMPO_OFF_FROM).toBe(4);
    const wait = { tempo: false, familiar: false };
    const firstTempo = { tempo: true, familiar: false };
    const familiarTempo = { tempo: true, familiar: true };
    const familiarWait = { tempo: false, familiar: true };
    for (let w = 1; w <= 8; w++) {
      expect(noteColorsOn('auto', w, wait), `tuần ${w}`).toBe(true);
      expect(noteColorsOn('auto', w, firstTempo)).toBe(true);
      expect(noteColorsOn('auto', w, familiarWait)).toBe(true);
      expect(noteColorsOn('auto', w, familiarTempo), `tuần ${w}`).toBe(w < 4);
      expect(noteColorsOn('auto', w)).toBe(true); // không rõ lượt → như cũ
    }
    expect(noteColorsOn('auto', 9, wait)).toBe(false);
    // bố mẹ chọn thì luôn thắng
    expect(noteColorsOn('on', 6, familiarTempo)).toBe(true);
    expect(noteColorsOn('off', 2, wait)).toBe(false);
  });

  it('gợi ý: lượt theo nhịp của bài QUEN chỉ còn khuông từ tuần 6; lần đầu / chế độ chờ giữ gợi ý của bài học', () => {
    expect(STAFF_ONLY_FAMILIAR_FROM).toBe(6);
    for (const h of ['full', 'names', 'staff'] as const) {
      expect(readingHints(h, 6, { tempo: true, familiar: true })).toBe('staff');
      expect(readingHints(h, 20, { tempo: true, familiar: true })).toBe('staff');
      // khóa Fa chưa dạy (trước tuần 11) → bài tay trái giữ tên nốt
      expect(readingHints(h, 7, { tempo: true, familiar: true, bass: true })).toBe(h);
      expect(readingHints(h, 11, { tempo: true, familiar: true, bass: true })).toBe('staff');
      expect(readingHints(h, 5, { tempo: true, familiar: true })).toBe(h);
      expect(readingHints(h, 8, { tempo: true, familiar: false })).toBe(h);
      expect(readingHints(h, 8, { tempo: false, familiar: true })).toBe(h);
    }
  });

  it('bài QUEN = đã đạt trọn bài (không tính một câu / tách tay / lượt chưa đạt / đọc nhạc ngẫu nhiên)', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 15, 17));
    const s = st.startSession('w6-l1').id;
    expect(songFamiliar(st.get(), 'ode_to_joy_easy')).toBe(false);
    st.addSongRun(s, run({ songId: 'ode_to_joy_easy', passed: false }));
    st.addSongRun(s, run({ songId: 'ode_to_joy_easy', phrase: [0, 4] }));
    st.addSongRun(s, run({ songId: 'ode_to_joy_easy', hand: 'RH' }));
    expect(songFamiliar(st.get(), 'ode_to_joy_easy')).toBe(false);
    st.addSongRun(s, run({ songId: 'ode_to_joy_easy' }));
    expect(songFamiliar(st.get(), 'ode_to_joy_easy')).toBe(true);
    st.addSongRun(s, run({ songId: 'sight:C:RH' }));
    expect(songFamiliar(st.get(), 'sight:C:RH')).toBe(false);
  });
});
