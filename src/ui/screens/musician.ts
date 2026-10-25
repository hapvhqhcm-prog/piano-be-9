/**
 * (+ 2026-10-17, OWNER duyệt — rà soát giáo viên dài hạn) "🎹 NHẠC CÔNG NHỎ" — màn của hoạt động `musician`
 * (session.ts chỉ gọi musicianScreen; chunk riêng). Phần thuần + dữ liệu: lessons/musician.ts.
 *  · 🔀 Dịch giọng / 👂 Đàn theo tai: màn "tìm nốt" chung (bên dưới) — micro nghe từng nốt THEO THỨ TỰ, không chấm nhịp,
 *    gợi ý tăng dần (cao hơn / thấp hơn → nghe lại nốt → chỉ phím). Không micro: bé đàn rồi TỰ KIỂM TRA, chạm "👍 Con làm đúng rồi".
 *  · 🎹 Đệm hợp âm: musicianChords.ts · ✨ Đánh bóng & 🎤 Buổi diễn nhỏ: musicianStage.ts.
 */
import { cancelSpeech, speak } from '../../audio/voice';
import {
  SeqJudge,
  byEarPhrase,
  transposeHome,
  transposeSource,
  transposeTargets,
  type MusicianActivity,
  type SeqNote,
} from '../../lessons/musician';
import type { Tune } from '../../music/tune';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { keyboardRangeFor, midiToFreq, pitchToMidi, viName, type Pitch } from '../../piano/pitchTable';
import type { ParentResult, SongRun } from '../../progress/schema';
import type { App, Screen } from '../App';
import { confetti } from '../components/celebrate';
import { backButton, button, h } from '../components/dom';
import { mascot } from '../components/mascot';
import { speakChip } from '../components/speakChip';
import { StaffView } from '../components/staffView';
import { selfOkButton } from '../selfCheck';
import { accompanyScreen } from './musicianChords';
import { polishScreen, recitalScreen } from './musicianStage';
import '../../styles/musician.css';

export interface MusicianHooks {
  /** Tuần của bài học (buổi diễn nhỏ lưu theo tuần) */
  week: number;
  /** Lượt bài hát (đánh bóng, buổi diễn) — như bài hát thường của bài học */
  onRun(run: Omit<SongRun, 'ts'>): void;
  /** PARENT_ASSESSMENT của trò (`byear:…`, `transpose:…`, `accomp:…`, `polish:…`) */
  record(noteId: string, result: ParentResult): void;
  onDone(): void;
  onBack(): void;
}

const PRAISE = ['Giỏi quá! 🌟', 'Tai con thính ghê! 👂', 'Con là nhạc công rồi! 🎹', 'Tuyệt cú mèo! 🐱'];
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
/** replaceChildren bỏ qua phần tử rỗng */
const fill = (el: HTMLElement, ...xs: Array<Node | string | null | false>) => el.replaceChildren(...xs.filter((x): x is Node | string => !!x));

export function musicianScreen(app: App, a: MusicianActivity, hooks: MusicianHooks): Screen {
  const task = a.task;
  switch (task.type) {
    case 'transpose': {
      const notes = transposeTargets(task);
      return findScreen(app, {
        tag: 'Dịch giọng',
        title: a.title,
        intro: a.intro,
        notes,
        source: transposeSource(task),
        home: transposeHome(notes),
        keyName: task.keyName,
        recordId: `transpose:${task.songId}:${task.semitones}`,
        hooks,
      });
    }
    case 'by-ear': {
      const phrase = byEarPhrase(task);
      return findScreen(app, {
        tag: 'Đàn theo tai',
        title: a.title,
        intro: a.intro,
        notes: phrase,
        phrase,
        octaveFree: true,
        recordId: `byear:${task.songId}`,
        hooks,
      });
    }
    case 'accompany':
      return accompanyScreen(app, a, task, hooks);
    case 'polish':
      return polishScreen(app, a, task, hooks);
    case 'recital':
      return recitalScreen(app, a, hooks);
  }
}

interface FindOpts {
  tag: string;
  title: string;
  intro: string;
  notes: SeqNote[];
  /** Dịch giọng: bản thế Đô (vẽ khuông + số ngón) */
  source?: Tune | null;
  /** Dịch giọng: phím "nhà mới" (ngón cái) */
  home?: Pitch | null;
  keyName?: string;
  /** Đàn theo tai: câu app đàn mẫu (có trường độ) */
  phrase?: Array<SeqNote & { beats: number; start: number }>;
  octaveFree?: boolean;
  recordId: string;
  hooks: MusicianHooks;
}

