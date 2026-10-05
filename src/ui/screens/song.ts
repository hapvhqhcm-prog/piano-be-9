import { wait } from '../../audio/AudioEngine';
import { matchHeard } from '../../audio/match';
import { confetti } from '../components/celebrate';
import { PASS_SCORE, TIMING_WINDOWS, gradeTiming, score as scoreOf, starsFor, type HeardEvent } from '../../music/timing';
import {
  DYN_VOLUME,
  accompaniment,
  allTimed,
  beatsPerMeasure,
  dynAtBeat,
  expressionUsed,
  onsets,
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

export interface SongOptions {
  mode: 'wait' | 'tempo';
  level?: 2 | 3;
  hints: 'full' | 'names' | 'staff';
  intro?: string;
  /** Cho đổi chế độ / chọn câu / tốc độ (thư viện bài hát) */
  free?: boolean;
  /** Sân khấu: chỉ chơi cả bài một lần rồi báo xong */
  stage?: boolean;
}

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
    let bpm = full.bpm;
    let phrase: [number, number] | null = null;
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
          full.lh ? h('span', { class: 'hand-tag' }, '🙌 hai tay') : null,
        ),
      );
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
      if (ranges.length > 1 && !opts.stage) {
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
      });
      staffBox.replaceChildren(staff.el);
    }

    const groups = () => onsets(tune);
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
      status.replaceChildren(
        h(
          'span',
          {},
          opts.intro && !phrase ? opts.intro + ' ' : '',
          mode === 'wait'
            ? micOn()
              ? '🎤 Bấm Bắt đầu rồi đàn từng nốt — app nghe và tự đi tiếp.'
              : 'Bấm 🎬 Xem mẫu để xem thầy đàn, rồi Bắt đầu và đàn từng nốt.'
            : `Đếm vào rồi đàn theo tiếng "tích" (${bpm} nhịp/phút).`,
        ),
      );
      setBar(
        backButton(() => hooks.onBack()),
        button({ icon: '🎬', label: 'Xem mẫu', onTap: () => void demo() }),
        button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void start() }),
      );
    }

    // ---------------- Xem mẫu: "video" bàn tay thầy đàn ----------------
    let demoRun: { cancel: () => void; done: Promise<void> } | null = null;
    async function demo(): Promise<void> {
      const tk = ++token;
      state = 'demo';
      const spb = 60 / bpm;
      overlay.setGhost(false);
      kb.setTargets([]);
      const caption = h('span', {}, '🎬 Xem thầy đàn mẫu — nhìn ngón tay nhé');
      status.replaceChildren(caption);
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
    function startWait(): void {
      token++;
      state = 'playing';
      wIdx = 0;
      wHits = 0;
      wWrongThis = 0;
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
        if (from === 'mic') app.mic.resetTracker();
        showWaitNote();
      } else if (from === 'mic') {
        // Nhiều nốt cùng lúc: micro hay nghe lẫn → không tính là sai, chỉ chỉ ra phím nghe được
        if (midisOf(g).length < 2) wWrongThis++;
        const heard = midiToPitch(midi);
        kb.setResult(heard, 'heard');
        status.textContent = `🎤 Con vừa đàn ${viName(heard)} — tìm ${viName(g.pitches[0])} nhé`;
      }
    }

    function finishWait(): void {
      const total = groups().length;
      if (micOn()) {
        const s = total ? wHits / total : 0;
        record({ mode: 'wait', total, hits: wHits, source: 'mic', passed: s >= PASS_SCORE });
        showResult(s, `Con đàn đúng ngay ${wHits}/${total} nốt`);
      } else {
        askParent('Con đã đàn hết bài chưa?', total);
      }
    }

    // ----- Theo nhịp -----
    function startTempo(): void {
      const tk = ++token;
      state = 'countin';
      staff.clearMarks();
      const spb = 60 / bpm;
      const bpmM = beatsPerMeasure(tune);
      const t0 = app.audio.now() + 0.4 + bpmM * spb; // phách 0 của bài
      const total = totalBeats(tune);
      for (let b = -bpmM; b < total; b++) app.audio.click(t0 + b * spb, ((b % bpmM) + bpmM) % bpmM === 0);
      scheduleAccomp(t0, spb);
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
      status.replaceChildren(countEl);
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: () => (unNote(), reset()) }));
      const loop = () => {
        if (tk !== token) return void unNote();
        const beat = (app.audio.now() - t0) / spb;
        if (beat < 0) {
          countEl.textContent = beat < -bpmM ? ' ' : String(Math.max(1, bpmM - Math.ceil(-beat - 1e-6) + 1));
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
      hooks.onRun({ songId: full.id, ...r, level: r.mode === 'tempo' ? level : undefined, bpm, hints: hints, phrase });
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
