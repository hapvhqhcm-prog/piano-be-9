import { TIMING_WINDOWS } from '../../music/timing';
import { phraseRanges, tuneRange, type Tune } from '../../music/tune';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { pitchToMidi } from '../../piano/pitchTable';
import type { StaffView } from '../components/staffView';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { HandOverlay, eventsFromTune, playDemo } from '../components/demo';
import { speakChip } from '../components/speakChip';
import { cancelSpeech, speak } from '../../audio/voice';
import { SongHead, type SongChoices } from './songHead';
import { LOOP_TARGET, fingerMap, idxOf, midisOf, shortIntro, type HandSel, type SongOptions } from './songShared';
import { TakeReplay } from './songTake';
import { MicHonestyWatch, micHonestyBox } from '../components/micHonesty';
import { songEverPlayed } from '../../lessons/lessonEngine';
import { buildStaff, groupAt, groups, halt, handsOn, lightOnset, micOn, pulseWindow, scheduleAccomp, setBar, solo, together, type SongCtx, type SongHooks } from './songState';
import { onWaitChord, onWaitHands, onWaitInput, showWaitNote, startWait } from './songWait';
import { startTempo } from './songTempo';
import { focusIdle, startFocus } from './songFocus';
import '../../styles/pedagogy.css';
import '../../styles/teacher.css';
import '../../styles/kidux.css';

// Giữ nguyên API cũ (tests/ui-v51.test.ts, library/session/stage import từ './song')
export { hardestPhrase, shortIntro, type SongOptions } from './songShared';
export type { SongHooks } from './songState';

/**
 * Màn bài hát kiểu "app nghe đàn":
 * - Từng nốt (chờ): con trỏ chờ bé đàn đúng (micro) hoặc bấm "Nốt tiếp". Bài hai tay đi theo từng nhóm nốt cùng lúc.
 * - Theo nhịp: đếm vào, máy gõ nhịp + nhạc đệm; Mức 2 con trỏ nhảy, Mức 3 băng chuyền.
 * Đầu trang: songHead.ts · 🎧 Nghe lại: songTake.ts · hàm thuần / hằng số: songShared.ts.
 * Trạng thái dùng chung: songState.ts · Từng nốt: songWait.ts · Theo nhịp: songTempo.ts · Kết quả + nhận xét:
 * songResult.ts · 🎯 Luyện ngay chỗ này: songFocus.ts. File này: dựng màn, màn chờ, xem mẫu, bắt đầu, micro.
 */
