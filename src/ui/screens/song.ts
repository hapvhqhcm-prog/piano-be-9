import { VOICE_HINT } from '../../audio/voiceGuard';
import { TIMING_WINDOWS } from '../../music/timing';
import { phraseRanges, slice, tuneRange, type Tune } from '../../music/tune';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { pitchToMidi } from '../../piano/pitchTable';
import type { StaffView } from '../components/staffView';
import type { App } from '../App';
import { backButton, button, h, toast } from '../components/dom';
import { HandOverlay, eventsFromTune, pedalOfTune, playDemo } from '../components/demo';
import { speakChip } from '../components/speakChip';
import { cancelSpeech, speak } from '../../audio/voice';
import { SongHead, type SongChoices } from './songHead';
import { LOOP_TARGET, fingerMap, idxOf, midisOf, shortIntro, type HandSel, type SongOptions } from './songShared';
import { TakeReplay } from './songTake';
import { MicHonestyWatch, micHonestyBox } from '../components/micHonesty';
import { songEverPlayed, songMastered, startTempoBpm } from '../../lessons/lessonEngine';
import { familiarMinBpm, songPassedBefore, tempoAdvice, todayTempoOutcomes } from '../../lessons/songStats';
import { buildStaff, groupAt, groups, halt, handsOn, lightOnset, micOn, pulseWindow, scheduleAccomp, setBar, solo, together, type SongCtx, type SongHooks } from './songState';
import { onWaitChord, onWaitHands, onWaitInput, onWaitMic, showWaitNote, startWait } from './songWait';
import { READ_FIRST_IDLE_MS, READ_FIRST_TEXT, readFirstDue, songFamiliar } from '../../lessons/readingAids';
import { waitJudgeInit } from '../../music/waitJudge';
import { startTempo } from './songTempo';
import { focusIdle, startFocus } from './songFocus';
import { readingHints } from '../components/noteColors';
import { withChant } from './songChant';
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
/** (+ 2026-10-15) "🐢 Xem chậm": thầy đàn mẫu ở 0.6× nhịp */
const SLOW_DEMO = 0.6;

/**
 * Tốc độ mở sẵn cho lượt THEO NHỊP (lượt của buổi học / Thư viện; sân khấu và bước có tốc độ riêng thì không dùng):
 * BẮT ĐẦU CHẬM (songStats.startTempoBpm) và (+ 2026-10-16) LÙI TỐC ĐỘ — hôm nay vừa lùi một nấc mà chưa đạt 2 lượt liền ở
 * tốc độ đó → mở sẵn tốc độ đã lùi (songStats.tempoAdvice).
 */
function openTempoBpm(full: Tune, app: App, phrase: [number, number] | null): number {
  const data = app.store.get();
  const start = startTempoBpm(full, data);
  if (full.id.startsWith('sight')) return start;
  const hold = tempoAdvice(todayTempoOutcomes(data, full.id, phrase)).hold;
  const bpm = hold !== null ? Math.min(start, hold) : start;
  // (+ 2026-10-17, OWNER duyệt) bài QUEN không bao giờ MỞ dưới 56 (kể cả tốc độ đã lùi hôm nay) — songStats.familiarMinBpm
  return songPassedBefore(data, full.id) ? Math.max(bpm, familiarMinBpm(full)) : bpm;
}

export function songScreen(app: App, full: Tune, opts: SongOptions, hooks: SongHooks) {
  // (2026-10-15, OWNER duyệt — rà soát của thầy giáo) bài QUEN, theo nhịp, từ tuần 6 → chỉ khuông (noteColors.ts readingHints);
  // Thư viện (free) / sân khấu / đọc nhạc ngẫu nhiên giữ gợi ý đã chọn
  const data = app.store.get();
  const eff: SongOptions =
    opts.free || opts.stage || full.id.startsWith('sight')
      ? opts
      : { ...opts, hints: readingHints(opts.hints, data.progress.currentWeek, { tempo: opts.mode === 'tempo', familiar: songFamiliar(data, full.id), bass: full.hand !== 'RH' }) };
  // (2026-10-15, OWNER duyệt) "Đọc nhịp trước" — trước lượt theo nhịp đầu tiên của bài có cờ `chant` (songChant.ts)
  return withChant(app, full, eff, hooks.onBack, songMount(app, full, eff, hooks));
}

