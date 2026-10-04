import { wait } from '../../audio/AudioEngine';
import { PASS_SCORE, gradeTiming, score as scoreOf, starsFor, type HeardEvent } from '../../music/timing';
import {
  accompaniment,
  beatsPerMeasure,
  phraseRanges,
  playable,
  slice,
  timeline,
  totalBeats,
  type TimedNote,
  type Tune,
} from '../../music/tune';
import { fingerOnKeyboard } from '../../piano/fingering';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToFreq, midiToPitch, noteLabel, pitchFreq, pitchToMidi } from '../../piano/pitchTable';
import type { SongRun } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { StaffView } from '../components/staffView';

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

/** Độ trễ ước tính của micro (giây): khung phân tích + ổn định 3 khung. */
const MIC_LATENCY = 0.18;
const TEMPOS = [40, 50, 60];

type State = 'idle' | 'demo' | 'countin' | 'playing' | 'rate' | 'result';

/**
 * Màn bài hát kiểu "app nghe đàn":
 * - Từng nốt (chờ): con trỏ chờ bé đàn đúng nốt (micro) hoặc bấm "Nốt tiếp".
 * - Theo nhịp: đếm vào 1-2-3-4, máy gõ nhịp + nhạc đệm; Mức 2 con trỏ nhảy, Mức 3 băng chuyền.
 */