/** Bpm app đàn mẫu câu "đàn theo tai" */
const EAR_BPM = 80;

/** Màn "tìm nốt" chung cho dịch giọng & đàn theo tai. */
function findScreen(app: App, o: FindOpts): Screen {
  return (root) => {
    const { hooks } = o;
    if (!o.notes.length) {
      window.setTimeout(hooks.onDone, 0);
      return;
    }
    const judge = new SeqJudge(o.notes, !!o.octaveFree);
    const ear = !!o.phrase;
    let token = 0;
    let unNote: () => void = () => undefined;
    let timer = 0;
    let listening = false;
    const pitches = [...o.notes.map((n) => n.pitch), ...(o.home ? [o.home] : [])];
    const [low, high] = keyboardRangeFor(pitches);
    const kb = new PianoKeyboard({
      low,
      high,
      labels: 'c',
      fingerOnPress: false,
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (listening) onHeard(pitchToMidi(p));
      },
    });
    const stage = h('div', { class: 'stage scrollable mu-stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap short' }, kb.el), bar));
    const setBar = (...b: Array<HTMLElement | null | false>) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));
    const micOn = () => app.mic.state === 'on';

    const halt = (): number => {
      token++;
      listening = false;
      unNote();
      unNote = () => undefined;
      window.clearTimeout(timer);
      app.audio.stopAll();
      cancelSpeech();
      return token;
    };

    const lightHome = () => {
      kb.clear();
      if (o.home) kb.setTargets([{ pitch: o.home, finger: 1, hand: 'RH', label: '🏠' }]);
    };

    const sourceStaff = (): HTMLElement | null => {
      if (!o.source) return null;
      const st = new StaffView(o.source, { names: false, fingers: true, measuresPerPage: 4 });
      st.el.classList.add('iv-staff');
      return st.el;
    };

    /** App đàn câu mẫu (đàn theo tai) — tiếng app được tính "đang phát" → micro không nghe nhầm. */
    const playPhrase = (then: () => void) => {
      const tk = halt();
      const ph = o.phrase ?? [];
      const spb = 60 / EAR_BPM;
      const t0 = app.audio.now() + 0.25;
      for (const n of ph) void app.audio.scheduleFreq(midiToFreq(pitchToMidi(n.pitch)), t0 + n.start * spb, Math.max(0.25, n.beats * spb * 0.92), 0.8);
      const end = ph.length ? Math.max(...ph.map((n) => n.start + n.beats)) : 0;
      timer = window.setTimeout(() => tk === token && then(), (0.25 + end * spb + 0.35) * 1000);
    };

    function intro(): void {
      halt();
      lightHome();
      const said = `${o.title}. ${o.intro}`;
      fill(
        stage,
        h('div', { class: 'step-tag' }, o.tag),
        ear ? h('div', { class: 'hero-mascot' }, mascot('love', 84)) : null,
        h('h1', { class: 'title' }, o.title),
        h('p', { class: 'lead' }, o.intro, speakChip(app, said)),
        sourceStaff(),
        o.home ? h('div', { class: 'mu-home' }, `🏠 Nhà mới: ngón cái ở ${viName(o.home)} (${o.keyName ?? ''})`) : null,
        ear ? h('p', { class: 'muted' }, `Nốt đầu tiên: ${viName(o.notes[0].pitch)} — con tìm các nốt sau bằng tai nhé!`) : null,
      );
      setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => (ear ? playPhrase(listen) : listen()) }));
      const tk = token;
      timer = window.setTimeout(() => tk === token && void speak(app, said), 400);
    }

    const dots = h('div', { class: 'mu-dots', 'aria-hidden': 'true' });
    const hint = h('div', { class: 'mu-hint', role: 'status', 'aria-live': 'polite' });
    const renderDots = () =>
      dots.replaceChildren(
        ...o.notes.map((_, i) => h('span', { class: `mu-dot${i < judge.index ? ' on' : i === judge.index ? ' now' : ''}` })),
      );
    const say = (text: string, kind: '' | 'good' | 'wrong' = '') => {
      hint.textContent = text;
      hint.className = `mu-hint${kind ? ` ${kind}` : ''}`;
    };

    function listen(): void {
      const tk = halt();
      listening = true;
      lightHome();
      // Đàn theo tai: nốt đầu sáng sẵn (điểm xuất phát)
      if (ear) kb.setTargets([{ pitch: o.notes[0].pitch, finger: o.notes[0].finger, hand: 'RH' }]);
      renderDots();
      say(micOn() ? '🎤 App đang nghe — đàn từng nốt, không cần đúng nhịp' : 'Con đàn trên đàn thật — đúng thì chạm 👍 "Con làm đúng rồi"');
      fill(
        stage,
        h('div', { class: 'step-tag' }, o.tag),
        h('h1', { class: 'title' }, ear ? '👂 Con tìm lại câu thầy vừa đàn' : `🔀 Đàn ở ${o.keyName ?? 'thế mới'} — cùng số ngón!`),
        sourceStaff(),
        dots,
        hint,
      );
      setBar(
        backButton(intro),
        ear ? button({ icon: '🔊', label: 'Nghe lại', onTap: () => playPhrase(listen) }) : null,
        button({ icon: '💡', label: 'Gợi ý', onTap: showNext }),
        selfOkButton(() => success(true), { label: 'Con làm đúng rồi', primary: !micOn() }),
      );
      if (micOn()) {
        app.mic.resetTracker();
        unNote = app.mic.onNote((n) => tk === token && listening && onHeard(n.midi));
      }
    }

    /** 💡 Gợi ý: chỉ phím nốt đang tìm (tính như bậc gợi ý cao nhất). */
    function showNext(): void {
      const w = judge.want;
      if (!w) return;
      judge.shown++;
      kb.setTargets([{ pitch: w.pitch, finger: w.finger, hand: 'RH' }]);
      void app.audio.playPitch(w.pitch, 0.8);
      say(`💡 Nốt tiếp theo: ${viName(w.pitch)}${w.finger ? ` — ngón ${w.finger}` : ''}`);
    }

    function onHeard(midi: number): void {
      const v = judge.feed(midi);
      if (v.kind === 'ignore') return;
      if (v.kind === 'ok') {
        kb.setResult(o.notes[v.index].pitch, 'good');
        renderDots();
        if (v.done) {
          listening = false;
          timer = window.setTimeout(() => success(false), 500);
          return;
        }
        say(pick(['🎤 Đúng rồi! Nốt tiếp…', '🎤 Đúng! Tiếp nào…', '🎤 Hay! Còn nữa…']), 'good');
        kb.setTargets([]);
        if (micOn()) app.mic.resetTracker();
        return;
      }
      const w = judge.want!;
      switch (v.hint) {
        case 'up':
          say('⬆️ Cao hơn một chút (sang phải)', 'wrong');
          break;
        case 'down':
          say('⬇️ Thấp hơn một chút (sang trái)', 'wrong');
          break;
        case 'listen':
          say('🔊 Nghe lại nốt này nè…', 'wrong');
          void app.audio.playPitch(w.pitch, 0.8);
          break;
        case 'show':
          kb.setTargets([{ pitch: w.pitch, finger: w.finger, hand: 'RH' }]);
          say(`👋 Phím sáng đó: ${viName(w.pitch)}${w.finger ? ` — ngón ${w.finger}` : ''}`, 'wrong');
          break;
        default:
          say('🎤 Đúng tên nốt rồi — thử quãng tám này nhé', 'wrong');
      }
    }

    function success(byParent: boolean): void {
      halt();
      const result: ParentResult = byParent ? 'correct' : judge.result();
      hooks.record(o.recordId, result);
      confetti(24);
      void app.audio.chime();
      kb.clear();
      fill(
        stage,
        h('div', { class: 'hero-mascot' }, mascot('cheer', 100)),
        h('h1', { class: 'title' }, pick(PRAISE)),
        h(
          'p',
          { class: 'lead' },
          ear ? 'Con đã tìm lại được câu nhạc bằng tai!' : `Con đã đàn ở ${o.keyName ?? 'thế mới'} — cùng số ngón, nghe vẫn là bài đó!`,
        ),
      );
      setBar(
        button({
          icon: '↻',
          label: 'Chơi lại',
          onTap: () => {
            judge.reset();
            if (ear) playPhrase(listen);
            else listen();
          },
        }),
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }),
      );
    }

    intro();
    return () => {
      halt();
      kb.destroy();
    };
  };
}
