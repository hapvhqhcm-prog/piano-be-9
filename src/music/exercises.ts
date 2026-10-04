import { SONGS, findSong, type Tune, type TuneNote } from './tune';

/** Bài tập nhịp tuần 4 (không phải bài hát) — tự soạn, chỉ dùng nốt thế Đô. */
const RH: Record<string, number> = { C4: 1, D4: 2, E4: 3, F4: 4, G4: 5 };
const n = (pitch: string, beats = 1): TuneNote => ({ pitch, beats, finger: RH[pitch] });

function ex(id: string, titleVi: string, notes: TuneNote[]): Tune {
  return {
    id,
    title: titleVi,
    titleVi,
    hand: 'RH',
    bpm: 60,
    timeSignature: '4/4',
    week: 4,
    phrases: [0, 4],
    notes,
  };
}

export const EXERCISES: readonly Tune[] = [
  // Mức 2: "đánh mỗi phách một nốt" — 8 ô nhịp nốt đen (tiêu chí tuần 4); mỗi ô một nốt, đi Đô–Rê–Mi rồi về
  ex(
    'ex_c_quarter',
    'Mỗi phách một nốt (8 ô nhịp)',
    ['C4', 'D4', 'E4', 'D4', 'C4', 'E4', 'D4', 'C4'].flatMap((p) => [n(p), n(p), n(p), n(p)]),
  ),
  ex('ex_cde_walk', 'Đô Rê Mi đi đều', [
    ...['C4', 'D4', 'E4', 'D4'].map((p) => n(p)),
    n('C4'), n('C4'), n('C4', 2),
    ...['E4', 'D4', 'C4', 'D4'].map((p) => n(p)),
    n('E4'), n('E4'), n('E4', 2),
    ...['C4', 'D4', 'E4', 'F4'].map((p) => n(p)),
    n('G4', 4),
    ...['G4', 'F4', 'E4', 'D4'].map((p) => n(p)),
    n('C4', 4),
  ]),
];

/** Tìm bài hát hoặc bài tập. */
export function findTune(id: string): Tune | undefined {
  return findSong(id) ?? EXERCISES.find((e) => e.id === id);
}

export const ALL_TUNES: readonly Tune[] = [...SONGS, ...EXERCISES];
