import { wait } from '../../audio/AudioEngine';
import { matchHeard } from '../../audio/match';
import { TWO_HAND_DEFAULT, type HandsResult, type HandsSpec } from '../../audio/twoHand';
import { gradeHandsTempo, tallyHands, type HandNoteResult, type HandsProbe, type TwoHandRun } from '../../music/handGrade';
import { confetti } from '../components/celebrate';
import {
  PASS_SCORE,
  TIMING_WINDOWS,
  countInBeats,
  countInLabel,
  gradePulseDrop,
  gradeTiming,
  loopStreak,
  pulseDropWindow,
  pulseMessage,
  score as scoreOf,
  starsFor,
  type HeardEvent,
} from '../../music/timing';
import {
  DYN_VOLUME,
  accompaniment,
  beatsPerMeasure,
  dynAtBeat,
  handOnsets,
  metronomeAccent,
  otherHandNotes,
  phraseRanges,
  pitchesOf,
  slice,
  totalBeats,
  tuneRange,
  type Onset,
  type Tune,
} from '../../music/tune';
import type { Hand } from '../../piano/fingering';
import { PianoKeyboard, type KeyTarget } from '../../piano/PianoKeyboard';
import { midiToFreq, midiToPitch, pitchToMidi, viName } from '../../piano/pitchTable';
import type { SongRun } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { StaffView } from '../components/staffView';
import { HandOverlay, eventsFromTune, playDemo } from '../components/demo';
import { SONG_CHECKS, SONG_CHECKS_WAIT, parentChecklist, type CheckItem } from '../components/parentCheck';
import { speakChip } from '../components/speakChip';
import { cancelSpeech, speak } from '../../audio/voice';
import { SongHead, type SongChoices } from './songHead';
import { LOOP_TARGET, MIC_LATENCY, TEMPOS, fingerMap, hardestPhrase, idxOf, midisOf, onsetLabel, shortIntro, type HandSel, type SongOptions } from './songShared';
import { TakeReplay } from './songTake';
import { MicHonestyWatch, micHonestyBox } from '../components/micHonesty';
import { songEverPlayed } from '../../lessons/lessonEngine';
import { mascot } from '../components/mascot';
import type { ReviewMark } from '../components/staffView';
import {
  analyzeTempo,
  focusPlan,
  handsOutcome,
  kindsPresent,
  outcomeOf,
  placeLabel,
  reviewUsable,
  teach,
  waitOutcome,
  type FocusStep,
  type NoteKind,
  type NoteReview,
  type RunReview,
  type TeacherPoint,
  type WaitLog,
} from '../../music/teacher';
import '../../styles/pedagogy.css';
import '../../styles/teacher.css';
import '../../styles/kidux.css';

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// Giữ nguyên API cũ (tests/ui-v51.test.ts, library/session/stage import từ './song')
export { hardestPhrase, shortIntro, type SongOptions } from './songShared';

export interface SongHooks {
  onRun(run: Omit<SongRun, 'ts'>): void;
  onDone(): void;
  onBack(): void;
}

type State = 'idle' | 'demo' | 'countin' | 'playing' | 'rate' | 'result';

/** (+ 2026-10-09) Màn kết quả của lượt chính — để "🎯 Luyện ngay chỗ này" quay về đúng chỗ */
interface ResultBack {
  s: number;
  text: string;
  mode: SongOptions['mode'];
  phrase: [number, number] | null;
  bpm: number;
  review: RunReview;
  point: TeacherPoint;
}
/** (+ 2026-10-09) "🎯 Luyện ngay chỗ này": chậm trước, rồi đúng tốc độ (teacher.focusPlan), xong quay về kết quả */
interface FocusRun {
  steps: FocusStep[];
  i: number;
  /** Chỗ luyện (ô nhịp CẢ BÀI) và tên gọi ("Câu 2", "Ô 5–6") */
  range: [number, number];
  place: string;
  back: ResultBack;
  /** Lời nhắn nhỏ giữa hai bước ("✓ Xong lượt chậm!") */
  note: string;
  /** Lượt đàn gần nhất có sạch không (null = không biết — micro tắt) */
  clean: boolean | null;
}
/** Chú thích màu dưới khuông (chỉ loại có trong lượt) */
const KIND_LABEL: Record<NoteKind, string> = { ok: 'đúng', wrong: 'nhầm', missed: 'sót', early: 'sớm ←', late: 'muộn →', helped: 'bố mẹ' };

/**
 * Màn bài hát kiểu "app nghe đàn":
 * - Từng nốt (chờ): con trỏ chờ bé đàn đúng (micro) hoặc bấm "Nốt tiếp". Bài hai tay đi theo từng nhóm nốt cùng lúc.
 * - Theo nhịp: đếm vào, máy gõ nhịp + nhạc đệm; Mức 2 con trỏ nhảy, Mức 3 băng chuyền.
 * Đầu trang: songHead.ts · 🎧 Nghe lại: songTake.ts · hàm thuần / hằng số: songShared.ts.
 */