export function songScreen(app: App, full: Tune, opts: SongOptions, hooks: SongHooks) {
  return (root: HTMLElement) => {
    const settings = app.store.settings;
    // Độ khắt khe chấm nhịp (Cài đặt → mặc định "dễ")
    const win = TIMING_WINDOWS[settings.timing ?? 'easy'];
    const fmap = fingerMap(full);
    const [low, high] = tuneRange(full);
    // ---- v5 sư phạm ----
    /** Tập tách tay — chỉ bài hai tay (có bè lh) */
    const twoHand = !!full.lh;
    // v5.1: bài học chỉ định tập tách tay → mở sẵn tay đó (chip vẫn cho bé đổi)
    const handSel: HandSel = twoHand && opts.hand ? opts.hand : 'BOTH';
    /** Bài MỚI (chưa chơi lượt nào): nhắc hát tên nốt theo thầy khi xem mẫu */
    const firstTime =
      !full.id.startsWith('sight') && !songEverPlayed(app.store.get(), full.id);
    /** Lời dẫn của bài học: cả bài, bước ôn, hoặc ĐÚNG câu bài học mở sẵn (opts.phrase — tập tách tay một câu khó) */
    const showIntroFor = (p: [number, number] | null): boolean =>
      !p || !!opts.review || (!!opts.phrase && p[0] === opts.phrase[0] && p[1] === opts.phrase[1]);

    // `c` (trạng thái màn) dựng ngay bên dưới — các hàm gọi lại ở đây chỉ chạy sau khi màn đã dựng xong
    const kb = new PianoKeyboard({
      low,
      high,
      labels: opts.hints === 'full' ? 'c' : 'none',
      fingerOnPress: (p) => fmap.get(pitchToMidi(p)),
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (c.state === 'playing' && c.mode === 'wait' && !micOn(c)) onWaitInput(c, pitchToMidi(p), 'tap');
      },
    });

    const overlay = new HandOverlay(kb);
    const head = new SongHead({
      full,
      opts,
      canEdit: () => (c.state === 'idle' || c.state === 'result') && !c.focus,
      pick: (p: Partial<SongChoices>) => {
        if (p.handSel) c.handSel = p.handSel;
        if (p.mode) c.mode = p.mode;
        if ('phrase' in p) c.phrase = p.phrase ?? null;
        if (p.hints) c.hints = p.hints;
        if (p.level) c.level = p.level;
        if (p.bpm) c.bpm = p.bpm;
        reset();
      },
    });
    const staffBox = h('div', { class: `song-staff${full.lh ? ' grand' : ''}` });
    const status = h('div', { class: 'song-status', role: 'status', 'aria-live': 'polite' });
    const bar = h('div', { class: 'actions' });
    const screenEl = h('div', { class: 'screen' }, head.el, staffBox, status, h('div', { class: `keyboard-wrap song-kb${full.lh ? ' short' : ''}` }, kb.el), bar);
    root.append(screenEl);
    head.closeOnOutsideTap(screenEl);

    // 🎧 Nghe lại con đàn (chỉ khi micro bật; chỉ trong bộ nhớ)
    // (+ 2026-10-08) lượt cả bài hay nhất → "🎧 Album của con" (chỉ trên iPad này; không lưu bài đọc nhạc ngẫu nhiên)
    const take = new TakeReplay({
      mic: app.mic,
      micOn: () => micOn(c),
      showing: () => c.state === 'result',
      disposed: () => c.disposed,
      album: full.id.startsWith('sight') ? undefined : { songId: full.id, title: full.titleVi || full.title },
    });
    /**
     * (+ 2026-10-08) MICRO NÓI THẬT (chế độ chờ): bé có vẻ đang đàn mà micro không nhận ra nốt nào 3 lần liền →
     * "Micro nghe chưa rõ — không phải lỗi của con" + "👪 Bố mẹ chấm giúp" (cả lượt này chuyển sang bố mẹ chấm).
     */
    const honesty = new MicHonestyWatch(app.mic, {
      active: () => c.state === 'playing' && c.mode === 'wait' && micOn(c) && !c.parentRun && !c.loop3,
      onTrigger: () => {
        if (status.querySelector('.mic-honest')) return;
        status.append(
          micHonestyBox(() => {
            c.parentRun = true;
            showWaitNote(c);
          }),
        );
      },
    });

    const c: SongCtx = {
      app,
      full,
      opts,
      hooks,
      settings,
      win,
      twoHand,
      firstTime,
      kb,
      overlay,
      head,
      staffBox,
      status,
      bar,
      take,
      honesty,
      act: {
        reset: () => reset(),
        start: () => start(),
        demo: (after) => demo(after),
        openHard: (range) => openHard(range),
        startFocus: (back, local, place) => startFocus(c, back, local, place),
      },
      mode: opts.mode,
      hints: opts.hints,
      level: opts.level ?? 2,
      bpm: opts.bpm ?? full.bpm,
      phrase: opts.phrase ?? null,
      handSel,
      loop3: false,
      streak: 0,
      hardBack: null,
      missByMeasure: new Map<number, number>(),
      wLog: [],
      lastHands: null,
      wHands: [],
      review: null,
      lastPoint: null,
      focus: null,
      tune: full,
      state: 'idle',
      token: 0,
      lastDrop: null,
      raf: 0,
      disposed: false,
      staff: null as unknown as StaffView, // buildStaff() dựng trong reset() trước khi dùng
      unTempo: () => undefined,
      tempoExpect: null,
      parentRun: false,
      demoRun: null,
      gMemo: null,
      litOnset: null,
      wIdx: 0,
      wHits: 0,
      wWrongThis: 0,
      wWrongPass: 0,
      wHandFails: 0,
      lastHeard: null,
      handsAskedAt: -1,
      chordAskedAt: -1,
    };

    function reset(): void {
      if (c.state === 'result') cancelSpeech(); // thôi đọc lời nhắn kết quả cũ
      halt(c);
      c.loop3 = false;
      c.streak = 0;
      take.drop(); // 🎯 đang luyện một chỗ: bản ghi lượt chính được giữ (take.hold)
      // Rời câu khó (chọn câu khác / "Cả bài") → trả lại cách chơi cũ
      if (c.hardBack && !(c.phrase && c.phrase[0] === c.hardBack.range[0] && c.phrase[1] === c.hardBack.range[1])) {
        c.mode = c.hardBack.mode;
        c.hardBack = null;
      }
      overlay.hide();
      app.audio.stopAll();
      c.state = 'idle';
      head.render({ handSel: c.handSel, mode: c.mode, phrase: c.phrase, hints: c.hints, level: c.level, bpm: c.bpm });
      buildStaff(c);
      kb.clear();
      const g0 = groups(c)[0];
      if (g0) c.staff.setCursor(idxOf(g0));
      lightOnset(c, g0);
      if (c.focus) return focusIdle(c);
      const sh = solo(c);
      const { mode, phrase, hardBack, bpm } = c;
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
          hardBack ? h('b', {}, `🔁 Câu ${phraseRanges(full).findIndex(([a]) => a === hardBack.range[0]) + 1} — đàn đúng ${LOOP_TARGET} lần liền nhé!`) : null,
          h(
            'span',
            {},
            sh ? `${sh === 'RH' ? '🫱 Tập tay PHẢI' : '🫲 Tập tay TRÁI'} — ${micOn(c) ? 'tay kia để nghỉ' : 'app đàn khẽ tay kia'}. ` : '',
            hardBack
              ? '' // Lặp câu khó: dòng "🔁 Câu N — đàn đúng 3 lần liền" ở trên đã đủ (không có nút Bắt đầu)
              : mode === 'wait'
              ? // Bài mới: nghe – hát – rồi mới đàn (gộp một dòng cho gọn)
                firstTime
                ? '🎬 Xem mẫu và hát tên nốt theo thầy — rồi Bắt đầu đàn từng nốt.'
                : micOn(c)
                  ? '🎤 Bấm Bắt đầu rồi đàn từng nốt — app nghe và tự đi tiếp.'
                  : 'Bấm 🎬 Xem mẫu để xem thầy đàn, rồi Bắt đầu và đàn từng nốt.'
              : `Đếm vào rồi đàn theo tiếng "tích" (${bpm} nhịp/phút).${pulseWindow(c) ? ' 🤫 Giữa bài máy sẽ im 2 ô — con đếm thầm trong đầu nhé!' : ''}`,
          ),
        ),
      );
      const canLoop = mode === 'wait' && !!phrase && !opts.stage;
      setBar(
        c,
        backButton(() => hooks.onBack()),
        hardBack
          ? button({ icon: '↩', label: 'Cả bài', onTap: () => ((c.phrase = c.hardBack?.phrase ?? null), reset()) })
          : button({ icon: '🎬', label: 'Xem mẫu', onTap: () => void demo() }),
        canLoop ? button({ icon: '🔁', label: `Lặp ${LOOP_TARGET} lần đúng`, kind: hardBack ? 'primary' : undefined, onTap: () => void startLoop() }) : null,
        hardBack ? null : button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void start() }),
      );
    }

    /** v5.1 — "🔁 Lặp câu khó": mở câu có nhiều lỗi nhất ở chế độ lặp 3 lần đúng (chờ từng nốt). */
    function openHard(range: [number, number]): void {
      c.hardBack = { mode: c.mode, phrase: c.phrase, range };
      c.mode = 'wait';
      c.phrase = range;
      reset();
      void startLoop();
    }

    /** v5 — Lặp một câu: tự chơi lại tới khi đúng (không sai nốt nào) 3 lần LIÊN TIẾP. */
    async function startLoop(): Promise<void> {
      await start();
      if (c.state === 'playing' && c.mode === 'wait') {
        c.loop3 = true;
        c.streak = 0;
        take.drop(); // lặp câu: không ghi âm
        showWaitNote(c);
      }
    }

    // ---------------- Xem mẫu: "video" bàn tay thầy đàn ----------------
    async function demo(after: () => void = reset): Promise<void> {
      const tk = ++c.token;
      c.state = 'demo';
      const spb = 60 / c.bpm;
      overlay.setGhost(false);
      kb.setTargets([]);
      const caption = h('span', {}, '🎬 Xem thầy đàn mẫu — nhìn ngón tay nhé');
      status.replaceChildren(caption, firstTime ? h('div', { class: 'sing-prompt' }, '🎤 Hát tên nốt theo thầy nhé!') : '');
      setBar(c, button({ icon: '⏹', label: 'Dừng', onTap: reset }));
      scheduleAccomp(c, app.audio.now() + 0.35, spb);
      c.demoRun = playDemo(app.audio, kb, overlay, eventsFromTune(c.tune), {
        bpm: c.bpm,
        onCaption: (t) => (caption.textContent = `🎬 ${t}`),
        onBeat: (beat) => {
          if (c.mode === 'tempo' && c.level === 3) c.staff.setTime(Math.max(0, beat));
          const cur = groupAt(groups(c), beat);
          if (cur) c.staff.setCursor(idxOf(cur));
        },
      });
      await c.demoRun.done;
      if (tk === c.token) after();
    }

    // ---------------- Bắt đầu ----------------
    let starting = false;
    async function start(): Promise<void> {
      if (starting) return; // chạm 2 lần liền không được bắt đầu 2 lần
      starting = true;
      const tk = c.token;
      try {
        await app.ensureMic(); // chạm "Bắt đầu" = thao tác người dùng
      } finally {
        starting = false;
      }
      // Rời màn / bấm Dừng trong lúc chờ micro → không bắt đầu nữa
      if (tk !== c.token || c.disposed) return;
      if (c.mode === 'wait') startWait(c);
      else startTempo(c);
    }

    // Micro nghe được nốt (chế độ chờ)
    const unWaitNote = app.mic.onNote((n) => {
      if (c.state !== 'playing' || c.mode !== 'wait') return;
      honesty.heard(); // micro nghe ra nốt (đúng hay sai) → micro vẫn nghe được
      if (c.parentRun) return; // bố mẹ đang chấm giúp lượt này
      const g = groups(c)[c.wIdx];
      if (g && together(g) && handsOn(c)) {
        // Chấm hai tay: kiểm tra từ lần gõ (onOnset bên dưới); nốt nghe được chỉ để dự phòng khi không kết luận được
        c.lastHeard = { midi: n.midi, at: n.at ?? -1 };
        if (n.at !== undefined && n.at >= 0) onWaitHands(c, n.at);
      } else if (g && midisOf(g).length >= 2) onWaitChord(c, n.midi, n.at ?? -1);
      else onWaitInput(c, n.midi, 'mic');
    });
    // (+ 2026-10-09) Micro tự học lệch dây đàn nhà (autoTune.ts): chỉ từ nốt đơn app đang chờ
    app.mic.expected = (n) => {
      if (c.state !== 'playing' || c.parentRun) return null;
      if (c.mode === 'wait') {
        const g = groups(c)[c.wIdx];
        const ms = g ? midisOf(g) : [];
        return ms.length === 1 ? ms : null;
      }
      return c.tempoExpect && n.at !== undefined ? c.tempoExpect(n.at) : null;
    };
    // (+ 2026-10-09) Chấm hai tay (chế độ chờ): mỗi lần gõ phím ở nhóm hai tay → kiểm tra từng tay
    const unWaitOnset = app.mic.onOnset((at) => {
      if (c.state !== 'playing' || c.mode !== 'wait' || c.parentRun || !handsOn(c)) return;
      const g = groups(c)[c.wIdx];
      if (g && together(g)) onWaitHands(c, at);
    });

    // opts.loop + opts.phrase ("▶ Làm ngay" của bố mẹ): mở thẳng chế độ "🔁 Lặp 3 lần đúng" của câu đó
    // (giống "Lặp câu khó": nút chính = Lặp, nút phụ = "↩ Cả bài"; bé chạm Lặp = thao tác bật micro)
    if (opts.loop && opts.phrase && !opts.stage) {
      c.mode = 'wait';
      c.hardBack = { mode: 'wait', phrase: null, range: opts.phrase };
    }
    reset();
    // v5.1: lời dẫn dài chỉ hiện một dòng → đọc to cả câu một lần khi mở màn
    const introFull = opts.intro?.trim() ?? '';
    const introSpoken = !!introFull && showIntroFor(c.phrase) && shortIntro(introFull) !== introFull;
    const introTimer = introSpoken ? window.setTimeout(() => !c.disposed && c.state === 'idle' && void speak(app, introFull), 400) : 0;
    return () => {
      c.disposed = true;
      window.clearTimeout(introTimer);
      cancelSpeech();
      take.drop();
      halt(c);
      unWaitNote();
      unWaitOnset();
      app.mic.expected = null;
      honesty.dispose();
      overlay.destroy();
      kb.destroy();
    };
  };
}