function songMount(app: App, full: Tune, opts: SongOptions, hooks: SongHooks) {
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
      backingAllowed: () => !!app.store.settings.accompaniment,
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

    // (+ 2026-10-15) 🔢 Bản đồ ngón trên bàn phím (nạp muộn; quy tắc hiện / mờ dần: ui/components/keyboardHand.ts)
    let ghost: { refresh(): void; destroy(): void } | null = null;
    if (!opts.stage) {
      void import('../components/keyboardHand')
        .then((m) => {
          if (c.disposed) return;
          const data = app.store.get();
          const autoOn = m.ghostAuto({
            week: data.progress.currentWeek,
            positions: [full.position ?? 'C', full.lh ? full.lhPosition ?? 'C' : undefined],
            mastered: songMastered(data, full.id),
            bothHands: !!full.lh,
          });
          ghost = new m.KeyboardHand(kb, { plan: m.planFromTune(full), auto: () => autoOn });
          head.handGuide = {
            get: () => m.ghostMode(),
            set: (v) => {
              m.setGhostMode(v);
              ghost?.refresh();
            },
          };
          head.refresh();
        })
        .catch(() => undefined); // không nạp được → không có bản đồ ngón (màn vẫn chạy)
    }

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
     * "Micro nghe chưa rõ — không phải lỗi của con" + "👍 Con tự kiểm tra" (cả lượt này chuyển sang bé tự kiểm tra).
     */
    const honesty = new MicHonestyWatch(app.mic, {
      active: () => c.state === 'playing' && c.mode === 'wait' && micOn(c) && !c.selfRun && !c.loop3,
      onTrigger: () => {
        if (status.querySelector('.mic-honest')) return;
        status.append(
          micHonestyBox(() => {
            c.selfRun = true;
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
        listenHere: () => listenHere(),
      },
      mode: opts.mode,
      hints: opts.hints,
      level: opts.level ?? 2,
      // (+ 2026-10-15, OWNER duyệt) BẮT ĐẦU CHẬM: lượt theo nhịp của bài chưa từng đạt theo nhịp → ≤ 50 (40 nếu có móc đơn /
      // hai tay); sau đó thang 40 → 50 → 60 ("🐇 Nhanh hơn"). Sân khấu / bước ôn có tốc độ riêng.
      // (+ 2026-10-16) …và LÙI TỐC ĐỘ: vừa lùi một nấc hôm nay → mở sẵn tốc độ đã lùi tới khi đạt 2 lượt liền
      bpm: opts.bpm ?? (opts.mode === 'tempo' && !opts.stage ? openTempoBpm(full, app, opts.phrase ?? null) : full.bpm),
      phrase: opts.phrase ?? null,
      handSel,
      loop3: false,
      streak: 0,
      hardBack: null,
      fails: 0,
      easyEnd: false,
      masteredBefore: full.id.startsWith('sight') || opts.stage ? undefined : songMastered(app.store.get(), full.id),
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
      selfRun: false,
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
      wJudge: waitJudgeInit(),
      wFirstWrongAt: -1,
      // (+ 2026-10-16, OWNER duyệt) ĐỌC TRƯỚC, NGHE MẪU SAU: từ tuần 8, bài gặp lần đầu trong buổi học (readingAids.ts)
      readFirst: readFirstDue(app.store.get(), full, opts) ? { locked: true } : null,
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
              : c.readFirst?.locked
              ? // (+ 2026-10-16) Đọc trước, nghe mẫu sau
                `📖 ${READ_FIRST_TEXT}${mode === 'tempo' ? ` Đếm vào rồi đàn theo tiếng "tích" (${bpm} nhịp/phút).` : ''}`
              : c.readFirst && mode === 'wait' && firstTime
              ? '🎧 Giờ con nghe mẫu được rồi — nghe xong Bắt đầu đàn lại nhé.'
              : mode === 'wait'
              ? // Bài mới: nghe – hát – rồi mới đàn (gộp một dòng cho gọn)
                firstTime
                ? // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") chữ của bé ngắn (≤ 12 tiếng mỗi màn)
                  '🎬 Xem mẫu, hát theo — rồi đàn từng nốt'
                : micOn(c)
                  ? '🎤 Bắt đầu rồi đàn từng nốt'
                  : '▶ Bắt đầu rồi đàn từng nốt'
              : `🥁 Đếm vào rồi đàn theo “tích” · ♩ ${bpm}${pulseWindow(c) ? ' · 🤫 máy im 2 ô — đếm thầm nhé' : ''}`,
          ),
        ),
      );
      const canLoop = mode === 'wait' && !!phrase && !opts.stage;
      setBar(
        c,
        backButton(() => hooks.onBack()),
        hardBack
          ? button({ icon: '↩', label: 'Cả bài', onTap: () => ((c.phrase = c.hardBack?.phrase ?? null), reset()) })
          : c.readFirst
            ? listenButton()
            : button({ icon: '🎬', label: 'Xem mẫu', onTap: () => void demo() }),
        canLoop ? button({ icon: '🔁', label: `Lặp ${LOOP_TARGET} lần đúng`, kind: hardBack ? 'primary' : undefined, onTap: () => void startLoop() }) : null,
        hardBack ? null : button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void start() }),
      );
    }

    /**
     * (+ 2026-10-16, OWNER duyệt) "🎧 Nghe mẫu" của bài đang "đọc trước": mờ (chạm → nhắc con tự đọc trước) tới khi bé
     * thử lần đầu / đã chờ 20 giây; sau đó như "Xem mẫu".
     */
    function listenButton(): HTMLButtonElement {
      const locked = !!c.readFirst?.locked;
      const b = button({
        icon: '🎧',
        label: 'Nghe mẫu',
        onTap: () => {
          if (!c.readFirst?.locked) return void demo();
          toast(READ_FIRST_TEXT, 2600);
          void speak(app, READ_FIRST_TEXT);
        },
      });
      if (locked) {
        b.classList.add('btn-locked');
        b.setAttribute('aria-disabled', 'true');
      }
      return b;
    }

    /**
     * (+ 2026-10-16) "🎧 Nghe mẫu câu này" (lượt Từng nốt, đàn sai 2 lần một chỗ): thầy đàn CÂU chứa nốt đang chờ, xong bé
     * đàn tiếp đúng chỗ đang chờ (lượt không bị hủy; nốt này không còn tính "đúng ngay").
     */
    function listenHere(): void {
      if (c.state !== 'playing' || c.mode !== 'wait') return;
      const g = groups(c)[c.wIdx];
      if (!g) return;
      const m = g.notes[0].measure;
      const range = phraseRanges(c.tune).find(([a, b]) => m >= a && m < b) ?? [m, m + 1];
      if (c.readFirst) c.readFirst.locked = false;
      const resume = () => {
        if (c.disposed) return;
        c.state = 'playing';
        c.wWrongThis = 0;
        c.wFirstWrongAt = -1;
        c.wJudge = waitJudgeInit();
        app.mic.resetTracker();
        showWaitNote(c);
      };
      void demo(resume, 1, range);
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

    // ---------------- Xem mẫu: "video" thầy đàn (số ngón trên phím) ----------------
    // (+ 2026-10-15) bản đồ ngón trên bàn phím đàn cả bài (demo.ts → demoHands.ts); 🐢 Xem chậm = 0.6× nhịp
    // (+ 2026-10-16) range = chỉ đàn một câu (ô [đầu, cuối) của lượt đang mở — "🎧 Nghe mẫu câu này"), Dừng → `after`
    async function demo(after: () => void = reset, speed = 1, range: [number, number] | null = null): Promise<void> {
      const tk = ++c.token;
      c.state = 'demo';
      const bpm = c.bpm * speed;
      const spb = 60 / bpm;
      overlay.setGhost(false);
      kb.setTargets([]);
      const caption = h(
        'span',
        {},
        range ? '🎧 Nghe thầy đàn câu này — rồi con đàn tiếp nhé' : speed < 1 ? '🐢 Thầy đàn chậm — nhìn ngón tay nhé' : '🎬 Xem thầy đàn mẫu — nhìn ngón tay nhé',
      );
      status.replaceChildren(caption, firstTime && !range ? h('div', { class: 'sing-prompt' }, '🎤 Hát tên nốt theo thầy nhé!') : '');
      const stop = range
        ? () => {
            if (tk !== c.token) return;
            c.token++;
            c.demoRun?.cancel();
            c.demoRun = null;
            overlay.hide();
            after();
          }
        : reset;
      setBar(
        c,
        button({ icon: '⏹', label: 'Dừng', onTap: stop }),
        speed === 1 && !range
          ? button({
              icon: '🐢',
              label: 'Xem chậm',
              onTap: () => {
                if (tk !== c.token) return;
                c.demoRun?.cancel(); // tắt tiếng lượt đang xem TRƯỚC khi hẹn lượt chậm
                c.demoRun = null;
                void demo(after, SLOW_DEMO);
              },
            })
          : null,
      );
      const t0 = app.audio.now() + 0.35;
      const tune = range ? slice(c.tune, range[0], range[1]) : c.tune;
      if (!range) scheduleAccomp(c, t0, spb);
      c.demoRun = playDemo(app.audio, kb, overlay, eventsFromTune(tune), {
        bpm,
        t0,
        pedal: pedalOfTune(tune),
        onCaption: (t) => (caption.textContent = `🎬 ${t}`),
        onBeat: range
          ? undefined
          : (beat) => {
              if (c.mode === 'tempo' && c.level === 3) c.staff.setTime(Math.max(0, beat));
              const cur = groupAt(groups(c), beat);
              if (cur) c.staff.setCursor(idxOf(cur));
            },
      });
      await c.demoRun.done;
      if (tk === c.token) {
        if (range) overlay.hide();
        after();
      }
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
      // (+ 2026-10-16) Đọc trước, nghe mẫu sau: bé đã THỬ → mở nút nghe mẫu
      if (c.readFirst) c.readFirst.locked = false;
      if (c.mode === 'wait') startWait(c);
      else startTempo(c);
    }

    // Micro nghe được nốt (chế độ chờ)
    const unWaitNote = app.mic.onNote((n) => {
      if (c.state !== 'playing' || c.mode !== 'wait') return;
      honesty.heard(); // micro nghe ra nốt (đúng hay sai) → micro vẫn nghe được
      if (c.selfRun) return; // lượt này bé tự kiểm tra (micro nghe chưa rõ)
      const g = groups(c)[c.wIdx];
      if (g && together(g) && handsOn(c)) {
        // Chấm hai tay: kiểm tra từ lần gõ (onOnset bên dưới); nốt nghe được chỉ để dự phòng khi không kết luận được
        c.lastHeard = { midi: n.midi, at: n.at ?? -1 };
        if (n.at !== undefined && n.at >= 0) onWaitHands(c, n.at);
      } else if (g && midisOf(g).length >= 2) onWaitChord(c, n.midi, n.at ?? -1);
      // (+ 2026-10-15) bé thật: lệch quãng 8, đàn vội, đàn lại từ đầu câu, chạm 2 phím, tiếng lạ (src/music/waitJudge.ts)
      else onWaitMic(c, n.midi, n.at ?? -1);
    });
    // (+ 2026-10-09) Micro tự học lệch dây đàn nhà (autoTune.ts): chỉ từ nốt đơn app đang chờ
    app.mic.expected = (n) => {
      if (c.state !== 'playing' || c.selfRun) return null;
      if (c.mode === 'wait') {
        const g = groups(c)[c.wIdx];
        const ms = g ? midisOf(g) : [];
        return ms.length === 1 ? ms : null;
      }
      return c.tempoExpect && n.at !== undefined ? c.tempoExpect(n.at) : null;
    };
    // (+ 2026-10-09) Chấm hai tay (chế độ chờ): mỗi lần gõ phím ở nhóm hai tay → kiểm tra từng tay
    const unWaitOnset = app.mic.onOnset((at) => {
      if (c.state !== 'playing' || c.mode !== 'wait' || c.selfRun || !handsOn(c)) return;
      const g = groups(c)[c.wIdx];
      if (g && together(g)) onWaitHands(c, at);
    });

    // (+ 2026-10-25) Micro nghe thấy GIỌNG bé (hát / ngân nga / nói / huýt sáo — audio/voiceGuard.ts), không phải tiếng
    // đàn → không chấm; nhắc nhẹ MỘT lần mỗi màn (bé hay hát theo — không làm phiền mãi)
    let voiceHinted = false;
    const unWaitVoice = app.mic.onVoice(() => {
      if (voiceHinted || c.state !== 'playing' || c.mode !== 'wait' || c.selfRun) return;
      voiceHinted = true;
      c.status.textContent = VOICE_HINT;
    });

    // opts.loop + opts.phrase (vd "🔁 Lặp câu khó"): mở thẳng chế độ "🔁 Lặp 3 lần đúng" của câu đó
    // (giống "Lặp câu khó": nút chính = Lặp, nút phụ = "↩ Cả bài"; bé chạm Lặp = thao tác bật micro)
    if (opts.loop && opts.phrase && !opts.stage) {
      c.mode = 'wait';
      c.hardBack = { mode: 'wait', phrase: null, range: opts.phrase };
    }
    reset();
    /** (+ 2026-10-16) Đọc trước: bé chưa thử sau 20 giây → mở nút nghe mẫu (không để bé kẹt) */
    const readFirstTimer = c.readFirst?.locked
      ? window.setTimeout(() => {
          if (c.disposed || !c.readFirst?.locked) return;
          c.readFirst.locked = false;
          if (c.state === 'idle' && !c.focus && !c.hardBack) reset();
        }, READ_FIRST_IDLE_MS)
      : 0;
    // v5.1: lời dẫn dài chỉ hiện một dòng → đọc to cả câu một lần khi mở màn
    const introFull = opts.intro?.trim() ?? '';
    const introSpoken = !!introFull && showIntroFor(c.phrase) && shortIntro(introFull) !== introFull;
    const introTimer = introSpoken ? window.setTimeout(() => !c.disposed && c.state === 'idle' && void speak(app, introFull), 400) : 0;
    return () => {
      c.disposed = true;
      window.clearTimeout(introTimer);
      window.clearTimeout(readFirstTimer);
      cancelSpeech();
      take.drop();
      halt(c);
      unWaitNote();
      unWaitOnset();
      unWaitVoice();
      app.mic.expected = null;
      honesty.dispose();
      ghost?.destroy();
      overlay.destroy();
      kb.destroy();
    };
  };
}