export function songScreen(app: App, full: Tune, opts: SongOptions, hooks: SongHooks) {
  return (root: HTMLElement) => {
    const settings = app.store.settings;
    // Độ khắt khe chấm nhịp (Cài đặt → mặc định "dễ")
    const win = TIMING_WINDOWS[settings.timing ?? 'easy'];
    const fmap = fingerMap(full);
    const [low, high] = tuneRange(full);
    let mode = opts.mode;
    let hints = opts.hints;
    let level: 2 | 3 = opts.level ?? 2;
    let bpm = opts.bpm ?? full.bpm;
    let phrase: [number, number] | null = opts.phrase ?? null;
    // ---- v5 sư phạm ----
    /** Tập tách tay — chỉ bài hai tay (có bè lh) */
    const twoHand = !!full.lh;
    // v5.1: bài học chỉ định tập tách tay → mở sẵn tay đó (chip vẫn cho bé đổi)
    let handSel: HandSel = twoHand && opts.hand ? opts.hand : 'BOTH';
    /** Tay đang tập riêng (null = hai tay) */
    const solo = (): Hand | null => (twoHand && handSel !== 'BOTH' ? handSel : null);
    /** "Lặp câu này 3 lần đúng liên tiếp" (chế độ chờ, đang chọn một câu) */
    let loop3 = false;
    let streak = 0;
    /** v5.1 — Đang lặp "câu khó" (mở từ màn kết quả): nhớ cách chơi / câu cũ để quay về cả bài */
    let hardBack: { mode: SongOptions['mode']; phrase: [number, number] | null; range: [number, number] } | null = null;
    /** v5.1 — Số lỗi theo ô nhịp của lượt đang chơi (chờ: đàn sai; theo nhịp: nốt trượt) */
    const missByMeasure = new Map<number, number>();
    const addMiss = (o: Onset | undefined) => {
      if (!o) return;
      const m = o.notes[0].measure;
      missByMeasure.set(m, (missByMeasure.get(m) ?? 0) + 1);
    };
    /**
     * (+ 2026-10-09) NHẬN XÉT KIỂU THẦY GIÁO (src/music/teacher.ts): sổ ghi từng nhóm nốt của lượt "Từng nốt" đang chơi,
     * nhận xét từng nốt của lượt vừa xong (chỉ trong bộ nhớ — không lưu), lời nhắn của lượt trước (khen "tiến bộ").
     */
    let wLog: WaitLog[] = [];
    /**
     * (+ 2026-10-09) CHẤM HAI TAY BẰNG MICRO (src/audio/twoHand.ts, OWNER duyệt): kết quả từng tay, từng nhóm của lượt
     * vừa chơi (null = lượt không chấm hai tay). Màn kết quả / nhận xét đọc được ở đây; SongRun.hands lưu bản tổng hợp.
     */
    let lastHands: TwoHandRun | null = null;
    /** Chế độ chờ: kết quả từng tay ở lần đàn ĐẦU của mỗi nhóm hai tay (chỉ số = chỉ số nhóm) */
    let wHands: HandNoteResult[][] = [];
    let review: RunReview | null = null;
    let lastPoint: { key: string; point: TeacherPoint } | null = null;
    /** 🎯 Đang "Luyện ngay chỗ này" (mở từ màn kết quả): các bước, bước hiện tại, màn kết quả để quay về */
    let focus: FocusRun | null = null;
    /** Bài MỚI (chưa chơi lượt nào): nhắc hát tên nốt theo thầy khi xem mẫu */
    const firstTime =
      !full.id.startsWith('sight') && !songEverPlayed(app.store.get(), full.id);
    let tune = full;
    /** Lời dẫn của bài học: cả bài, bước ôn, hoặc ĐÚNG câu bài học mở sẵn (opts.phrase — tập tách tay một câu khó) */
    const showIntroFor = (p: [number, number] | null): boolean =>
      !p || !!opts.review || (!!opts.phrase && p[0] === opts.phrase[0] && p[1] === opts.phrase[1]);
    let state: State = 'idle';
    let token = 0;
    /**
     * (OWNER duyệt 2026-10-08) GIỮ NHỊP TRONG ĐẦU — chỉ theo nhịp, không ở sân khấu: bài học bật cờ `pulseDrop`, hoặc
     * từ tuần 5 bài đã có lượt theo nhịp ĐẠT (cả bài, hai tay) → các lượt sau máy gõ nhịp im 2 ô giữa bài.
     */
    const pulseOn = (): boolean => {
      if (mode !== 'tempo' || opts.stage) return false;
      if (opts.pulseDrop) return true;
      const d = app.store.get();
      if (d.progress.currentWeek < 5) return false;
      return d.sessions.some((x) => x.songRuns.some((r) => r.songId === full.id && r.mode === 'tempo' && r.passed && !r.phrase && !r.hand));
    };
    /** Khoảng phách máy im của bài/câu đang mở (null = không thử: tắt, hoặc bài quá ngắn) */
    const pulseWindow = (): [number, number] | null => (pulseOn() ? pulseDropWindow(totalBeats(tune), beatsPerMeasure(tune)) : null);
    /** Lượt theo nhịp vừa chơi có thử thách "máy im" không (cho lời khen khi bố mẹ chấm) */
    let lastDrop: [number, number] | null = null;
    let raf = 0;
    let disposed = false;
    let staff: StaffView;

    const kb = new PianoKeyboard({
      low,
      high,
      labels: hints === 'full' ? 'c' : 'none',
      fingerOnPress: (p) => fmap.get(pitchToMidi(p)),
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (state === 'playing' && mode === 'wait' && !micOn()) onWaitInput(pitchToMidi(p), 'tap');
      },
    });

    const overlay = new HandOverlay(kb);
    const head = new SongHead({
      full,
      opts,
      canEdit: () => (state === 'idle' || state === 'result') && !focus,
      pick: (p: Partial<SongChoices>) => {
        if (p.handSel) handSel = p.handSel;
        if (p.mode) mode = p.mode;
        if ('phrase' in p) phrase = p.phrase ?? null;
        if (p.hints) hints = p.hints;
        if (p.level) level = p.level;
        if (p.bpm) bpm = p.bpm;
        reset();
      },
    });
    const staffBox = h('div', { class: `song-staff${full.lh ? ' grand' : ''}` });
    const status = h('div', { class: 'song-status' });
    const bar = h('div', { class: 'actions' });
    const screenEl = h('div', { class: 'screen' }, head.el, staffBox, status, h('div', { class: `keyboard-wrap song-kb${full.lh ? ' short' : ''}` }, kb.el), bar);
    root.append(screenEl);
    head.closeOnOutsideTap(screenEl);

    const micOn = () => app.mic.state === 'on';
    /** (+ 2026-10-09) Micro chấm RIÊNG từng tay: bài hai tay, đàn cả hai tay, micro bật, Cài đặt cho phép (thử nghiệm) */
    const handsOn = (): boolean => twoHand && !solo() && micOn() && (app.store.settings.micTwoHand ?? TWO_HAND_DEFAULT);
    /** Nhóm có cả hai tay đàn cùng lúc */
    const together = (g: Onset): boolean => g.notes.some((n) => n.hand === 'RH') && g.notes.some((n) => n.hand === 'LH');
    const handMidis = (g: Onset, hand: Hand): number[] => g.notes.filter((n) => n.hand === hand).flatMap(pitchesOf).map(pitchToMidi);
    const handSpec = (g: Onset): HandsSpec => ({ RH: handMidis(g, 'RH'), LH: handMidis(g, 'LH') });
    const handParts = (g: Onset) =>
      (['RH', 'LH'] as const)
        .map((hand) => ({ hand, midis: handMidis(g, hand), indices: g.notes.filter((n) => n.hand === hand).map((n) => n.index) }))
        .filter((p) => p.midis.length);
    /** Kết quả một nhóm, mọi tay cùng một kết luận (nhóm một tay / bố mẹ bấm "tiếp") */
    const sameVerdict = (g: Onset, verdict: HandNoteResult['verdict'], offset?: number): HandNoteResult[] =>
      handParts(g).map((p) => ({ ...p, beat: g.start, measure: g.notes[0].measure, together: together(g), verdict, ...(offset !== undefined ? { offset } : {}) }));
    const handsRun = (m: 'wait' | 'tempo', notes: HandNoteResult[]): TwoHandRun => ({ mode: m, notes, ...tallyHands(notes) });
    const handsLine = (r: TwoHandRun): string => ` · 🫱 tay phải ${r.RH.hits}/${r.RH.total} · 🫲 tay trái ${r.LH.hits}/${r.LH.total}`;
    /** Bỏ nghe micro của lượt "theo nhịp" đang chạy (gọi khi dừng / rời màn) */
    let unTempo: () => void = () => undefined;
    const setBar = (...b: (HTMLElement | null | false)[]) =>
      bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    // 🎧 Nghe lại con đàn (chỉ khi micro bật; chỉ trong bộ nhớ)
    // (+ 2026-10-08) lượt cả bài hay nhất → "🎧 Album của con" (chỉ trên iPad này; không lưu bài đọc nhạc ngẫu nhiên)
    const take = new TakeReplay({
      mic: app.mic,
      micOn,
      showing: () => state === 'result',
      disposed: () => disposed,
      album: full.id.startsWith('sight') ? undefined : { songId: full.id, title: full.titleVi || full.title },
    });
    /**
     * (+ 2026-10-08) MICRO NÓI THẬT (chế độ chờ): bé có vẻ đang đàn mà micro không nhận ra nốt nào 3 lần liền →
     * "Micro nghe chưa rõ — không phải lỗi của con" + "👪 Bố mẹ chấm giúp" (cả lượt này chuyển sang bố mẹ chấm).
     */
    let parentRun = false;
    const honesty = new MicHonestyWatch(app.mic, {
      active: () => state === 'playing' && mode === 'wait' && micOn() && !parentRun && !loop3,
      onTrigger: () => {
        if (status.querySelector('.mic-honest')) return;
        status.append(
          micHonestyBox(() => {
            parentRun = true;
            showWaitNote();
          }),
        );
      },
    });

    function buildStaff(pageMode = false): void {
      tune = phrase ? slice(full, phrase[0], phrase[1]) : full;
      staff = new StaffView(tune, {
        names: hints !== 'staff',
        fingers: hints === 'full',
        // Màn kết quả có nhận xét từng nốt: luôn từng trang (lật trang xem lại cả bài), kể cả sau băng chuyền
        mode: mode === 'tempo' && level === 3 && !pageMode ? 'scroll' : 'page',
        // Tập tách tay: bè kia vẽ mờ (app đàn thay)
        dimHand: solo() ? (solo() === 'RH' ? 'LH' : 'RH') : null,
      });
      staffBox.replaceChildren(staff.el);
    }

    /** Nhóm nốt BÉ phải đàn: tập tách tay → chỉ nốt của tay đó (nhóm không còn nốt nào thì bỏ). */
    // Ghi nhớ theo (bài, tay): follow() gọi mỗi khung hình — không dựng lại cả dòng thời gian mỗi lần
    let gMemo: { tune: Tune; hand: Hand | null; gs: Onset[] } | null = null;
    const groups = (): Onset[] => {
      const hand = solo();
      if (!gMemo || gMemo.tune !== tune || gMemo.hand !== hand) gMemo = { tune, hand, gs: handOnsets(tune, hand) };
      return gMemo.gs;
    };
    /** Nhóm đang ở phách `beat` (nhóm cuối cùng đã bắt đầu, dung sai 0,05 phách) */
    const groupAt = (gs: Onset[], beat: number): Onset | undefined => {
      let cur: Onset | undefined;
      for (const g of gs) if (g.start <= beat + 0.05) cur = g;
      return cur;
    };
    /** Tập tách tay: app đàn khẽ nốt tay KIA bắt đầu trong [fromBeat, toBeat) — chỉ khi micro tắt */
    function playOther(fromBeat: number, toBeat: number, t0: number, spb: number, mute: [number, number] | null = null): void {
      if (micOn()) return; // micro bật: tiếng app đàn sẽ lẫn vào tiếng bé
      for (const n of otherHandNotes(tune, solo())) {
        if (n.start < fromBeat - 1e-6 || n.start >= toBeat - 1e-6) continue;
        if (mute && n.start >= mute[0] - 1e-6 && n.start < mute[1] - 1e-6) continue; // máy im: tay kia cũng nghỉ
        for (const p of pitchesOf(n)) {
          void app.audio.scheduleFreq(midiToFreq(pitchToMidi(p)), t0 + (n.start - fromBeat) * spb, n.beats * spb * 0.9, 0.35, false);
        }
      }
    }

    /** Nhóm nốt đang sáng trên phím (follow() gọi mỗi khung hình → chỉ vẽ lại phím khi đổi nhóm) */
    let litOnset: Onset | undefined | null = null;
    function lightOnset(o: Onset | undefined, force = false): void {
      litOnset = o;
      kb.setTargets([]);
      if (!o || (hints !== 'full' && !force)) return;
      const ts: KeyTarget[] = [];
      for (const n of o.notes) {
        ts.push({ pitch: n.pitch!, finger: n.finger, hand: n.hand });
        for (const a of n.also ?? []) ts.push({ pitch: a.pitch, finger: a.finger, hand: n.hand });
      }
      kb.setTargets(ts);
    }

    /** Dừng mọi thứ đang chạy (lượt chơi, mẫu, nhạc) — dùng khi dựng lại màn và khi rời màn. */
    function halt(): void {
      token++;
      cancelAnimationFrame(raf);
      unTempo();
      demoRun?.cancel();
      demoRun = null;
    }

    function reset(): void {
      if (state === 'result') cancelSpeech(); // thôi đọc lời nhắn kết quả cũ
      halt();
      loop3 = false;
      streak = 0;
      take.drop(); // 🎯 đang luyện một chỗ: bản ghi lượt chính được giữ (take.hold)
      // Rời câu khó (chọn câu khác / "Cả bài") → trả lại cách chơi cũ
      if (hardBack && !(phrase && phrase[0] === hardBack.range[0] && phrase[1] === hardBack.range[1])) {
        mode = hardBack.mode;
        hardBack = null;
      }
      overlay.hide();
      app.audio.stopAll();
      state = 'idle';
      head.render({ handSel, mode, phrase, hints, level, bpm });
      buildStaff();
      kb.clear();
      const g0 = groups()[0];
      if (g0) staff.setCursor(idxOf(g0));
      lightOnset(g0);
      if (focus) return focusIdle();
      const sh = solo();
      // v5.1: lời dẫn chỉ MỘT dòng ngắn trên màn; câu dài → app đọc to (🔊 nghe lại)
      const intro = opts.intro && showIntroFor(phrase) && !hardBack ? opts.intro.trim() : '';
      const introShort = intro ? shortIntro(intro) : '';
      status.replaceChildren(
        h(
          'div',
          { class: 'song-lines' },
          intro
            ? // Lời dẫn ĐẦY ĐỦ (tối đa 2 dòng; dài hơn → chạm để mở hết, 🔊 đọc to) — câu đầu ngắn hay bỏ mất thế tay / sắc thái
              h(
                'div',
                { class: 'song-intro' },
                h(
                  'span',
                  {
                    class: 'song-intro-text',
                    onclick: (e: Event) => (e.currentTarget as HTMLElement).classList.toggle('open'),
                  },
                  intro,
                ),
                introShort !== intro ? speakChip(app, intro) : null,
              )
            : null,
          hardBack ? h('b', {}, `🔁 Câu ${phraseRanges(full).findIndex(([a]) => a === hardBack!.range[0]) + 1} — đàn đúng ${LOOP_TARGET} lần liền nhé!`) : null,
          h(
            'span',
            {},
            sh ? `${sh === 'RH' ? '🫱 Tập tay PHẢI' : '🫲 Tập tay TRÁI'} — ${micOn() ? 'tay kia để nghỉ' : 'app đàn khẽ tay kia'}. ` : '',
            hardBack
              ? '' // Lặp câu khó: dòng "🔁 Câu N — đàn đúng 3 lần liền" ở trên đã đủ (không có nút Bắt đầu)
              : mode === 'wait'
              ? // Bài mới: nghe – hát – rồi mới đàn (gộp một dòng cho gọn)
                firstTime
                ? '🎬 Xem mẫu và hát tên nốt theo thầy — rồi Bắt đầu đàn từng nốt.'
                : micOn()
                  ? '🎤 Bấm Bắt đầu rồi đàn từng nốt — app nghe và tự đi tiếp.'
                  : 'Bấm 🎬 Xem mẫu để xem thầy đàn, rồi Bắt đầu và đàn từng nốt.'
              : `Đếm vào rồi đàn theo tiếng "tích" (${bpm} nhịp/phút).${pulseWindow() ? ' 🤫 Giữa bài máy sẽ im 2 ô — con đếm thầm trong đầu nhé!' : ''}`,
          ),
        ),
      );
      const canLoop = mode === 'wait' && !!phrase && !opts.stage;
      setBar(
        backButton(() => hooks.onBack()),
        hardBack
          ? button({ icon: '↩', label: 'Cả bài', onTap: () => ((phrase = hardBack?.phrase ?? null), reset()) })
          : button({ icon: '🎬', label: 'Xem mẫu', onTap: () => void demo() }),
        canLoop ? button({ icon: '🔁', label: `Lặp ${LOOP_TARGET} lần đúng`, kind: hardBack ? 'primary' : undefined, onTap: () => void startLoop() }) : null,
        hardBack ? null : button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void start() }),
      );
    }

    /** v5.1 — "🔁 Lặp câu khó": mở câu có nhiều lỗi nhất ở chế độ lặp 3 lần đúng (chờ từng nốt). */
    function openHard(range: [number, number]): void {
      hardBack = { mode, phrase, range };
      mode = 'wait';
      phrase = range;
      reset();
      void startLoop();
    }

    /** v5 — Lặp một câu: tự chơi lại tới khi đúng (không sai nốt nào) 3 lần LIÊN TIẾP. */
    async function startLoop(): Promise<void> {
      await start();
      if (state === 'playing' && mode === 'wait') {
        loop3 = true;
        streak = 0;
        take.drop(); // lặp câu: không ghi âm
        showWaitNote();
      }
    }
    const streakDots = () =>
      h(
        'span',
        { class: 'loop-dots', 'aria-label': `${streak}/${LOOP_TARGET}` },
        '🔁 ',
        '●'.repeat(streak),
        h('span', { class: 'loop-off' }, '○'.repeat(Math.max(0, LOOP_TARGET - streak))),
      );

    // ---------------- Xem mẫu: "video" bàn tay thầy đàn ----------------
    let demoRun: { cancel: () => void; done: Promise<void> } | null = null;
    async function demo(after: () => void = reset): Promise<void> {
      const tk = ++token;
      state = 'demo';
      const spb = 60 / bpm;
      overlay.setGhost(false);
      kb.setTargets([]);
      const caption = h('span', {}, '🎬 Xem thầy đàn mẫu — nhìn ngón tay nhé');
      status.replaceChildren(caption, firstTime ? h('div', { class: 'sing-prompt' }, '🎤 Hát tên nốt theo thầy nhé!') : '');
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: reset }));
      scheduleAccomp(app.audio.now() + 0.35, spb);
      demoRun = playDemo(app.audio, kb, overlay, eventsFromTune(tune), {
        bpm,
        onCaption: (t) => (caption.textContent = `🎬 ${t}`),
        onBeat: (beat) => {
          if (mode === 'tempo' && level === 3) staff.setTime(Math.max(0, beat));
          const cur = groupAt(groups(), beat);
          if (cur) staff.setCursor(idxOf(cur));
        },
      });
      await demoRun.done;
      if (tk === token) after();
    }

    function scheduleAccomp(t0: number, spb: number, mute: [number, number] | null = null): void {
      if (!settings.accompaniment || micOn()) return;
      for (const a of accompaniment(tune)) {
        // Giữ nhịp trong đầu: 2 ô máy im thì nhạc đệm cũng im (nhạc đệm cũng "gõ nhịp" hộ bé)
        if (mute && a.start >= mute[0] - 1e-6 && a.start < mute[1] - 1e-6) continue;
        // v4: bè đệm to/nhỏ theo sắc thái của giai điệu (mf = như cũ)
        const d = dynAtBeat(tune, a.start);
        const vol = 0.45 * (d ? DYN_VOLUME[d] / DYN_VOLUME.mf : 1);
        void app.audio.scheduleFreq(midiToFreq(a.midi), t0 + a.start * spb, a.beats * spb * 0.9, vol, false);
      }
    }

    /** Con trỏ/băng chuyền theo phách hiện tại. */
    function follow(beat: number): Onset | undefined {
      const gs = groups();
      const cur = groupAt(gs, beat);
      if (mode === 'tempo' && level === 3) staff.setTime(Math.max(0, beat));
      if (cur) staff.setCursor(idxOf(cur));
      if (hints === 'full') {
        const upcoming = gs.find((g) => g.start >= beat - 0.05 && g.start - beat < 0.5) ?? cur;
        if (upcoming !== litOnset) lightOnset(upcoming);
      }
      return cur;
    }

    // ---------------- Bắt đầu ----------------
    let starting = false;
    async function start(): Promise<void> {
      if (starting) return; // chạm 2 lần liền không được bắt đầu 2 lần
      starting = true;
      const tk = token;
      try {
        await app.ensureMic(); // chạm "Bắt đầu" = thao tác người dùng
      } finally {
        starting = false;
      }
      // Rời màn / bấm Dừng trong lúc chờ micro → không bắt đầu nữa
      if (tk !== token || disposed) return;
      if (mode === 'wait') startWait();
      else startTempo();
    }

    // ----- Từng nốt (chờ) -----
    let wIdx = 0;
    let wHits = 0;
    let wWrongThis = 0;
    /** Số lần đàn sai trong cả lượt (micro nghe sai / chạm sai phím ảo) — cho "Lặp 3 lần đúng" */
    let wWrongPass = 0;
    /** (+ 2026-10-09) Số lần liền micro chưa nghe đủ hai tay ở nhóm đang chờ (≥ 3 → nút "👪 Bố mẹ: tiếp" nổi bật) */
    let wHandFails = 0;
    function startWait(): void {
      token++;
      state = 'playing';
      wIdx = 0;
      wHits = 0;
      wWrongThis = 0;
      wWrongPass = 0;
      parentRun = false;
      missByMeasure.clear();
      wLog = [];
      wHands = [];
      wHandFails = 0;
      lastHands = null;
      review = null;
      staff.clearMarks();
      app.mic.resetTracker();
      if (!loop3) take.start();
      showWaitNote();
    }

    function showWaitNote(): void {
      const gs = groups();
      const g = gs[wIdx];
      if (!g) return finishWait();
      staff.setCursor(idxOf(g));
      lightOnset(g);
      honesty.step();
      status.replaceChildren(
        h('span', { class: 'song-progress' }, `${wIdx + 1}/${gs.length}`),
        ' ',
        loop3 ? streakDots() : '',
        loop3 ? ' ' : '',
        hints === 'staff' ? 'Nhìn khuông nhạc — nốt đang sáng' : `Đàn ${onsetLabel(g)}`,
        parentRun ? ' · 👪 Bố mẹ chấm giúp — đàn xong nốt thì bấm "Bố mẹ: tiếp"' : micOn() ? ' · 🎤' : '',
      );
      waitBar(g);
    }

    function waitBar(g: Onset): void {
      setBar(
        backButton(reset),
        hints !== 'full' ? button({ icon: '💡', label: 'Gợi ý', onTap: () => hint(g) }) : null,
        // Luôn có nút cho bố mẹ (kể cả khi micro bật) — phòng micro không nhận ra nốt; micro chưa nghe đủ hai tay 3 lần → nổi bật
        button({ icon: '👪', label: 'Bố mẹ: tiếp', kind: parentRun || wHandFails >= 3 ? 'primary' : 'good', onTap: () => onWaitInput(midisOf(g)[0], 'parent') }),
      );
    }

    function hint(g: Onset): void {
      lightOnset(g, true);
      status.textContent = `💡 ${onsetLabel(g)}`;
      const tk = token;
      void wait(1800).then(() => tk === token && hints !== 'full' && kb.setTargets([]));
    }

    function onWaitInput(midi: number, from: 'mic' | 'tap' | 'parent'): void {
      const g = groups()[wIdx];
      if (!g) return;
      const match = matchHeard(midi, midisOf(g));
      const log = (wLog[wIdx] ??= { wrong: 0 });
      if (match !== 'none') {
        log.via ??= from;
        // Bố mẹ bấm "tiếp" khi micro đang bật: không tính là micro nghe đúng
        if (wWrongThis === 0 && !(from === 'parent' && micOn())) wHits++;
        // Chấm hai tay: nhóm chưa có kết quả từng tay (một tay / bố mẹ cho qua / cách cũ) → ghi theo cả nhóm
        if (handsOn()) wHands[wIdx] ??= sameVerdict(g, from === 'parent' ? 'parent' : 'hit');
        wHandFails = 0;
        // Chỉ tô XANH khi app thật sự nghe / thấy bé đàn đúng; bố mẹ bấm "tiếp" → dấu "đã qua" trung tính
        for (const i of idxOf(g)) staff.mark(i, from === 'parent' ? 'parent' : 'hit');
        if (match === 'exact') kb.setResult(midiToPitch(midi), 'good');
        wIdx++;
        wWrongThis = 0;
        // Tập tách tay: app đàn khẽ các nốt tay kia từ nhóm này tới nhóm sau
        if (solo()) playOther(g.start, groups()[wIdx]?.start ?? Infinity, app.audio.now() + 0.02, 60 / bpm);
        if (from === 'mic') app.mic.resetTracker();
        showWaitNote();
      } else if (from === 'tap') {
        wWrongPass++;
        addMiss(g);
        log.wrong++;
        log.played ??= midi;
      } else if (from === 'mic') {
        // Nhiều nốt cùng lúc: micro hay nghe lẫn → không tính là sai, chỉ chỉ ra phím nghe được
        if (midisOf(g).length < 2) {
          wWrongThis++;
          wWrongPass++;
          addMiss(g);
          log.wrong++;
          log.played ??= midi;
        }
        const heard = midiToPitch(midi);
        kb.setResult(heard, 'heard');
        status.textContent = `🎤 Con vừa đàn ${viName(heard)} — tìm ${viName(g.pitches[0])} nhé`;
      }
    }

    function finishWait(): void {
      const total = groups().length;
      lastHands = handsOn() && groups().some(together) ? handsRun('wait', wHands.flat()) : null;
      if (loop3) return finishLoopPass(total);
      if (focus) return focusStepDone(wWrongPass === 0);
      review = makeReview(groups().map((g, i) => ({ g, ...waitOutcome(wLog[i], g.notes.map((n) => n.hand)) })));
      if (micOn() && !parentRun) {
        const s = total ? wHits / total : 0;
        record({ mode: 'wait', total, hits: wHits, source: 'mic', passed: s >= PASS_SCORE });
        take.stop();
        showResult(s, `Con đàn đúng ngay ${wHits}/${total} nốt${lastHands ? handsLine(lastHands) : ''}`);
      } else {
        // Micro nghe chưa rõ → bố mẹ chấm cả lượt (bản ghi vẫn giữ để Nghe lại / Album)
        if (micOn()) take.stop();
        else take.drop();
        askParent('Bé đã đàn hết bài chưa?', total);
      }
    }

    /** Hết một lượt của "Lặp 3 lần": sạch (không sai nốt nào) → +1, sai → về 0; đủ 3 → ăn mừng. */
    function finishLoopPass(total: number): void {
      const verdict = (clean: boolean) => {
        const v = loopStreak(streak, clean, LOOP_TARGET);
        streak = v.streak;
        if (v.done) {
          loop3 = false;
          return showResult(1, `🏆 Đúng ${LOOP_TARGET} lần liên tiếp — câu này con thuộc rồi!`);
        }
        state = 'rate';
        kb.setTargets([]);
        status.replaceChildren(
          streakDots(),
          ' ',
          h('b', {}, clean ? `✓ Đúng rồi! Còn ${LOOP_TARGET - streak} lần nữa nào!` : 'Gần được rồi — mình đàn lại từ đầu câu nhé!'),
        );
        setBar(backButton(reset));
        if (clean) void app.audio.chime();
        const tk = token;
        void wait(1600).then(() => {
          if (tk === token && loop3 && !disposed) startWait();
        });
      };
      if (micOn()) {
        const clean = wHits >= total && wWrongPass === 0;
        record({ mode: 'wait', total, hits: wHits, source: 'mic', passed: clean });
        return verdict(clean);
      }
      if (wWrongPass > 0) {
        record({ mode: 'wait', total, hits: 0, source: 'parent', passed: false });
        return verdict(false);
      }
      state = 'rate';
      status.replaceChildren(streakDots(), ' ', h('b', {}, '👪 Bố mẹ: bé đàn đúng hết, không sai nốt nào chứ?'));
      setBar(
        backButton(reset),
        button({
          icon: '✓',
          label: 'Đúng hết!',
          kind: 'good',
          onTap: () => {
            record({ mode: 'wait', total, hits: total, source: 'parent', passed: true });
            verdict(true);
          },
        }),
        button({
          icon: '↻',
          label: 'Có sai',
          kind: 'retry',
          onTap: () => {
            record({ mode: 'wait', total, hits: 0, source: 'parent', passed: false });
            verdict(false);
          },
        }),
      );
    }

    // ----- Theo nhịp -----
    function startTempo(): void {
      const tk = ++token;
      state = 'countin';
      staff.clearMarks();
      missByMeasure.clear();
      review = null;
      take.drop();
      const spb = 60 / bpm;
      const bpmM = beatsPerMeasure(tune);
      const lead = countInBeats(bpmM);
      const t0 = app.audio.now() + 0.4 + lead * spb; // phách 0 của bài
      const total = totalBeats(tune);
      // Giữ nhịp trong đầu: 2 ô giữa bài không có tiếng tích (cũng không nhạc đệm / tay kia)
      const drop = pulseWindow();
      lastDrop = drop;
      const muted = (b: number) => !!drop && b >= drop[0] - 1e-6 && b < drop[1] - 1e-6;
      // Tiếng "tích" nhấn mạnh ở phách 1 mỗi ô (2/4: mạnh–nhẹ, 3/4: mạnh–nhẹ–nhẹ, 4/4: mạnh–nhẹ–nhẹ–nhẹ;
      // 6/8: mạnh–nhẹ–nhẹ–VỪA–nhẹ–nhẹ — phách 4 nhấn phụ)
      for (let b = -lead; b < total; b++) if (!muted(b)) app.audio.click(t0 + b * spb, metronomeAccent(tune, b));
      scheduleAccomp(t0, spb, drop);
      // Tập tách tay: app đàn khẽ tay kia đúng nhịp
      if (solo()) playOther(0, Infinity, t0, spb, drop);
      const heard: HeardEvent[] = [];
      const gs = groups();
      const gradeInput = gs.map((g) => ({ index: g.notes[0].index, start: g.start, midi: midisOf(g) }));
      const markGroup = (firstIndex: number, m: 'hit' | 'miss') => {
        const g = gs.find((x) => x.notes[0].index === firstIndex);
        if (g) for (const i of idxOf(g)) staff.mark(i, m);
      };
      unTempo();
      // Bé đàn theo tiếng tích NGHE THẤY (trễ loa), tiếng đàn tới app trễ thêm (micro) → trừ độ trễ khứ hồi
      // đã đo ở "Thử micro → Đo độ trễ" (chưa đo: ước lượng outputLatency của trình duyệt như trước)
      const outLat = app.mic.inputOutputLatency();
      // (+ 2026-10-09) Chấm hai tay: nhóm hai tay chỉ tô xanh khi micro nghe đủ CẢ HAI tay (lần gõ → twoHand.ts)
      const useHands = handsOn();
      const handGroup = new Set(useHands ? gs.filter(together).map((g) => g.notes[0].index) : []);
      const unNote = app.mic.onNote((n) => {
        const at = n.at ?? app.audio.now() - MIC_LATENCY;
        heard.push({ beat: (at - outLat - t0) / spb, midi: n.midi });
        gradeTiming(gradeInput, heard, win.early, win.late).forEach((r) => r.hit && !handGroup.has(r.index) && markGroup(r.index, 'hit'));
      });
      /** Mỗi lần gõ: kiểm tra hai tay cho các nhóm hai tay có cửa sổ chấm chứa lần gõ (kết quả ~0,3 s sau) */
      const probes = new Map<number, HandsProbe[]>();
      const pendingHands: Array<Promise<void>> = [];
      const unOnset = useHands
        ? app.mic.onOnset((at) => {
            const beat = (at - outLat - t0) / spb;
            gs.forEach((g, gi) => {
              if (!handGroup.has(g.notes[0].index) || beat - g.start < -win.early || beat - g.start > win.late) return;
              pendingHands.push(
                app.mic.verifyHands(handSpec(g), at, true).then((r: HandsResult | null) => {
                  if (!r || tk !== token) return;
                  const pr: HandsProbe = { beat, conclusive: r.conclusive, RH: r.RH?.verdict, LH: r.LH?.verdict, heardRH: r.RH?.heard, heardLH: r.LH?.heard };
                  probes.set(gi, [...(probes.get(gi) ?? []), pr]);
                  if (r.conclusive && r.RH?.verdict === 'hit' && r.LH?.verdict === 'hit') markGroup(g.notes[0].index, 'hit');
                }),
              );
            });
          })
        : () => undefined;
      unTempo = () => (unNote(), unOnset());
      app.mic.resetTracker();
      const countEl = h('div', { class: 'countin' });
      // Đếm to theo phần đếm vào: "1 – 2 – 3 – 4"
      status.replaceChildren(
        countEl,
        h('div', { class: 'countin-say' }, `Đếm to theo nhé! ${Array.from({ length: bpmM }, (_, k) => k + 1).join(' – ')}`),
      );
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: () => (unNote(), reset()) }));
      const playingLine = () => h('span', {}, micOn() ? '🎤 Đàn theo nhịp — app đang nghe' : '🎵 Đàn theo tiếng "tích"!');
      /** Đang hiện dòng "máy im" chưa (chỉ thay DOM khi đổi) */
      let silentShown = false;
      const loop = () => {
        if (tk !== token) return void unTempo();
        const beat = (app.audio.now() - t0) / spb;
        if (state === 'playing' && drop && muted(beat) !== silentShown) {
          silentShown = !silentShown;
          status.replaceChildren(
            silentShown ? h('span', { class: 'pulse-silent' }, '🤫 Máy im — con đếm thầm trong đầu, đàn tiếp nhé!') : playingLine(),
          );
        }
        if (beat < 0) {
          // Chỉ ghi khi số đếm đổi (ghi textContent mỗi khung hình = tính lại bố cục mỗi khung hình)
          const label = beat < -lead ? ' ' : String(countInLabel(beat, bpmM, lead));
          if (countEl.textContent !== label) countEl.textContent = label;
        } else {
          if (state === 'countin') {
            state = 'playing';
            take.start(); // hết đếm vào → bắt đầu ghi (chỉ khi micro bật)
            status.replaceChildren(playingLine());
          }
          follow(beat);
        }
        if (beat < total + 0.6) raf = requestAnimationFrame(loop);
        else {
          unTempo();
          // Chờ các lần kiểm tra hai tay còn dở (≤ 0,3 s) rồi mới chấm
          void Promise.all(pendingHands).then(() => {
            if (tk === token && !disposed) finishTempo(gradeInput, heard, markGroup, drop, bpmM, useHands ? probes : null);
          });
        }
      };
      raf = requestAnimationFrame(loop);
    }

    function finishTempo(
      gradeInput: Array<{ index: number; start: number; midi: number[] }>,
      heard: HeardEvent[],
      markGroup: (i: number, m: 'hit' | 'miss') => void,
      drop: [number, number] | null = null,
      bpmM = 4,
      probes: Map<number, HandsProbe[]> | null = null,
    ): void {
      kb.setTargets([]);
      lastHands = null;
      // (+ 2026-10-09) Chấm hai tay: kết quả từng tay của các nhóm hai tay (micro không kết luận được → giữ cách cũ)
      const handRes = new Map<number, HandNoteResult[]>();
      if (probes && micOn())
        groups().forEach((g, gi) => {
          if (!together(g)) return;
          const rs = gradeHandsTempo([{ beat: g.start, measure: g.notes[0].measure, parts: handParts(g) }], probes.get(gi) ?? [], win.early, win.late);
          if (!rs.some((x) => x.verdict === 'unknown')) handRes.set(gi, rs);
        });
      /** Kết quả "một cao độ" (gradeTiming); các nhóm hai tay thay bằng kết quả từng tay: đúng khi CẢ HAI tay đúng */
      const timingWithHands = () => {
        const v = gradeTiming(gradeInput, heard, win.early, win.late);
        for (const [gi, rs] of handRes) {
          const hit = rs.every((x) => x.verdict === 'hit');
          const offs = rs.map((x) => x.offset ?? 0);
          v[gi] = hit ? { index: v[gi].index, hit, offset: offs.reduce((a, b) => a + b, 0) / offs.length } : { index: v[gi].index, hit: false };
        }
        return v;
      };
      if (focus) {
        // 🎯 Luyện một chỗ: chỉ tô xanh/cam rồi sang bước sau (không ghi lượt, không hỏi bố mẹ)
        const v = micOn() ? timingWithHands() : null;
        v?.forEach((r) => markGroup(r.index, r.hit ? 'hit' : 'miss'));
        return focusStepDone(v ? scoreOf(v) >= PASS_SCORE : null);
      }
      if (micOn()) {
        const v = timingWithHands();
        v.forEach((r) => markGroup(r.index, r.hit ? 'hit' : 'miss'));
        const gs = groups();
        const tv: Array<Partial<Omit<NoteReview, 'notes' | 'start' | 'measure'>>> = analyzeTempo(gradeInput, heard, v, win);
        for (const [gi, rs] of handRes) {
          const res = Object.fromEntries(
            rs.map((x) => [x.hand, { verdict: x.verdict === 'hit' ? 'hit' : x.verdict === 'wrong' ? 'wrong' : 'miss', ...(x.heard !== undefined ? { heard: x.heard } : {}) }]),
          ) as Pick<HandsResult, 'RH' | 'LH'>;
          const hs = handsOutcome({ conclusive: true, ...res });
          for (const x of rs) if (hs?.[x.hand] && x.offset !== undefined) hs[x.hand]!.offset = x.offset;
          const wrong = rs.find((x) => x.verdict === 'wrong');
          tv[gi] = v[gi].hit
            ? { kind: 'ok', offset: v[gi].offset, ...(hs ? { hands: hs } : {}) }
            : { kind: wrong ? 'wrong' : 'missed', ...(wrong?.heard !== undefined ? { played: wrong.heard } : {}), ...(hs ? { hands: hs } : {}) };
        }
        review = makeReview(gs.map((g, i) => ({ g, ...tv[i] })));
        if (handRes.size)
          lastHands = handsRun(
            'tempo',
            gs.flatMap((g, i) => handRes.get(i) ?? sameVerdict(g, v[i].hit ? 'hit' : 'miss', v[i].hit ? v[i].offset : undefined)),
          );
        v.forEach((r) => !r.hit && addMiss(gs.find((g) => g.notes[0].index === r.index)));
        let s = scoreOf(v);
        const hits = v.filter((r) => r.hit).length;
        // Giữ nhịp trong đầu: chấm riêng các nốt trong 2 ô máy im. Là thử thách THÊM — lượt vẫn đạt nếu phần có tiếng
        // tích đạt (không để bé trượt tiêu chí tuần chỉ vì lúc máy im)
        const pv = drop ? gradePulseDrop(gradeInput, v, drop) : null;
        const passed = s >= PASS_SCORE || (!!pv && pv.held !== null && pv.outsideScore >= PASS_SCORE);
        if (passed) s = Math.max(s, pv?.outsideScore ?? 0);
        record({ mode: 'tempo', total: v.length, hits, source: 'mic', passed });
        take.stop();
        const pulse = pv ? pulseMessage(pv, bpmM) : '';
        const handTxt = lastHands ? handsLine(lastHands) : tune.lh ? ' (micro nghe một nốt mỗi lúc)' : '';
        showResult(s, `Đúng nhịp ${hits}/${v.length} nốt${handTxt}${pulse ? ` · ${pulse}` : ''}`);
      } else {
        take.drop();
        askParent(drop ? 'Bé giữ nhịp đều (cả lúc máy im) và đàn trọn bài chưa?' : 'Bé giữ nhịp đều và đàn trọn bài chưa?', gradeInput.length);
      }
    }

    // ----- Kết quả -----
    function record(r: Pick<SongRun, 'mode' | 'total' | 'hits' | 'source' | 'passed' | 'checklist'>): void {
      const sh = solo();
      // (+ 2026-10-09) Micro chấm hai tay → lưu thêm số nốt đúng của từng tay (trường tùy chọn)
      const hs = r.source === 'mic' && lastHands ? { hands: { RH: lastHands.RH, LH: lastHands.LH } } : {};
      hooks.onRun({ songId: full.id, ...r, level: r.mode === 'tempo' ? level : undefined, bpm, hints: hints, phrase, ...(sh ? { hand: sh } : {}), ...hs });
    }

    /**
     * v5 — Không micro: bố mẹ chấm 3 ý (Đúng nốt · Đều nhịp · Đúng ngón & dáng tay) → SongRun.checklist;
     * lượt "đạt" khi cả 3 đều được tích (OWNER duyệt 2026-10-05).
     * v5.1 — Chế độ "Từng nốt" (chờ): app chờ bé nên không chấm nhịp → chỉ 2 ý; checklist vẫn đủ 3 khoá với
     * `beat: true` (không áp dụng = không trừ) để lessonEngine (notes && beat && fingers) giữ nguyên.
     */
    function askParent(question: string, total: number): void {
      state = 'rate';
      const waitMode = mode === 'wait';
      const items: ReadonlyArray<CheckItem<'notes' | 'beat' | 'fingers'>> = waitMode ? SONG_CHECKS_WAIT : SONG_CHECKS;
      const { row, done } = parentChecklist(items, (v, all) => {
        const checklist = { notes: !!v.notes, beat: waitMode ? true : !!v.beat, fingers: !!v.fingers };
        record({ mode, total, hits: checklist.notes ? total : 0, source: 'parent', passed: all, checklist });
        // Lượt có 2 ô máy im mà bố mẹ tích "đều nhịp" → khen giữ nhịp trong đầu
        const heldPulse = mode === 'tempo' && !!lastDrop && checklist.beat;
        if (all) return showResult(1, heldPulse ? 'Bố mẹ khen con đàn tốt! Con giữ nhịp trong đầu giỏi lắm! 🧠🥁' : 'Bố mẹ khen con đàn tốt!');
        const miss = items.filter((c) => !v[c.key]).map((c) => c.label.toLowerCase());
        showResult(0.5, `Lần sau mình chú ý thêm: ${miss.join(', ')} nhé!`);
      });
      status.replaceChildren(h('div', { class: 'pcheck-ask' }, h('b', {}, `👪 Bố mẹ: ${question} Chạm các ý bé làm được:`), row));
      setBar(backButton(reset), done);
    }

    function showResult(s: number, text: string, back: (ResultBack & { practiced: boolean; clean: boolean | null }) | null = null): void {
      state = 'result';
      const stars = starsFor(s);
      const passedNow = s >= PASS_SCORE;
      // Quay về từ "🎯 Luyện ngay chỗ này": vẽ lại màn kết quả cũ, không chúc mừng / đọc / lưu Album lần nữa
      if (passedNow && !back) {
        void app.audio.chime();
        confetti();
      }
      if (opts.stage && !back) app.audio.applause();
      // Nhận xét kiểu thầy giáo: MỘT lời nhắn chính + màu từng nốt (không ở sân khấu)
      const rv = back ? back.review : !opts.stage && reviewUsable(review) ? review : null;
      const pointKey = `${full.id}|${phrase?.join('-') ?? ''}|${handSel}|${mode}`;
      const point = back ? back.point : rv ? teach(rv, lastPoint?.key === pointKey ? lastPoint.point : null) : null;
      if (!back && point) lastPoint = { key: pointKey, point };
      if (rv) showReview(rv, point);
      const focusRange = point?.focus && rv && !opts.stage && !hardBack ? point.focus : null;
      const place = focusRange && rv ? placeLabel(rv, focusRange) : '';
      const afterPractice = back?.practiced ? `Luyện xong ${place.toLowerCase()}! Giờ chơi lại ${phrase ? 'nhé' : 'cả bài nhé'}!` : '';
      // Thang tốc độ: đạt ở tốc độ chậm → gợi ý lên nấc tiếp (40 → 50 → 60 → 72)
      const nextTempo = TEMPOS.find((t) => t > bpm);
      // Thầy nhắc một chỗ cần sửa → luyện chỗ đó trước ("🎯"), chưa gợi ý nhanh hơn (thanh nút tối đa 4 nút)
      const faster = !opts.stage && mode === 'tempo' && passedNow && !(focusRange && point && !point.praise) ? nextTempo : undefined;
      // Lặp câu khó: chỉ khi vừa chơi CẢ bài có lỗi (thanh nút tối đa 4 nút → nhường chỗ cho "Nhanh hơn")
      // (2026-10-09) Thầy đã chỉ ra chỗ cần luyện → "🎯 Luyện ngay chỗ này" thay cho "Lặp câu khó"
      const hard = !focusRange && !opts.stage && !opts.review && !phrase && !faster ? hardestPhrase(phraseRanges(full), missByMeasure) : null;
      // Chưa đạt (không phải sân khấu): Bé Nốt suy nghĩ + MỘT lời nhắn to, rõ + MỘT nút chính (Lặp câu khó / Chơi lại)
      const retryCard = !passedNow && !opts.stage;
      const headline = retryCard ? 'Gần được rồi! 💪' : passedNow ? pick(['Tuyệt vời! 🎉', 'Siêu quá! 🦸', 'Đỉnh của chóp! 🚀']) : 'Con đàn xong rồi! 👏';
      const nextStep = afterPractice
        ? afterPractice
        : point
          ? point.text
          : retryCard
            ? hard
              ? `Mình luyện câu ${hard.index + 1} — câu khó nhất — nhé!`
              : hardBack
                ? 'Mình lặp lại câu này nhé!'
                : 'Mình chơi lại thật chậm nhé!'
            : '';
      // 🎧 Nghe lại: ô trống, có bản ghi (tới sau, bất đồng bộ) thì take.render() điền nút + một câu hỏi nhẹ
      status.replaceChildren(
        h(
          'div',
          { class: `song-result${retryCard ? ' is-retry' : ' is-pass'}` },
          h('div', { class: `song-result-mascot ${retryCard ? 'react-scratch' : 'react-bounce'}` }, mascot(retryCard ? 'think' : 'cheer', 64)),
          h(
            'div',
            { class: 'song-lines' },
            h('div', { class: 'song-result-head' }, headline, ' ', h('span', { class: 'stars small' }, '★'.repeat(stars), h('span', { class: 'stars-off' }, '★'.repeat(3 - stars)))),
            h('div', { class: 'song-result-sub' }, text),
            nextStep
              ? h('div', { class: `song-result-next${point && !afterPractice ? ' teacher' : ''}` }, `${afterPractice ? '✅' : point ? '🧑‍🏫' : '👉'} ${nextStep}`)
              : null,
            take.makeSlot(),
          ),
        ),
      );
      take.render();
      // Album: chỉ lượt CẢ BÀI, hai tay như bài (không phải một câu / tách tay / lặp câu khó)
      if (!back) take.offerAlbum(!phrase && !solo() && !hardBack ? { stars, accuracy: s } : null);
      if (back) {
        if (afterPractice) void speak(app, afterPractice);
      } else if (retryCard) void speak(app, `Gần được rồi! ${nextStep}`);
      else if (point) void speak(app, point.text);
      const again = button({
        icon: '↻',
        label: hardBack ? 'Lặp lại' : 'Chơi lại',
        kind: (retryCard && !hard && !focusRange) || back ? 'primary' : undefined,
        onTap: reset,
      });
      const practice =
        focusRange && rv && point && !faster
          ? button({
              icon: '🎯',
              label: back ? 'Luyện lại chỗ này' : 'Luyện ngay chỗ này',
              kind: retryCard && !back ? 'primary' : undefined,
              onTap: () => startFocus({ s, text, mode, phrase, bpm, review: rv, point }, focusRange, place),
            })
          : null;
      practice?.classList.add('btn-focus');
      setBar(
        opts.stage ? null : backButton(() => hooks.onBack()),
        opts.stage ? null : again,
        faster ? button({ icon: '🐇', label: `Nhanh hơn (${faster})`, onTap: () => ((bpm = faster), reset()) }) : null,
        hard ? button({ icon: '🔁', label: 'Lặp câu khó', kind: 'primary', onTap: () => openHard(hard.range) }) : null,
        practice,
        hardBack ? button({ icon: '↩', label: 'Cả bài', onTap: () => ((phrase = hardBack?.phrase ?? null), reset()) }) : null,
        // Chưa đạt: "Tiếp" vẫn có (không khóa bé) nhưng là nút phụ — nút chính là luyện lại
        hardBack ? null : button({ icon: '▶', label: 'Tiếp', kind: retryCard || back ? undefined : 'primary', onTap: hooks.onDone }),
      );
    }

    // ---------------- (+ 2026-10-09) Nhận xét kiểu thầy giáo ----------------

    /** Nhận xét từng nhóm nốt của lượt đang mở (bài / câu đang chơi) */
    function makeReview(items: Array<{ g: Onset } & Partial<Omit<NoteReview, 'notes' | 'start' | 'measure'>>>): RunReview {
      return {
        mode,
        beatsPerMeasure: beatsPerMeasure(tune),
        phrases: phraseRanges(tune),
        measureOffset: phrase ? phrase[0] : 0,
        hints,
        notes: items.map(({ g, ...r }) => ({
          kind: 'ok',
          ...r,
          notes: g.notes.map((n) => ({ index: n.index, hand: n.hand, midi: pitchesOf(n).map(pitchToMidi), beats: n.beats, finger: n.finger })),
          start: g.start,
          measure: g.notes[0].measure,
        })),
      };
    }

    /**
     * Màn kết quả: khuông (từng trang) tô màu từng nốt — xanh đúng · đỏ nhầm (+ tên nốt con đàn) · xám rỗng sót ·
     * cam sớm/muộn (← / →); bài hai tay có kết quả riêng tay thì tô theo tay. Mở sẵn trang có chỗ thầy nhắc.
     */
    function showReview(rv: RunReview, point: TeacherPoint | null): void {
      buildStaff(true);
      const marks = new Map<number, ReviewMark>();
      const short = (midi: number) => viName(midiToPitch(midi)).replace(' thăng', '♯').replace(' giáng', '♭');
      for (const n of rv.notes) {
        for (const x of n.notes) {
          const o = outcomeOf(n, x.hand);
          const tag = o.kind === 'wrong' && o.played !== undefined ? short(o.played) : o.kind === 'early' ? '←' : o.kind === 'late' ? '→' : undefined;
          marks.set(x.index, { kind: o.kind, tag });
        }
      }
      staff.setReview(marks);
      staff.clearMarks();
      const firstBad = rv.notes.find((n) => n.kind !== 'ok' && n.kind !== 'helped')?.measure;
      staff.showMeasure(point?.focus?.[0] ?? firstBad ?? 0);
      const kinds = kindsPresent(rv);
      const pages = staff.pageCount();
      if (kinds.length < 2 && pages < 2) return;
      const pageLabel = h('span', { class: 'rv-page' }, '');
      const setLabel = () => (pageLabel.textContent = `${staff.currentPage() + 1}/${pages}`);
      const turn = (d: number) =>
        h(
          'button',
          { class: 'rv-turn', type: 'button', 'aria-label': d < 0 ? 'Trang trước' : 'Trang sau', onClick: () => (staff.turnPage(d), setLabel()) },
          d < 0 ? '‹' : '›',
        );
      setLabel();
      staff.el.classList.add('rv-on');
      staff.el.append(
        h(
          'div',
          { class: 'rv-row' },
          h('div', { class: 'rv-legend' }, ...(kinds.length > 1 ? kinds.map((k) => h('span', { class: `rv-key rv-${k}` }, h('i', {}), KIND_LABEL[k])) : [])),
          pages > 1 ? h('div', { class: 'rv-nav' }, turn(-1), pageLabel, turn(1)) : null,
        ),
      );
    }

    /** "🎯 Luyện ngay chỗ này": chỗ `local` (ô nhịp của lượt) — chậm trước, rồi đúng tốc độ — xong quay về kết quả */
    function startFocus(back: ResultBack, local: [number, number], place: string): void {
      cancelSpeech();
      const off = back.phrase ? back.phrase[0] : 0;
      focus = { steps: focusPlan(back.mode, back.bpm, TEMPOS), i: 0, range: [local[0] + off, local[1] + off], place, back, note: '', clean: null };
      take.hold(true); // giữ "🎧 Nghe lại" của lượt chính
      applyFocusStep();
    }

    function applyFocusStep(): void {
      const st = focus!.steps[focus!.i];
      mode = st.mode;
      bpm = st.bpm;
      phrase = focus!.range;
      reset();
    }

    /** Màn chờ của một bước luyện (reset() gọi khi đang luyện) */
    function focusIdle(): void {
      const f = focus!;
      const st = f.steps[f.i];
      const slow = f.i === 0 && f.steps.length > 1;
      const what =
        st.kind === 'demo'
          ? '🐢 Nghe thầy đàn chậm — nhìn ngón tay nhé'
          : st.mode === 'tempo'
            ? slow
              ? `🐢 Đàn chậm (tốc độ ${st.bpm}) — đếm vào rồi đàn theo tiếng tích`
              : `🐇 Giờ đàn đúng tốc độ ${st.bpm} nhé!`
            : '🎹 Giờ con đàn từng nốt chỗ này nhé!';
      status.replaceChildren(
        h(
          'div',
          { class: 'song-lines focus-lines' },
          h('b', {}, `🎯 Luyện ${f.place.toLowerCase()} · bước ${f.i + 1}/${f.steps.length}`),
          h('span', {}, f.note ? `${f.note} ` : '', what),
          h('span', { class: 'focus-point' }, `🧑‍🏫 ${f.back.point.text}`),
        ),
      );
      setBar(
        button({ icon: '↩', label: 'Về kết quả', onTap: () => endFocus(false) }),
        st.kind === 'demo'
          ? button({ icon: '🎬', label: 'Xem thầy đàn chậm', kind: 'primary', onTap: () => void demo(focusStepDone) })
          : button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void start() }),
      );
    }

    /** Xong một bước luyện: sang bước sau, hoặc quay về màn kết quả */
    function focusStepDone(clean: boolean | null = null): void {
      const f = focus;
      if (!f) return;
      const prev = f.steps[f.i];
      f.i++;
      if (clean !== null) f.clean = clean;
      if (f.i >= f.steps.length) return endFocus(true);
      if (clean) void app.audio.chime();
      f.note = prev.kind === 'demo' ? '✓ Xem xong rồi!' : clean === false ? '👍 Tốt lắm, thêm lần nữa nào!' : '✓ Xong lượt chậm!';
      applyFocusStep();
    }

    /** Thôi luyện (xong hoặc bấm "Về kết quả") → màn kết quả cũ (vẫn Nghe lại được) */
    function endFocus(done: boolean): void {
      const f = focus;
      if (!f) return;
      focus = null;
      halt();
      overlay.hide();
      app.audio.stopAll();
      kb.clear();
      kb.setTargets([]);
      mode = f.back.mode;
      phrase = f.back.phrase;
      bpm = f.back.bpm;
      head.render({ handSel, mode, phrase, hints, level, bpm });
      take.hold(false);
      if (done && f.clean) void app.audio.chime();
      showResult(f.back.s, f.back.text, { ...f.back, practiced: done, clean: f.clean });
    }

    // Micro nghe được nốt (chế độ chờ)
    const unWaitNote = app.mic.onNote((n) => {
      if (state !== 'playing' || mode !== 'wait') return;
      honesty.heard(); // micro nghe ra nốt (đúng hay sai) → micro vẫn nghe được
      if (parentRun) return; // bố mẹ đang chấm giúp lượt này
      const g = groups()[wIdx];
      if (g && together(g) && handsOn()) {
        // Chấm hai tay: kiểm tra từ lần gõ (onOnset bên dưới); nốt nghe được chỉ để dự phòng khi không kết luận được
        lastHeard = { midi: n.midi, at: n.at ?? -1 };
        if (n.at !== undefined && n.at >= 0) onWaitHands(n.at);
      } else if (g && midisOf(g).length >= 2) onWaitChord(n.midi, n.at ?? -1);
      else onWaitInput(n.midi, 'mic');
    });
    // (+ 2026-10-09) Chấm hai tay (chế độ chờ): mỗi lần gõ phím ở nhóm hai tay → kiểm tra từng tay
    const unWaitOnset = app.mic.onOnset((at) => {
      if (state !== 'playing' || mode !== 'wait' || parentRun || !handsOn()) return;
      const g = groups()[wIdx];
      if (g && together(g)) onWaitHands(at);
    });
    /** Nốt micro nghe được gần nhất ở nhóm hai tay (dự phòng: kiểm tra hai tay không kết luận được → cách cũ) */
    let lastHeard: { midi: number; at: number } | null = null;
    /** Lần gõ đã hỏi kiểm tra hai tay (lần gõ + nốt nghe được của cùng lần gõ → chỉ hỏi một lần) */
    let handsAskedAt = -1;
    const HAND_VI: Record<Hand, string> = { RH: '🫱 Tay phải', LH: '🫲 Tay trái' };
    /** "Tay trái chưa nghe thấy Đô" / "Tay phải đàn Fa — cần Mi" */
    function handsMessage(g: Onset, r: HandsResult): string {
      const name = (m: number) => viName(midiToPitch(m));
      const parts = (['RH', 'LH'] as const).flatMap((hd) => {
        const c = r[hd];
        if (!c || c.verdict === 'hit') return [];
        const want = (c.missing.length ? c.missing : handMidis(g, hd)).map(name).join(', ');
        return [c.verdict === 'wrong' && c.heard !== undefined ? `${HAND_VI[hd]} đàn ${name(c.heard)} — cần ${want}` : `${HAND_VI[hd]} chưa nghe thấy ${want}`];
      });
      return `🎤 ${parts.join(' · ')} — đàn cùng lúc hai tay nhé${wHandFails >= 3 ? ' · 👪 Bố mẹ có thể bấm "tiếp"' : ''}`;
    }
    /**
     * Nhóm hai tay (chế độ chờ): hỏi micro từng tay ở lần gõ `at`. Đủ hai tay → đi tiếp; thiếu / nhầm → nói rõ tay nào;
     * không kết luận được (tiếng nhỏ / ồn) → cách cũ (kiểm hợp âm từ nốt nghe được).
     */
    function onWaitHands(at: number): void {
      if (Math.abs(at - handsAskedAt) < 0.12) return;
      handsAskedAt = at;
      const tk = token;
      const idx = wIdx;
      const g = groups()[idx];
      if (!g) return;
      const spec = handSpec(g);
      const stale = () => tk !== token || idx !== wIdx || state !== 'playing' || mode !== 'wait' || parentRun;
      void (async () => {
        // Khung sau (~160 ms): đủ hai tay thì đi tiếp ngay; thiếu → xem thêm khung muộn (một tay đàn trễ ~0,1 s)
        let r = await app.mic.verifyHands(spec, at, false);
        if (stale()) return;
        if (r?.conclusive && !(r.RH?.verdict === 'hit' && r.LH?.verdict === 'hit')) {
          r = await app.mic.verifyHands(spec, at, true);
          if (stale()) return;
        }
        if (!r || !r.conclusive) {
          if (lastHeard && lastHeard.at >= 0 && Math.abs(lastHeard.at - at) < 0.3) onWaitChord(lastHeard.midi, lastHeard.at);
          return;
        }
        const res = r;
        // Lần đàn ĐẦU của nhóm: kết quả từng tay (nhận xét sau bài + SongRun.hands)
        const log = (wLog[idx] ??= { wrong: 0 });
        log.hands ??= handsOutcome(res);
        wHands[idx] ??= handParts(g).map((p) => {
          const c = res[p.hand];
          return { ...p, beat: g.start, measure: g.notes[0].measure, together: true, verdict: c?.verdict ?? 'unknown', ...(c?.heard !== undefined ? { heard: c.heard } : {}) };
        });
        if (res.RH?.verdict === 'hit' && res.LH?.verdict === 'hit') {
          const first = !wHands[idx] || wHands[idx].every((x) => x.verdict === 'hit');
          onWaitInput(midisOf(g)[0], 'mic');
          // Đã cho đi tiếp (~160 ms). Xem kỹ thêm khung dài (~280 ms) — nhầm nửa cung ở nốt trầm / hợp âm tay trái chỉ
          // thấy ở khung dài: KHÔNG đổi điểm, chỉ ghi vào nhận xét sau bài (lần đàn đầu của nhóm)
          if (first)
            void app.mic.verifyHands(spec, at, true).then((r2) => {
              if (tk !== token || !r2?.conclusive) return;
              const bad = (['RH', 'LH'] as const).filter((hd) => r2[hd]?.verdict === 'wrong');
              if (!bad.length) return;
              const lg = (wLog[idx] ??= { wrong: 0 });
              lg.hands = handsOutcome(r2);
              wHands[idx] = handParts(g).map((p) => {
                const c = r2[p.hand];
                return { ...p, beat: g.start, measure: g.notes[0].measure, together: true, verdict: c?.verdict ?? 'unknown', ...(c?.heard !== undefined ? { heard: c.heard } : {}) };
              });
              addMiss(g);
            });
          return;
        }
        // Chưa đủ: không còn "đúng ngay"; nhầm phím = đàn sai (như nốt đơn), quên một tay thì chỉ nhắc
        wWrongThis++;
        wHandFails++;
        const wrongHand = (['RH', 'LH'] as const).find((hd) => res[hd]?.verdict === 'wrong');
        if (wrongHand) {
          wWrongPass++;
          addMiss(g);
          log.wrong++;
          log.played ??= res[wrongHand]!.heard;
        }
        for (const hd of ['RH', 'LH'] as const) {
          const c = res[hd];
          if (c?.verdict === 'hit') c.present.forEach((m) => kb.setResult(midiToPitch(m), 'good'));
          if (c?.heard !== undefined) kb.setResult(midiToPitch(c.heard), 'heard');
        }
        status.textContent = handsMessage(g, res);
        if (wHandFails === 3) waitBar(g);
      })();
    }
    /** Lần gõ phím đã hỏi kiểm tra hợp âm — một lần gõ có thể cho nhiều nốt nghe được */
    let chordAskedAt = -1;
    /**
     * Nhóm ≥ 2 nốt (hợp âm / hai tay): hỏi micro có ĐỦ các nốt không. Đủ → đúng; thiếu → nhắc nốt bị quên
     * (không tính là sai, như trước); không kết luận được (tiếng nhỏ / ồn) → cách cũ (onWaitInput / match.ts).
     */
    function onWaitChord(midi: number, at: number): void {
      if (at >= 0 && Math.abs(at - chordAskedAt) < 0.05) return;
      chordAskedAt = at;
      const tk = token;
      const idx = wIdx;
      const g = groups()[idx];
      void app.mic.verifyChord(midisOf(g), at >= 0 ? at : undefined).then((r) => {
        if (tk !== token || idx !== wIdx || state !== 'playing' || mode !== 'wait') return;
        if (!r || !r.conclusive) return onWaitInput(midi, 'mic');
        if (r.missing.length === 0) return onWaitInput(midisOf(g)[0], 'mic');
        r.present.forEach((m) => kb.setResult(midiToPitch(m), 'good'));
        // Nhận xét: lần đàn ĐẦU của nhóm thiếu nốt tay nào (bài hai tay → "Tay trái chưa vào cùng tay phải")
        const log = (wLog[idx] ??= { wrong: 0 });
        log.missingHands ??= [
          ...new Set(r.missing.flatMap((m) => g.notes.filter((n) => pitchesOf(n).some((p) => pitchToMidi(p) === m)).map((n) => n.hand))),
        ];
        const names = r.missing.map((m) => viName(midiToPitch(m))).join(', ');
        status.textContent = `🎤 Con quên nốt ${names} — đàn cùng lúc cả ${midisOf(g).length} nốt nhé`;
      });
    }

    // opts.loop + opts.phrase ("▶ Làm ngay" của bố mẹ): mở thẳng chế độ "🔁 Lặp 3 lần đúng" của câu đó
    // (giống "Lặp câu khó": nút chính = Lặp, nút phụ = "↩ Cả bài"; bé chạm Lặp = thao tác bật micro)
    if (opts.loop && opts.phrase && !opts.stage) {
      mode = 'wait';
      hardBack = { mode: 'wait', phrase: null, range: opts.phrase };
    }
    reset();
    // v5.1: lời dẫn dài chỉ hiện một dòng → đọc to cả câu một lần khi mở màn
    const introFull = opts.intro?.trim() ?? '';
    const introSpoken = !!introFull && showIntroFor(phrase) && shortIntro(introFull) !== introFull;
    const introTimer = introSpoken ? window.setTimeout(() => !disposed && state === 'idle' && void speak(app, introFull), 400) : 0;
    return () => {
      disposed = true;
      window.clearTimeout(introTimer);
      cancelSpeech();
      take.drop();
      halt();
      unWaitNote();
      unWaitOnset();
      honesty.dispose();
      overlay.destroy();
      kb.destroy();
    };
  };
}
