import { wait } from '../../audio/AudioEngine';
import { matchHeard } from '../../audio/match';
import { confetti } from '../components/celebrate';
import { PASS_SCORE, TIMING_WINDOWS, countInBeats, countInLabel, gradeTiming, loopStreak, score as scoreOf, starsFor, type HeardEvent } from '../../music/timing';
import {
  DYN_VOLUME,
  accompaniment,
  beatsPerMeasure,
  dynAtBeat,
  handOnsets,
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
import { songEverPlayed } from '../../lessons/lessonEngine';
import { mascot } from '../components/mascot';
import '../../styles/pedagogy.css';
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
    /** Bài MỚI (chưa chơi lượt nào): nhắc hát tên nốt theo thầy khi xem mẫu */
    const firstTime =
      !full.id.startsWith('sight') && !songEverPlayed(app.store.get(), full.id);
    let tune = full;
    /** Lời dẫn của bài học: cả bài, bước ôn, hoặc ĐÚNG câu bài học mở sẵn (opts.phrase — tập tách tay một câu khó) */
    const showIntroFor = (p: [number, number] | null): boolean =>
      !p || !!opts.review || (!!opts.phrase && p[0] === opts.phrase[0] && p[1] === opts.phrase[1]);
    let state: State = 'idle';
    let token = 0;
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
      canEdit: () => state === 'idle' || state === 'result',
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
    /** Bỏ nghe micro của lượt "theo nhịp" đang chạy (gọi khi dừng / rời màn) */
    let unTempo: () => void = () => undefined;
    const setBar = (...b: (HTMLElement | null | false)[]) =>
      bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    // 🎧 Nghe lại con đàn (chỉ khi micro bật; chỉ trong bộ nhớ)
    const take = new TakeReplay({ mic: app.mic, micOn, showing: () => state === 'result', disposed: () => disposed });

    function buildStaff(): void {
      tune = phrase ? slice(full, phrase[0], phrase[1]) : full;
      staff = new StaffView(tune, {
        names: hints !== 'staff',
        fingers: hints === 'full',
        mode: mode === 'tempo' && level === 3 ? 'scroll' : 'page',
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
    function playOther(fromBeat: number, toBeat: number, t0: number, spb: number): void {
      if (micOn()) return; // micro bật: tiếng app đàn sẽ lẫn vào tiếng bé
      for (const n of otherHandNotes(tune, solo())) {
        if (n.start < fromBeat - 1e-6 || n.start >= toBeat - 1e-6) continue;
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
      take.drop();
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
      const sh = solo();
      // v5.1: lời dẫn chỉ MỘT dòng ngắn trên màn; câu dài → app đọc to (🔊 nghe lại)
      const intro = opts.intro && showIntroFor(phrase) && !hardBack ? opts.intro.trim() : '';
      const introShort = intro ? shortIntro(intro) : '';
      status.replaceChildren(
        h(
          'div',
          { class: 'song-lines' },
          intro
            ? h('div', { class: 'song-intro' }, h('span', { class: 'song-intro-text' }, introShort), introShort !== intro ? speakChip(app, intro) : null)
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
              : `Đếm vào rồi đàn theo tiếng "tích" (${bpm} nhịp/phút).`,
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
    async function demo(): Promise<void> {
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
      if (tk === token) reset();
    }

    function scheduleAccomp(t0: number, spb: number): void {
      if (!settings.accompaniment || micOn()) return;
      for (const a of accompaniment(tune)) {
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
    function startWait(): void {
      token++;
      state = 'playing';
      wIdx = 0;
      wHits = 0;
      wWrongThis = 0;
      wWrongPass = 0;
      missByMeasure.clear();
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
      status.replaceChildren(
        h('span', { class: 'song-progress' }, `${wIdx + 1}/${gs.length}`),
        ' ',
        loop3 ? streakDots() : '',
        loop3 ? ' ' : '',
        hints === 'staff' ? 'Nhìn khuông nhạc — nốt đang sáng' : `Đàn ${onsetLabel(g)}`,
        micOn() ? ' · 🎤' : '',
      );
      setBar(
        backButton(reset),
        hints !== 'full' ? button({ icon: '💡', label: 'Gợi ý', onTap: () => hint(g) }) : null,
        // Luôn có nút cho bố mẹ (kể cả khi micro bật) — phòng micro không nhận ra nốt
        button({ icon: '👪', label: 'Bố mẹ: tiếp', kind: 'good', onTap: () => onWaitInput(midisOf(g)[0], 'parent') }),
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
      if (match !== 'none') {
        // Bố mẹ bấm "tiếp" khi micro đang bật: không tính là micro nghe đúng
        if (wWrongThis === 0 && !(from === 'parent' && micOn())) wHits++;
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
      } else if (from === 'mic') {
        // Nhiều nốt cùng lúc: micro hay nghe lẫn → không tính là sai, chỉ chỉ ra phím nghe được
        if (midisOf(g).length < 2) {
          wWrongThis++;
          wWrongPass++;
          addMiss(g);
        }
        const heard = midiToPitch(midi);
        kb.setResult(heard, 'heard');
        status.textContent = `🎤 Con vừa đàn ${viName(heard)} — tìm ${viName(g.pitches[0])} nhé`;
      }
    }

    function finishWait(): void {
      const total = groups().length;
      if (loop3) return finishLoopPass(total);
      if (micOn()) {
        const s = total ? wHits / total : 0;
        record({ mode: 'wait', total, hits: wHits, source: 'mic', passed: s >= PASS_SCORE });
        take.stop();
        showResult(s, `Con đàn đúng ngay ${wHits}/${total} nốt`);
      } else {
        take.drop();
        askParent('Con đã đàn hết bài chưa?', total);
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
      status.replaceChildren(streakDots(), ' ', h('b', {}, '👪 Bố mẹ: con đàn đúng hết, không sai nốt nào chứ?'));
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
      take.drop();
      const spb = 60 / bpm;
      const bpmM = beatsPerMeasure(tune);
      const lead = countInBeats(bpmM);
      const t0 = app.audio.now() + 0.4 + lead * spb; // phách 0 của bài
      const total = totalBeats(tune);
      // Tiếng "tích" nhấn mạnh ở phách 1 mỗi ô (2/4: mạnh–nhẹ, 3/4: mạnh–nhẹ–nhẹ, 4/4: mạnh–nhẹ–nhẹ–nhẹ)
      for (let b = -lead; b < total; b++) app.audio.click(t0 + b * spb, ((b % bpmM) + bpmM) % bpmM === 0);
      scheduleAccomp(t0, spb);
      // Tập tách tay: app đàn khẽ tay kia đúng nhịp
      if (solo()) playOther(0, Infinity, t0, spb);
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
      const unNote = app.mic.onNote((n) => {
        const at = n.at ?? app.audio.now() - MIC_LATENCY;
        heard.push({ beat: (at - outLat - t0) / spb, midi: n.midi });
        gradeTiming(gradeInput, heard, win.early, win.late).forEach((r) => r.hit && markGroup(r.index, 'hit'));
      });
      unTempo = unNote;
      app.mic.resetTracker();
      const countEl = h('div', { class: 'countin' });
      // Đếm to theo phần đếm vào: "1 – 2 – 3 – 4"
      status.replaceChildren(
        countEl,
        h('div', { class: 'countin-say' }, `Đếm to theo nhé! ${Array.from({ length: bpmM }, (_, k) => k + 1).join(' – ')}`),
      );
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: () => (unNote(), reset()) }));
      const loop = () => {
        if (tk !== token) return void unNote();
        const beat = (app.audio.now() - t0) / spb;
        if (beat < 0) {
          // Chỉ ghi khi số đếm đổi (ghi textContent mỗi khung hình = tính lại bố cục mỗi khung hình)
          const label = beat < -lead ? ' ' : String(countInLabel(beat, bpmM, lead));
          if (countEl.textContent !== label) countEl.textContent = label;
        } else {
          if (state === 'countin') {
            state = 'playing';
            take.start(); // hết đếm vào → bắt đầu ghi (chỉ khi micro bật)
            status.replaceChildren(h('span', {}, micOn() ? '🎤 Đàn theo nhịp — app đang nghe' : '🎵 Đàn theo tiếng "tích"!'));
          }
          follow(beat);
        }
        if (beat < total + 0.6) raf = requestAnimationFrame(loop);
        else {
          unNote();
          finishTempo(gradeInput, heard, markGroup);
        }
      };
      raf = requestAnimationFrame(loop);
    }

    function finishTempo(
      gradeInput: Array<{ index: number; start: number; midi: number[] }>,
      heard: HeardEvent[],
      markGroup: (i: number, m: 'hit' | 'miss') => void,
    ): void {
      kb.setTargets([]);
      if (micOn()) {
        const v = gradeTiming(gradeInput, heard, win.early, win.late);
        v.forEach((r) => markGroup(r.index, r.hit ? 'hit' : 'miss'));
        const gs = groups();
        v.forEach((r) => !r.hit && addMiss(gs.find((g) => g.notes[0].index === r.index)));
        const s = scoreOf(v);
        const hits = v.filter((r) => r.hit).length;
        record({ mode: 'tempo', total: v.length, hits, source: 'mic', passed: s >= PASS_SCORE });
        take.stop();
        showResult(s, `Đúng nhịp ${hits}/${v.length} nốt${tune.lh ? ' (micro nghe một nốt mỗi lúc)' : ''}`);
      } else {
        take.drop();
        askParent('Con giữ nhịp đều và đàn trọn bài chưa?', gradeInput.length);
      }
    }

    // ----- Kết quả -----
    function record(r: Pick<SongRun, 'mode' | 'total' | 'hits' | 'source' | 'passed' | 'checklist'>): void {
      const sh = solo();
      hooks.onRun({ songId: full.id, ...r, level: r.mode === 'tempo' ? level : undefined, bpm, hints: hints, phrase, ...(sh ? { hand: sh } : {}) });
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
        if (all) return showResult(1, 'Bố mẹ khen con đàn tốt!');
        const miss = items.filter((c) => !v[c.key]).map((c) => c.label.toLowerCase());
        showResult(0.5, `Lần sau mình chú ý thêm: ${miss.join(', ')} nhé!`);
      });
      status.replaceChildren(h('div', { class: 'pcheck-ask' }, h('b', {}, `👪 Bố mẹ: ${question} Chạm các ý con làm được:`), row));
      setBar(backButton(reset), done);
    }

    function showResult(s: number, text: string): void {
      state = 'result';
      const stars = starsFor(s);
      const passedNow = s >= PASS_SCORE;
      if (passedNow) {
        void app.audio.chime();
        confetti();
      }
      if (opts.stage) app.audio.applause();
      // Thang tốc độ: đạt ở tốc độ chậm → gợi ý lên nấc tiếp (40 → 50 → 60 → 72)
      const nextTempo = TEMPOS.find((t) => t > bpm);
      const faster = !opts.stage && mode === 'tempo' && passedNow ? nextTempo : undefined;
      // Lặp câu khó: chỉ khi vừa chơi CẢ bài có lỗi (thanh nút tối đa 4 nút → nhường chỗ cho "Nhanh hơn")
      const hard = !opts.stage && !opts.review && !phrase && !faster ? hardestPhrase(phraseRanges(full), missByMeasure) : null;
      // Chưa đạt (không phải sân khấu): Bé Nốt suy nghĩ + MỘT lời nhắn to, rõ + MỘT nút chính (Lặp câu khó / Chơi lại)
      const retryCard = !passedNow && !opts.stage;
      const headline = retryCard ? 'Gần được rồi! 💪' : passedNow ? pick(['Tuyệt vời! 🎉', 'Siêu quá! 🦸', 'Đỉnh của chóp! 🚀']) : 'Con đàn xong rồi! 👏';
      const nextStep = retryCard
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
            nextStep ? h('div', { class: 'song-result-next' }, `👉 ${nextStep}`) : null,
            take.makeSlot(),
          ),
        ),
      );
      take.render();
      if (retryCard) void speak(app, `Gần được rồi! ${nextStep}`);
      const again = button({
        icon: '↻',
        label: hardBack ? 'Lặp lại' : 'Chơi lại',
        kind: retryCard && !hard ? 'primary' : undefined,
        onTap: reset,
      });
      setBar(
        opts.stage ? null : backButton(() => hooks.onBack()),
        opts.stage ? null : again,
        faster ? button({ icon: '🐇', label: `Nhanh hơn (${faster})`, onTap: () => ((bpm = faster), reset()) }) : null,
        hard ? button({ icon: '🔁', label: 'Lặp câu khó', kind: 'primary', onTap: () => openHard(hard.range) }) : null,
        hardBack ? button({ icon: '↩', label: 'Cả bài', onTap: () => ((phrase = hardBack?.phrase ?? null), reset()) }) : null,
        // Chưa đạt: "Tiếp" vẫn có (không khóa bé) nhưng là nút phụ — nút chính là luyện lại
        hardBack ? null : button({ icon: '▶', label: 'Tiếp', kind: retryCard ? undefined : 'primary', onTap: hooks.onDone }),
      );
    }

    // Micro nghe được nốt (chế độ chờ)
    const unWaitNote = app.mic.onNote((n) => {
      if (state !== 'playing' || mode !== 'wait') return;
      const g = groups()[wIdx];
      if (g && midisOf(g).length >= 2) onWaitChord(n.midi, n.at ?? -1);
      else onWaitInput(n.midi, 'mic');
    });
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
      overlay.destroy();
      kb.destroy();
    };
  };
}