export function songScreen(app: App, full: Tune, opts: SongOptions, hooks: SongHooks) {
  return (root: HTMLElement) => {
    const settings = app.store.settings;
    const lhOn = full.hand === 'LH' || app.store.get().progress.currentWeek >= 6;
    let mode = opts.mode;
    let level: 2 | 3 = opts.level ?? 2;
    let bpm = full.bpm;
    let phrase: [number, number] | null = null;
    let tune = full;
    let state: State = 'idle';
    let token = 0;
    let raf = 0;
    let staff: StaffView;

    const kb = new PianoKeyboard({
      labels: opts.hints === 'full' ? 'c' : 'none',
      fingerOnPress: (p) => fingerOnKeyboard(p, lhOn),
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (state === 'playing' && mode === 'wait' && !micOn()) onWaitInput(pitchToMidi(p), 'tap');
      },
    });

    const head = h('div', { class: 'song-head' });
    const staffBox = h('div', { class: 'song-staff' });
    const status = h('div', { class: 'song-status' });
    const bar = h('div', { class: 'actions' });
    root.append(
      h('div', { class: 'screen' }, head, staffBox, status, h('div', { class: 'keyboard-wrap song-kb' }, kb.el), bar),
    );

    const micOn = () => app.mic.state === 'on';
    const setBar = (...b: (HTMLElement | null | false)[]) =>
      bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    // ---------------- Đầu trang: tên bài + lựa chọn ----------------
    const chip = (label: string, on: boolean, onTap: () => void) => {
      const b = h('button', { class: `seg-btn small${on ? ' on' : ''}`, type: 'button' }, label);
      b.addEventListener('click', () => state === 'idle' || state === 'result' ? onTap() : undefined);
      return b;
    };

    function renderHead(): void {
      const rows: HTMLElement[] = [
        h(
          'div',
          { class: 'song-title' },
          h('b', {}, full.titleVi),
          h('span', { class: 'muted' }, ` · ${full.title}${full.composer ? ' — ' + full.composer : ''}`),
        ),
      ];
      const opt = h('div', { class: 'song-opts' });
      if (opts.free) {
        opt.append(
          chip('🐢 Từng nốt', mode === 'wait', () => ((mode = 'wait'), reset())),
          chip('🎵 Theo nhịp', mode === 'tempo', () => ((mode = 'tempo'), reset())),
        );
      }
      if (mode === 'tempo' && !opts.stage) {
        if (opts.free) opt.append(chip('Con trỏ', level === 2, () => ((level = 2), reset())), chip('Băng chuyền', level === 3, () => ((level = 3), reset())));
        for (const t of TEMPOS) opt.append(chip(`${t === 40 ? '🐢 ' : t === 60 ? '🐇 ' : ''}${t}`, bpm === t, () => ((bpm = t), reset())));
      }
      const ranges = phraseRanges(full);
      if (ranges.length > 1 && !opts.stage) {
        opt.append(chip('Cả bài', !phrase, () => ((phrase = null), reset())));
        ranges.forEach(([a, b], i) =>
          opt.append(chip(`Câu ${i + 1}`, !!phrase && phrase[0] === a, () => ((phrase = [a, b]), reset()))),
        );
      }
      if (opt.childElementCount) rows.push(opt);
      head.replaceChildren(...rows);
    }

    function buildStaff(): void {
      tune = phrase ? slice(full, phrase[0], phrase[1]) : full;
      staff = new StaffView(tune, {
        names: opts.hints !== 'staff',
        fingers: opts.hints === 'full',
        mode: mode === 'tempo' && level === 3 ? 'scroll' : 'page',
      });
      staffBox.replaceChildren(staff.el);
    }

    const notes = () => playable(tune);

    function lightNote(n: TimedNote | undefined, force = false): void {
      kb.setTargets([]);
      if (!n || (opts.hints !== 'full' && !force)) return;
      kb.setTargets([{ pitch: n.pitch!, finger: n.finger, hand: tune.hand }]);
    }

    function reset(): void {
      token++;
      cancelAnimationFrame(raf);
      app.audio.stopAll();
      state = 'idle';
      renderHead();
      buildStaff();
      kb.clear();
      const ns = notes();
      if (ns[0]) staff.setCursor(ns[0].index);
      lightNote(ns[0]);
      status.replaceChildren(
        h(
          'span',
          {},
          opts.intro && !phrase ? opts.intro + ' ' : '',
          mode === 'wait'
            ? micOn()
              ? '🎤 Bấm Bắt đầu rồi đàn từng nốt — app nghe và tự đi tiếp.'
              : 'Bấm Bắt đầu, đàn từng nốt rồi bấm "Nốt tiếp".'
            : `Đếm vào 1-2-3-4 rồi đàn theo tiếng "tích" (${bpm} nhịp/phút).`,
        ),
      );
      setBar(
        backButton(() => hooks.onBack()),
        button({ icon: '🔊', label: 'Nghe mẫu', onTap: () => void demo() }),
        button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void start() }),
      );
    }

    // ---------------- Nghe mẫu ----------------
    async function demo(): Promise<void> {
      const tk = ++token;
      state = 'demo';
      const spb = 60 / bpm;
      const t0 = app.audio.now() + 0.3;
      const tl = timeline(tune);
      for (const n of tl) {
        if (n.rest || !n.pitch) continue;
        void app.audio.scheduleFreq(pitchFreq(n.pitch), t0 + n.start * spb, n.beats * spb * 0.95);
      }
      scheduleAccomp(t0, spb);
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: reset }));
      status.textContent = '🔊 Nghe mẫu — nhìn con trỏ chạy nhé';
      const total = totalBeats(tune);
      const loop = () => {
        if (tk !== token) return;
        const beat = (app.audio.now() - t0) / spb;
        follow(beat, true);
        if (beat < total + 0.3) raf = requestAnimationFrame(loop);
        else reset();
      };
      raf = requestAnimationFrame(loop);
    }

    function scheduleAccomp(t0: number, spb: number): void {
      if (!settings.accompaniment || micOn()) return;
      for (const a of accompaniment(tune)) {
        void app.audio.scheduleFreq(midiToFreq(a.midi), t0 + a.start * spb, a.beats * spb * 0.9, 0.45, false);
      }
    }

    /** Con trỏ/băng chuyền theo phách hiện tại. */
    function follow(beat: number, lightKeys: boolean): TimedNote | undefined {
      const tl = timeline(tune);
      let cur: TimedNote | undefined;
      for (const n of tl) if (n.start <= beat + 0.05) cur = n;
      if (mode === 'tempo' && level === 3) staff.setTime(Math.max(0, beat));
      if (cur && !cur.rest) staff.setCursor(cur.index);
      if (lightKeys) {
        // Sáng phím của nốt sắp tới (sớm nửa phách)
        const upcoming = tl.find((n) => !n.rest && n.start >= beat - 0.05 && n.start - beat < 0.5) ?? (cur && !cur.rest ? cur : undefined);
        if (opts.hints === 'full') lightNote(upcoming);
      }
      return cur;
    }

    // ---------------- Bắt đầu ----------------
    async function start(): Promise<void> {
      await app.ensureMic(); // chạm "Bắt đầu" = thao tác người dùng
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
      const ns = notes();
      const n = ns[wIdx];
      if (!n) return finishWait();
      staff.setCursor(n.index);
      lightNote(n);
      const label = noteLabel(n.pitch!);
      status.replaceChildren(
        h('span', { class: 'song-progress' }, `${wIdx + 1}/${ns.length}`),
        ' ',
        opts.hints === 'staff' ? 'Nhìn khuông nhạc — nốt đang sáng' : `Đàn ${label}${n.finger ? ` — ngón ${n.finger}` : ''}`,
        micOn() ? ' · 🎤' : '',
      );
      setBar(
        backButton(reset),
        opts.hints !== 'full' ? button({ icon: '💡', label: 'Gợi ý', onTap: () => hint(n) }) : null,
        !micOn() ? button({ icon: '✓', label: 'Nốt tiếp', kind: 'good', onTap: () => onWaitInput(pitchToMidi(n.pitch!), 'parent') }) : null,
        button({ icon: '⏹', label: 'Dừng', onTap: reset }),
      );
    }

    function hint(n: TimedNote): void {
      lightNote(n, true);
      status.textContent = `💡 Đó là ${noteLabel(n.pitch!)}${n.finger ? ` — ngón ${n.finger}` : ''}`;
      const tk = token;
      void wait(1800).then(() => tk === token && opts.hints !== 'full' && kb.setTargets([]));
    }

    function onWaitInput(midi: number, from: 'mic' | 'tap' | 'parent'): void {
      const n = notes()[wIdx];
      if (!n) return;
      if (midi === pitchToMidi(n.pitch!)) {
        if (wWrongThis === 0) wHits++;
        staff.mark(n.index, 'hit');
        kb.setResult(n.pitch!, 'good');
        wIdx++;
        wWrongThis = 0;
        if (from === 'mic') app.mic.resetTracker();
        showWaitNote();
      } else if (from === 'mic') {
        wWrongThis++;
        const heard = midiToPitch(midi);
        kb.setResult(heard, 'heard');
        status.textContent = `🎤 Con vừa đàn ${noteLabel(heard).split(' / ')[0]} — tìm ${noteLabel(n.pitch!).split(' / ')[0]} nhé`;
      }
    }

    function finishWait(): void {
      const total = notes().length;
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
      // Đếm vào + gõ nhịp cả bài
      for (let b = -bpmM; b < total; b++) app.audio.click(t0 + b * spb, ((b % bpmM) + bpmM) % bpmM === 0);
      scheduleAccomp(t0, spb);
      const heard: HeardEvent[] = [];
      const ns = notes();
      const unNote = app.mic.onNote((n) => {
        const beat = (app.audio.now() - MIC_LATENCY - t0) / spb;
        heard.push({ beat, midi: n.midi });
        // Tô xanh ngay khi trúng nốt đang tới
        const v = gradeTiming(ns.map((x) => ({ index: x.index, start: x.start, midi: pitchToMidi(x.pitch!) })), heard);
        v.forEach((r) => r.hit && staff.mark(r.index, 'hit'));
      });
      app.mic.resetTracker();
      const countEl = h('div', { class: 'countin' });
      status.replaceChildren(countEl);
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: () => (unNote(), reset()) }));
      const loop = () => {
        if (tk !== token) return void unNote();
        const beat = (app.audio.now() - t0) / spb;
        if (beat < 0) {
          countEl.textContent = String(bpmM - Math.ceil(-beat - 1e-6) + 1);
        } else {
          if (state === 'countin') {
            state = 'playing';
            status.replaceChildren(h('span', {}, micOn() ? '🎤 Đàn theo nhịp — app đang nghe' : '🎵 Đàn theo tiếng "tích"!'));
          }
          follow(beat, true);
        }
        if (beat < total + 0.6) raf = requestAnimationFrame(loop);
        else {
          unNote();
          finishTempo(heard);
        }
      };
      raf = requestAnimationFrame(loop);
    }

    function finishTempo(heard: HeardEvent[]): void {
      kb.setTargets([]);
      const ns = notes();
      if (micOn()) {
        const v = gradeTiming(ns.map((x) => ({ index: x.index, start: x.start, midi: pitchToMidi(x.pitch!) })), heard);
        v.forEach((r) => staff.mark(r.index, r.hit ? 'hit' : 'miss'));
        const s = scoreOf(v);
        const hits = v.filter((r) => r.hit).length;
        record({ mode: 'tempo', total: ns.length, hits, source: 'mic', passed: s >= PASS_SCORE });
        showResult(s, `Đúng nhịp ${hits}/${ns.length} nốt`);
      } else {
        askParent('Con giữ nhịp đều và đàn trọn bài chưa?', ns.length);
      }
    }

    // ----- Kết quả -----
    function record(r: Pick<SongRun, 'mode' | 'total' | 'hits' | 'source' | 'passed'>): void {
      hooks.onRun({
        songId: full.id,
        ...r,
        level: r.mode === 'tempo' ? level : undefined,
        bpm,
        hints: opts.hints,
        phrase,
      });
    }

    function askParent(question: string, total: number): void {
      state = 'rate';
      status.replaceChildren(h('b', {}, `👪 Bố/mẹ: ${question}`));
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
      if (s >= PASS_SCORE) void app.audio.chime();
      if (opts.stage) app.audio.applause();
      status.replaceChildren(
        h('span', { class: 'stars small' }, '★'.repeat(stars), h('span', { class: 'stars-off' }, '★'.repeat(3 - stars))),
        ' ',
        h('b', {}, text),
      );
      setBar(
        opts.stage ? null : backButton(() => hooks.onBack()),
        opts.stage ? null : button({ icon: '↻', label: 'Chơi lại', onTap: reset }),
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }),
      );
    }

    // Micro nghe được nốt (chế độ chờ)
    const unWaitNote = app.mic.onNote((n) => {
      if (state === 'playing' && mode === 'wait') onWaitInput(n.midi, 'mic');
    });

    reset();
    return () => {
      token++;
      cancelAnimationFrame(raf);
      unWaitNote();
      kb.destroy();
    };
  };
}
