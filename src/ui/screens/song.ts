import { wait } from '../../audio/AudioEngine';
import { matchHeard } from '../../audio/match';
import { confetti } from '../components/celebrate';
import { PASS_SCORE, TIMING_WINDOWS, countInBeats, countInLabel, gradeTiming, loopStreak, score as scoreOf, starsFor, type HeardEvent } from '../../music/timing';
import {
  DYN_VOLUME,
  accompaniment,
  allTimed,
  beatsPerMeasure,
  dynAtBeat,
  expressionUsed,
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
import { midiToFreq, midiToPitch, noteLabel, pitchToMidi, viName } from '../../piano/pitchTable';
import type { SongRun } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { StaffView } from '../components/staffView';
import { HandOverlay, eventsFromTune, playDemo } from '../components/demo';
import '../../styles/pedagogy.css';

export interface SongOptions {
  mode: 'wait' | 'tempo';
  level?: 2 | 3;
  hints: 'full' | 'names' | 'staff';
  intro?: string;
  /** Cho đổi chế độ / chọn câu / tốc độ (thư viện bài hát) */
  free?: boolean;
  /** Sân khấu: chỉ chơi cả bài một lần rồi báo xong */
  stage?: boolean;
  /** v5 — Mở sẵn một câu [ô đầu, ô cuối) (bước "Ôn bài cũ") */
  phrase?: [number, number];
  /** v5 — Tốc độ mở sẵn (mặc định tốc độ của bài) */
  bpm?: number;
  /** v5 — Bước "Ôn bài cũ" trong buổi: khoá câu (không hiện nút chọn câu), luôn hiện lời dẫn */
  review?: boolean;
}

/** Tập tách tay (bài hai tay): RH / LH = chỉ chấm tay đó; BOTH = hai tay như thường. */
type HandSel = 'BOTH' | 'RH' | 'LH';

export interface SongHooks {
  onRun(run: Omit<SongRun, 'ts'>): void;
  onDone(): void;
  onBack(): void;
}

/** Khi micro không ước được lúc gõ phím: trễ trung bình từ lúc gõ tới lúc nhận nốt (đo trên giả lập ~70 ms). */
const MIC_LATENCY = 0.07;
const TEMPOS = [40, 50, 60, 72];

type State = 'idle' | 'demo' | 'countin' | 'playing' | 'rate' | 'result';

/** Bảng ngón của CHÍNH bài này (để số ngón hiện đúng khi chạm phím ảo — thế Sol, gam luồn ngón…). */
function fingerMap(t: Tune): Map<number, { finger: number; hand: Hand }> {
  const m = new Map<number, { finger: number; hand: Hand }>();
  for (const n of allTimed(t)) {
    const parts = [{ pitch: n.pitch, finger: n.finger }, ...(n.also ?? [])];
    for (const p of parts) {
      if (!p.pitch || !p.finger) continue;
      const k = pitchToMidi(p.pitch);
      if (!m.has(k)) m.set(k, { finger: p.finger, hand: n.hand });
    }
  }
  return m;
}

/**
 * v4 — Chú thích nhỏ khi bài có ký hiệu sắc thái / ngắt / luyến (chữ ít, dễ hiểu cho bé).
 * Micro vẫn chỉ chấm cao độ & nhịp — không trừ điểm sắc thái.
 */
function expressionLegend(t: Tune): HTMLElement | null {
  const u = expressionUsed(t);
  if (!u.dyn && !u.stac && !u.slur) return null;
  const dynsUsed = new Set([...t.notes, ...(t.lh ?? [])].map((n) => n.dyn).filter(Boolean));
  const item = (sym: HTMLElement, text: string) => h('span', { class: 'legend-item' }, sym, ' ', text);
  return h(
    'div',
    { class: 'song-legend' },
    ...(['p', 'mf', 'f'] as const)
      .filter((d) => dynsUsed.has(d))
      .map((d) => item(h('i', { class: 'legend-dyn' }, d), d === 'p' ? '= nhỏ 🐭' : d === 'f' ? '= to 🦁' : '= vừa 🙂')),
    u.stac ? item(h('b', { class: 'legend-sym' }, '•'), 'chấm = ngắt tiếng 🐇') : null,
    u.slur ? item(h('b', { class: 'legend-sym' }, '⌒'), 'dấu luyến = đàn liền 🐢') : null,
  );
}

/**
 * Màn bài hát kiểu "app nghe đàn":
 * - Từng nốt (chờ): con trỏ chờ bé đàn đúng (micro) hoặc bấm "Nốt tiếp". Bài hai tay đi theo từng nhóm nốt cùng lúc.
 * - Theo nhịp: đếm vào, máy gõ nhịp + nhạc đệm; Mức 2 con trỏ nhảy, Mức 3 băng chuyền.
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
    let handSel: HandSel = 'BOTH';
    /** Tay đang tập riêng (null = hai tay) */
    const solo = (): Hand | null => (twoHand && handSel !== 'BOTH' ? handSel : null);
    /** "Lặp câu này 3 lần đúng liên tiếp" (chế độ chờ, đang chọn một câu) */
    let loop3 = false;
    let streak = 0;
    /** Bài MỚI (chưa chơi lượt nào): nhắc hát tên nốt theo thầy khi xem mẫu */
    const firstTime =
      !full.id.startsWith('sight') && !app.store.get().sessions.some((s) => s.songRuns.some((r) => r.songId === full.id));
    let tune = full;
    let state: State = 'idle';
    let token = 0;
    let raf = 0;
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
    const head = h('div', { class: 'song-head' });
    const staffBox = h('div', { class: `song-staff${full.lh ? ' grand' : ''}` });
    const status = h('div', { class: 'song-status' });
    const bar = h('div', { class: 'actions' });
    root.append(
      h('div', { class: 'screen' }, head, staffBox, status, h('div', { class: `keyboard-wrap song-kb${full.lh ? ' short' : ''}` }, kb.el), bar),
    );

    const micOn = () => app.mic.state === 'on';
    /** Bỏ nghe micro của lượt "theo nhịp" đang chạy (gọi khi dừng / rời màn) */
    let unTempo: () => void = () => undefined;
    const setBar = (...b: (HTMLElement | null | false)[]) =>
      bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    // ---------------- Đầu trang ----------------
    const chip = (label: string, on: boolean, onTap: () => void) => {
      const b = h('button', { class: `seg-btn small${on ? ' on' : ''}`, type: 'button' }, label);
      b.addEventListener('click', () => (state === 'idle' || state === 'result' ? onTap() : undefined));
      return b;
    };

    /** Bảng "⚙️ Tuỳ chọn" (gợi ý, kiểu con trỏ, tốc độ) — đang mở hay không; giữ nguyên khi vẽ lại đầu trang. */
    let optsOpen = false;
    const screenEl = root.querySelector('.screen') as HTMLElement;
    screenEl.addEventListener('pointerdown', (e) => {
      // Chạm ra ngoài bảng tuỳ chọn → đóng bảng
      if (!optsOpen) return;
      const t = e.target as Element | null;
      if (t?.closest('.opts-pop') || t?.closest('.opts-toggle')) return;
      optsOpen = false;
      head.querySelector('.opts-pop')?.setAttribute('hidden', '');
      head.querySelector('.opts-toggle')?.classList.remove('on');
    });

    function renderHead(): void {
      // Hàng chính (luôn thấy): tên bài · cách chơi (Từng nốt / Theo nhịp) · câu · nút ⚙️ Tuỳ chọn
      const row = h(
        'div',
        { class: 'song-head-row' },
        h(
          'div',
          { class: 'song-title' },
          h('b', {}, full.titleVi),
          // Tên gốc/nhạc sĩ chỉ dành cho bố mẹ (thư viện) — màn của bé gọn chữ
          full.lh && opts.stage ? h('span', { class: 'hand-tag' }, '🙌 hai tay') : null,
          opts.review ? h('span', { class: 'hand-tag review-tag' }, '🔁 ôn bài cũ') : null,
        ),
      );
      if (twoHand && !opts.stage) {
        // v5: tập TÁCH TAY trước rồi mới ghép hai tay (lượt tách tay không tính tiêu chí tuần / "đã thuộc")
        row.append(
          h(
            'div',
            { class: 'seg-group hand-sel', role: 'group', 'aria-label': 'Tay tập' },
            chip('🫱 Tay phải', handSel === 'RH', () => ((handSel = 'RH'), reset())),
            chip('🫲 Tay trái', handSel === 'LH', () => ((handSel = 'LH'), reset())),
            chip('🙌 Hai tay', handSel === 'BOTH', () => ((handSel = 'BOTH'), reset())),
          ),
        );
      }
      if (opts.free) {
        row.append(
          h(
            'div',
            { class: 'seg-group', role: 'group', 'aria-label': 'Cách chơi' },
            chip('🐢 Từng nốt', mode === 'wait', () => ((mode = 'wait'), reset())),
            chip('🎵 Theo nhịp', mode === 'tempo', () => ((mode = 'tempo'), reset())),
          ),
        );
      }
      const ranges = phraseRanges(full);
      if (ranges.length > 1 && !opts.stage && !opts.review) {
        row.append(
          h(
            'div',
            { class: 'seg-group', role: 'group', 'aria-label': 'Chọn câu' },
            chip('Cả bài', !phrase, () => ((phrase = null), reset())),
            ...ranges.map(([a, b], i) => chip(`Câu ${i + 1}`, !!phrase && phrase[0] === a, () => ((phrase = [a, b]), reset()))),
          ),
        );
      }

      // Tuỳ chọn phụ (ít dùng) gom vào bảng bật/tắt
      const sections: HTMLElement[] = [];
      const section = (label: string, ...chips: HTMLElement[]) =>
        sections.push(h('div', { class: 'opts-sec' }, h('div', { class: 'opts-label' }, label), h('div', { class: 'seg-group' }, ...chips)));
      if (opts.free) {
        section(
          '💡 Gợi ý',
          chip('Đầy đủ', hints === 'full', () => ((hints = 'full'), reset())),
          chip('Tên nốt', hints === 'names', () => ((hints = 'names'), reset())),
          chip('Chỉ khuông', hints === 'staff', () => ((hints = 'staff'), reset())),
        );
      }
      if (mode === 'tempo' && !opts.stage) {
        if (opts.free) {
          section(
            '👀 Cách nhìn',
            chip('Con trỏ', level === 2, () => ((level = 2), reset())),
            chip('Băng chuyền', level === 3, () => ((level = 3), reset())),
          );
        }
        section(
          '⏱ Tốc độ',
          ...TEMPOS.map((t) => chip(`${t === 40 ? '🐢 ' : t === 72 ? '🐇 ' : ''}${t}`, bpm === t, () => ((bpm = t), reset()))),
        );
      }
      let pop: HTMLElement | null = null;
      if (sections.length) {
        const toggle = h(
          'button',
          { class: `seg-btn small opts-toggle${optsOpen ? ' on' : ''}`, type: 'button', 'aria-haspopup': 'true' },
          '⚙️ Tuỳ chọn',
        );
        pop = h('div', { class: 'opts-pop', role: 'dialog', 'aria-label': 'Tuỳ chọn' }, ...sections);
        if (!optsOpen) pop.setAttribute('hidden', '');
        toggle.addEventListener('click', () => {
          optsOpen = !optsOpen;
          toggle.classList.toggle('on', optsOpen);
          pop?.toggleAttribute('hidden', !optsOpen);
        });
        row.append(h('div', { class: 'song-head-spacer' }), toggle);
      }
      // Chú giải sắc thái nằm cùng hàng (trước nút ⚙️) — khi xuống dòng thì đi cùng nút, không tốn thêm hàng
      const legend = expressionLegend(full);
      if (legend) row.insertBefore(legend, row.querySelector('.song-head-spacer'));
      head.replaceChildren(row, ...(pop ? [pop] : []));
    }

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
    const groups = (): Onset[] => handOnsets(tune, solo());
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
    const midisOf = (o: Onset) => o.pitches.map(pitchToMidi);
    const idxOf = (o: Onset) => o.notes.map((n) => n.index);

    function lightOnset(o: Onset | undefined, force = false): void {
      kb.setTargets([]);
      if (!o || (hints !== 'full' && !force)) return;
      const ts: KeyTarget[] = [];
      for (const n of o.notes) {
        ts.push({ pitch: n.pitch!, finger: n.finger, hand: n.hand });
        for (const a of n.also ?? []) ts.push({ pitch: a.pitch, finger: a.finger, hand: n.hand });
      }
      kb.setTargets(ts);
    }

    const onsetLabel = (o: Onset) => {
      const rh = o.notes.filter((n) => n.hand === 'RH').flatMap(pitchesOf);
      const lh = o.notes.filter((n) => n.hand === 'LH').flatMap(pitchesOf);
      const fmt = (ps: string[]) => ps.map((p) => viName(p)).join('+');
      if (rh.length && lh.length) return `🫱 ${fmt(rh)} · 🫲 ${fmt(lh)}`;
      const n = o.notes[0];
      return `${noteLabel(o.pitches[0])}${o.pitches.length > 1 ? ` (+${o.pitches.length - 1})` : ''}${n.finger ? ` — ngón ${n.finger}` : ''}`;
    };

    function reset(): void {
      token++;
      loop3 = false;
      streak = 0;
      cancelAnimationFrame(raf);
      unTempo();
      demoRun?.cancel();
      demoRun = null;
      overlay.hide();
      app.audio.stopAll();
      state = 'idle';
      renderHead();
      buildStaff();
      kb.clear();
      const g0 = groups()[0];
      if (g0) staff.setCursor(idxOf(g0));
      lightOnset(g0);
      const sh = solo();
      status.replaceChildren(
        h(
          'span',
          {},
          opts.intro && (!phrase || opts.review) ? opts.intro + ' ' : '',
          sh ? `${sh === 'RH' ? '🫱 Tập tay PHẢI' : '🫲 Tập tay TRÁI'} — ${micOn() ? 'tay kia để nghỉ' : 'app đàn khẽ tay kia'}. ` : '',
          mode === 'wait'
            ? // Bài mới: nghe – hát – rồi mới đàn (gộp một dòng cho gọn)
              firstTime
              ? '🎬 Xem mẫu và hát tên nốt theo thầy — rồi Bắt đầu đàn từng nốt.'
              : micOn()
                ? '🎤 Bấm Bắt đầu rồi đàn từng nốt — app nghe và tự đi tiếp.'
                : 'Bấm 🎬 Xem mẫu để xem thầy đàn, rồi Bắt đầu và đàn từng nốt.'
            : `Đếm vào rồi đàn theo tiếng "tích" (${bpm} nhịp/phút).`,
        ),
      );
      const canLoop = mode === 'wait' && !!phrase && !opts.stage;
      setBar(
        backButton(() => hooks.onBack()),
        button({ icon: '🎬', label: 'Xem mẫu', onTap: () => void demo() }),
        canLoop ? button({ icon: '🔁', label: 'Lặp 3 lần đúng', onTap: () => void startLoop() }) : null,
        button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void start() }),
      );
    }

    /** v5 — Lặp một câu: tự chơi lại tới khi đúng (không sai nốt nào) 3 lần LIÊN TIẾP. */
    async function startLoop(): Promise<void> {
      await start();
      if (state === 'playing' && mode === 'wait') {
        loop3 = true;
        streak = 0;
        showWaitNote();
      }
    }
    const streakDots = () =>
      h('span', { class: 'loop-dots', 'aria-label': `${streak}/3` }, '🔁 ', '●'.repeat(streak), h('span', { class: 'loop-off' }, '○'.repeat(Math.max(0, 3 - streak))));

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
          const gs = groups();
          let cur: Onset | undefined;
          for (const g of gs) if (g.start <= beat + 0.05) cur = g;
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
      let cur: Onset | undefined;
      for (const g of gs) if (g.start <= beat + 0.05) cur = g;
      if (mode === 'tempo' && level === 3) staff.setTime(Math.max(0, beat));
      if (cur) staff.setCursor(idxOf(cur));
      if (hints === 'full') {
        const upcoming = gs.find((g) => g.start >= beat - 0.05 && g.start - beat < 0.5) ?? cur;
        lightOnset(upcoming);
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
      staff.clearMarks();
      app.mic.resetTracker();
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
        for (const i of idxOf(g)) staff.mark(i, 'hit');
        if (match === 'exact') kb.setResult(midiToPitch(midi), 'good');
        wIdx++;
        wWrongThis = 0;
        // Tập tách tay: app đàn khẽ các nốt tay kia từ nhóm này tới nhóm sau
        if (solo()) playOther(g.start, groups()[wIdx]?.start ?? Infinity, app.audio.now() + 0.02, 60 / bpm);
        if (from === 'mic') app.mic.resetTracker();
        showWaitNote();
      } else if (from === 'tap') {
        wWrongPass++;
      } else if (from === 'mic') {
        // Nhiều nốt cùng lúc: micro hay nghe lẫn → không tính là sai, chỉ chỉ ra phím nghe được
        if (midisOf(g).length < 2) {
          wWrongThis++;
          wWrongPass++;
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
        showResult(s, `Con đàn đúng ngay ${wHits}/${total} nốt`);
      } else {
        askParent('Con đã đàn hết bài chưa?', total);
      }
    }

    /** Hết một lượt của "Lặp 3 lần": sạch (không sai nốt nào) → +1, sai → về 0; đủ 3 → ăn mừng. */
    function finishLoopPass(total: number): void {
      const verdict = (clean: boolean) => {
        const v = loopStreak(streak, clean);
        streak = v.streak;
        if (v.done) {
          loop3 = false;
          return showResult(1, '🏆 Đúng 3 lần liên tiếp — câu này con thuộc rồi!');
        }
        state = 'rate';
        kb.setTargets([]);
        status.replaceChildren(
          streakDots(),
          ' ',
          h('b', {}, clean ? `✓ Đúng rồi! Còn ${3 - streak} lần nữa nào!` : 'Gần được rồi — mình đàn lại từ đầu câu nhé!'),
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
      // Bé đàn theo tiếng tích NGHE THẤY (trễ thêm độ trễ loa) → trừ đi khi chấm
      const outLat = app.audio.outputLatency;
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
          countEl.textContent = beat < -lead ? ' ' : String(countInLabel(beat, bpmM, lead));
        } else {
          if (state === 'countin') {
            state = 'playing';
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
        const s = scoreOf(v);
        const hits = v.filter((r) => r.hit).length;
        record({ mode: 'tempo', total: v.length, hits, source: 'mic', passed: s >= PASS_SCORE });
        showResult(s, `Đúng nhịp ${hits}/${v.length} nốt${tune.lh ? ' (micro nghe một nốt mỗi lúc)' : ''}`);
      } else {
        askParent('Con giữ nhịp đều và đàn trọn bài chưa?', gradeInput.length);
      }
    }

    // ----- Kết quả -----
    function record(r: Pick<SongRun, 'mode' | 'total' | 'hits' | 'source' | 'passed'>): void {
      const sh = solo();
      hooks.onRun({ songId: full.id, ...r, level: r.mode === 'tempo' ? level : undefined, bpm, hints: hints, phrase, ...(sh ? { hand: sh } : {}) });
    }

    function askParent(question: string, total: number): void {
      state = 'rate';
      status.replaceChildren(h('b', {}, `👪 Bố mẹ: ${question}`));
      setBar(
        backButton(reset),
        button({
          icon: '✓',
          label: 'Rồi!',
          kind: 'good',
          onTap: () => {
            record({ mode, total, hits: total, source: 'parent', passed: true });
            showResult(1, 'Bố mẹ khen con đàn tốt!');
          },
        }),
        button({
          icon: '↻',
          label: 'Chưa',
          kind: 'retry',
          onTap: () => {
            record({ mode, total, hits: 0, source: 'parent', passed: false });
            showResult(0.5, 'Không sao — tập thêm chút nữa nhé!');
          },
        }),
      );
    }

    function showResult(s: number, text: string): void {
      state = 'result';
      const stars = starsFor(s);
      if (s >= PASS_SCORE) {
        void app.audio.chime();
        confetti();
      }
      if (opts.stage) app.audio.applause();
      status.replaceChildren(
        h('span', { class: 'stars small' }, '★'.repeat(stars), h('span', { class: 'stars-off' }, '★'.repeat(3 - stars))),
        ' ',
        h('b', {}, text),
      );
      // Thang tốc độ: đạt ở tốc độ chậm → gợi ý lên nấc tiếp (40 → 50 → 60 → 72)
      const nextTempo = TEMPOS.find((t) => t > bpm);
      const passedNow = s >= PASS_SCORE;
      setBar(
        opts.stage ? null : backButton(() => hooks.onBack()),
        opts.stage ? null : button({ icon: '↻', label: 'Chơi lại', onTap: reset }),
        !opts.stage && mode === 'tempo' && passedNow && nextTempo
          ? button({ icon: '🐇', label: `Nhanh hơn (${nextTempo})`, onTap: () => ((bpm = nextTempo), reset()) })
          : null,
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }),
      );
    }

    // Micro nghe được nốt (chế độ chờ)
    const unWaitNote = app.mic.onNote((n) => {
      if (state === 'playing' && mode === 'wait') onWaitInput(n.midi, 'mic');
    });

    let disposed = false;
    reset();
    return () => {
      disposed = true;
      token++;
      cancelAnimationFrame(raf);
      unTempo();
      unWaitNote();
      demoRun?.cancel();
      overlay.destroy();
      kb.destroy();
    };
  };
}
