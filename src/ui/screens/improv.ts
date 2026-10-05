import { cancelSpeech, speak } from '../../audio/voice';
import type { Activity } from '../../lessons/types';
import type { Tune } from '../../music/tune';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { keyboardRangeFor, midiToFreq, midiToPitch, pitchToMidi, viName, type Pitch } from '../../piano/pitchTable';
import {
  BACKING_TOP,
  RHYTHM_BEATS,
  addNote,
  endsHome,
  isBlackMidi,
  makeComposition,
  nextCompositionTitle,
  pentatonicBacking,
  positionNotes,
  questionNotes,
  tonicOf,
  undoNote,
  used,
  type ComposeNote,
  type ComposeRhythm,
  type Pos,
} from '../../practice/compose';
import type { ParentResult } from '../../progress/schema';
import type { App } from '../App';
import { confetti } from '../components/celebrate';
import { HandOverlay, playDemo, type DemoEvent } from '../components/demo';
import { backButton, button, h, toast } from '../components/dom';
import { mascot } from '../components/mascot';
import { speakChip } from '../components/speakChip';
import { StaffView } from '../components/staffView';

type ImprovActivity = Extract<Activity, { kind: 'improv' }>;

export interface ImprovHooks {
  title: string;
  intro: string;
  mode: ImprovActivity['mode'];
  position?: Pos;
  bars?: number;
  /** PARENT_ASSESSMENT khi xong trò — noteId `improv:${mode}`, luôn 'correct' (sáng tạo không có "sai") */
  record(noteId: string, result: ParentResult): void;
  onDone(): void;
  onBack(): void;
}

/** Trò phím đen chạy bao lâu (giây) */
const BLACK_SECS = 40;
const BLACK_BPM = 72;
const QA_ROUNDS = 3;
const QA_BPM = 80;
const PRAISE = ['Hay quá! 🌟', 'Con là nhạc sĩ rồi! 🎼', 'Nghe vui tai ghê! 🎶', 'Tuyệt cú mèo! 🐱'];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Nốt (theo phách) → sự kiện "thầy đàn mẫu". */
function eventsOf(notes: readonly ComposeNote[], hand: 'RH' | 'LH'): DemoEvent[] {
  let t = 0;
  return notes.map((n) => {
    const ev: DemoEvent = { time: t, dur: n.beats, notes: [{ pitch: n.pitch, finger: n.finger, hand }], caption: viName(n.pitch) };
    t += n.beats;
    return ev;
  });
}

function staffOf(notes: readonly ComposeNote[], hand: 'RH' | 'LH', bars: number, id: string, cursorLast = true): HTMLElement {
  const tune: Tune = {
    id,
    title: '',
    titleVi: '',
    hand,
    bpm: 72,
    timeSignature: '4/4',
    notes: notes.map((n) => ({ pitch: n.pitch, beats: n.beats, finger: n.finger })),
  };
  const st = new StaffView(tune, { names: true, fingers: false, measuresPerPage: Math.min(4, Math.max(1, bars)) });
  if (notes.length && cursorLast) st.setCursor(notes.length - 1);
  st.el.classList.add('iv-staff');
  return st.el;
}

/**
 * v5 — SÁNG TẠO (OWNER duyệt 2026-10-05):
 * - black-keys: app đàn nền ngũ cung nhẹ (không chiếm micro), bé ứng tấu trên PHÍM ĐEN — nốt nào cũng hay ✨.
 * - question-answer: app đàn "câu hỏi" 2 ô, bé đàn "câu trả lời" kết về nốt nhà (micro/phím ảo, không micro → bố mẹ xác nhận).
 * - compose: bé viết `bars` ô nhịp bằng phím ảo + bảng nhịp, nghe lại, đặt tên, lưu vào Thư viện ("Bài của con").
 */
export function improvScreen(app: App, hooks: ImprovHooks) {
  return (root: HTMLElement) => {
    const position: Pos = hooks.position ?? 'C';
    const bars = Math.max(1, Math.min(8, hooks.bars ?? 4));
    const { hand, notes: posNotes } = positionNotes(position);
    const tonic = tonicOf(position);
    const black = hooks.mode === 'black-keys';
    let token = 0;
    let unNote: () => void = () => undefined;
    let schedTimer = 0;
    let clockTimer = 0;
    let demoRun: { cancel: () => void; done: Promise<void> } | null = null;
    /** Nhận nốt từ phím ảo (theo trò đang chạy) */
    let onKey: (p: Pitch) => void = () => undefined;

    const [low, high] = black ? (['C4', 'C6'] as [Pitch, Pitch]) : keyboardRangeFor(posNotes.map((n) => n.pitch));
    const kb = new PianoKeyboard({
      low,
      high,
      labels: 'c',
      fingerOnPress: black ? false : (p) => posNotes.find((n) => pitchToMidi(n.pitch) === pitchToMidi(p))?.finger,
      onPress: (p) => {
        void app.audio.playPitch(p);
        onKey(p);
      },
    });
    const overlay = new HandOverlay(kb);
    const stage = h('div', { class: `stage scrollable iv-stage iv-${hooks.mode}` });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap short' }, kb.el), bar));
    const setBar = (...b: (HTMLElement | null | false)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    const lightPosition = () =>
      kb.setTargets(posNotes.map((n) => ({ pitch: n.pitch, finger: n.finger, hand, label: pitchToMidi(n.pitch) === pitchToMidi(tonic) ? '🏠' : undefined })));
    const lightBlack = () => {
      const all: Pitch[] = [];
      for (let m = pitchToMidi(low); m <= pitchToMidi(high); m++) if (isBlackMidi(m)) all.push(midiToPitch(m));
      kb.setGuides(all);
    };

    function halt(): number {
      token++;
      unNote();
      unNote = () => undefined;
      onKey = () => undefined;
      window.clearInterval(schedTimer);
      window.clearInterval(clockTimer);
      if (demoRun) {
        demoRun.cancel();
        demoRun = null;
      }
      overlay.hide();
      app.audio.stopAll();
      cancelSpeech();
      return token;
    }

    function intro(): void {
      halt();
      kb.clear();
      if (black) lightBlack();
      else lightPosition();
      const said = `${hooks.title}. ${hooks.intro}`;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Sáng tạo'),
        h('div', { class: 'hero-mascot' }, mascot('love', 92)),
        h('h1', { class: 'title' }, hooks.title),
        h('p', { class: 'lead' }, hooks.intro, speakChip(app, said)),
      );
      setBar(
        backButton(hooks.onBack),
        button({
          icon: '▶',
          label: 'Bắt đầu',
          kind: 'primary',
          onTap: () => (black ? void startBlack() : hooks.mode === 'question-answer' ? qaQuestion() : compose()),
        }),
      );
      const tk = token;
      window.setTimeout(() => tk === token && void speak(app, said), 400);
    }

    function praiseEnd(text: string, sub: string, again: () => void): void {
      halt();
      hooks.record(`improv:${hooks.mode}`, 'correct');
      confetti();
      void app.audio.chime();
      stage.replaceChildren(h('div', { class: 'hero-mascot' }, mascot('cheer', 110)), h('h1', { class: 'title' }, text), h('p', { class: 'lead' }, sub));
      setBar(button({ icon: '↻', label: 'Chơi nữa', onTap: again }), button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    // ================= PHÍM ĐEN =================
    async function startBlack(): Promise<void> {
      const tk0 = halt();
      await app.ensureMic();
      if (tk0 !== token) return;
      const tk = ++token;
      kb.clear();
      lightBlack();
      let count = 0;
      const field = h('div', { class: 'iv-sparkles', 'aria-hidden': 'true' });
      const counter = h('div', { class: 'iv-count' }, '✨ Chạm phím đen nào!');
      const fill = h('div', { class: 'tq-fill' });
      stage.replaceChildren(
        h('h1', { class: 'title' }, '🎹 Đàn phím đen tùy thích!'),
        h(
          'p',
          { class: 'lead' },
          app.mic.state === 'on' ? '🎤 App đang nghe — nốt phím đen nào cũng hay!' : 'Đàn trên đàn thật hoặc chạm phím đen trên iPad',
        ),
        field,
        counter,
        h('div', { class: 'tq-bar iv-clock' }, fill),
      );
      const sparkle = (m: number) => {
        count++;
        counter.textContent = `🌟 ${count} nốt phím đen`;
        const s = h('span', { class: 'iv-spark', style: { left: `${6 + Math.random() * 86}%` } }, pick(['✨', '⭐', '🌟', '💫', '🎵']));
        s.title = viName(midiToPitch(m));
        field.append(s);
        window.setTimeout(() => s.remove(), 2400);
      };
      onKey = (p) => isBlackMidi(pitchToMidi(p)) && sparkle(pitchToMidi(p));
      unNote = app.mic.onNote((n) => {
        if (tk === token && isBlackMidi(n.midi) && n.midi > BACKING_TOP) sparkle(n.midi);
      });
      // Nền đệm: hẹn giờ dần từng đoạn ngắn (không xếp sẵn hàng trăm nốt), track=false để micro vẫn nghe bé
      const spb = 60 / BLACK_BPM;
      const totalBars = Math.ceil(BLACK_SECS / (4 * spb));
      const notes = pentatonicBacking(totalBars);
      const t0 = app.audio.now() + 0.3;
      let next = 0;
      const sched = () => {
        if (tk !== token) return;
        const horizon = app.audio.now() + 1.2;
        while (next < notes.length && t0 + notes[next].beat * spb < horizon) {
          const n = notes[next++];
          void app.audio.scheduleFreq(midiToFreq(n.midi), t0 + n.beat * spb, n.beats * spb, n.vol, false);
        }
      };
      sched();
      schedTimer = window.setInterval(sched, 300);
      const wall0 = performance.now();
      clockTimer = window.setInterval(() => {
        if (tk !== token) return;
        const f = Math.min(1, (performance.now() - wall0) / (totalBars * 4 * spb * 1000));
        fill.style.width = `${f * 100}%`;
        if (f >= 1) endBlack(count);
      }, 200);
      setBar(button({ icon: '⏹', label: 'Xong', kind: 'primary', onTap: () => endBlack(count) }));
    }

    function endBlack(count: number): void {
      praiseEnd(pick(PRAISE), count ? `Con đã đàn ${count} nốt phím đen — bản nhạc của riêng con!` : 'Bản nhạc phím đen của riêng con!', () => void startBlack());
    }

    // ================= ĐỐI ĐÁP =================
    let qaRound = 0;
    let qaFails = 0;

    function qaQuestion(): void {
      const tk = halt();
      const q = questionNotes(position, qaRound + Math.floor(Math.random() * 4));
      kb.clear();
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Câu ${qaRound + 1} / ${QA_ROUNDS}`),
        h('h1', { class: 'title' }, '👂 Nghe thầy hỏi…'),
        staffOf(q, hand, 2, `qa-${qaRound}`, false),
        h('p', { class: 'lead' }, 'Câu hỏi chưa về nhà — con sẽ trả lời!'),
      );
      setBar(backButton(intro));
      const run = playDemo(app.audio, kb, overlay, eventsOf(q, hand), { bpm: QA_BPM });
      demoRun = run;
      void run.done.then(() => {
        if (tk !== token) return;
        demoRun = null;
        qaAnswer(q);
      });
    }

    function qaAnswer(q: ComposeNote[]): void {
      const tk = halt();
      kb.clear();
      lightPosition();
      const heard: number[] = [];
      let lastAt = 0;
      const trail = h('div', { class: 'iv-trail' });
      const push = (m: number) => {
        heard.push(m);
        trail.append(h('span', { class: `iv-note${m % 12 === pitchToMidi(tonic) % 12 ? ' home' : ''}` }, viName(midiToPitch(m))));
        if (trail.children.length > 10) trail.firstElementChild?.remove();
        lastAt = performance.now();
      };
      onKey = (p) => push(pitchToMidi(p));
      const micOn = app.mic.state === 'on';
      unNote = app.mic.onNote((n) => tk === token && push(n.midi));
      // Micro: im 2,5 giây sau ≥ 3 nốt → tự chấm
      if (micOn)
        clockTimer = window.setInterval(() => {
          if (tk === token && heard.length >= 3 && performance.now() - lastAt > 2500) qaJudge(q, heard);
        }, 300);
      const home = viName(tonic);
      const said = `Đến lượt con! Đàn 2 ô nhịp, kết thúc ở ${home}.`;
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Câu ${qaRound + 1} / ${QA_ROUNDS}`),
        h('h1', { class: 'title' }, '🗣️ Con trả lời!'),
        h('p', { class: 'lead' }, `Đàn 2 ô nhịp, kết thúc ở ${home} 🏠`, speakChip(app, said)),
        trail,
        h('p', { class: 'muted iv-mic' }, micOn ? '🎤 App đang nghe đàn thật' : 'Đàn trên đàn thật hoặc chạm phím trên iPad'),
      );
      setBar(
        backButton(intro),
        button({ icon: '🔊', label: 'Nghe lại câu hỏi', onTap: () => qaReplay(q) }),
        button({ icon: '✓', label: 'Con xong rồi', kind: 'primary', onTap: () => qaJudge(q, heard) }),
      );
      window.setTimeout(() => tk === token && void speak(app, said), 300);
    }

    function qaReplay(q: ComposeNote[]): void {
      const tk = halt();
      kb.clear();
      const run = playDemo(app.audio, kb, overlay, eventsOf(q, hand), { bpm: QA_BPM });
      demoRun = run;
      void run.done.then(() => tk === token && qaAnswer(q));
    }

    function qaJudge(q: ComposeNote[], heard: number[]): void {
      halt();
      if (!heard.length) return qaParent(q);
      if (endsHome(heard, position)) return qaGood();
      qaFails++;
      stage.replaceChildren(
        h('div', { class: 'hero-mascot' }, mascot('think', 90)),
        h('h1', { class: 'title' }, `Gần rồi! Câu trả lời kết thúc ở ${viName(tonic)} 🏠 nhé`),
        h('p', { class: 'lead' }, `Nốt cuối con đàn: ${viName(midiToPitch(heard[heard.length - 1]))}`),
      );
      setBar(
        backButton(intro),
        qaFails >= 2 ? button({ icon: '👪', label: 'Bố mẹ: qua', onTap: qaGood }) : null,
        button({ icon: '↻', label: 'Trả lời lại', kind: 'primary', onTap: () => qaAnswer(q) }),
      );
    }

    function qaParent(q: ComposeNote[]): void {
      halt();
      stage.replaceChildren(
        h('h1', { class: 'title' }, `👪 Bố mẹ: câu trả lời của con kết thúc ở ${viName(tonic)} chưa?`),
        h('p', { class: 'lead' }, 'Con đàn trên đàn thật — bố mẹ nghe giúp nhé'),
      );
      setBar(
        backButton(() => qaAnswer(q)),
        button({ icon: '↻', label: 'Làm lại', kind: 'retry', onTap: () => qaAnswer(q) }),
        button({ icon: '👪', label: 'Về nhà rồi!', kind: 'good', onTap: qaGood }),
      );
    }

    function qaGood(): void {
      halt();
      qaFails = 0;
      qaRound++;
      if (qaRound >= QA_ROUNDS) {
        qaRound = 0;
        return praiseEnd('Con đối đáp giỏi quá! 🎤', 'Câu hỏi – câu trả lời: con biết đưa giai điệu về nhà rồi!', qaQuestion);
      }
      void app.audio.chime();
      confetti(20);
      stage.replaceChildren(h('div', { class: 'hero-emoji' }, '🏠'), h('h1', { class: 'title' }, `${pick(PRAISE)} Về nhà rồi!`));
      setBar(button({ icon: '▶', label: 'Câu tiếp', kind: 'primary', onTap: qaQuestion }));
    }

    // ================= SÁNG TÁC =================
    let notes: ComposeNote[] = [];
    let rhythm: ComposeRhythm = 'walk';
    const BPB = 4;
    const full = () => used(notes) >= bars * BPB - 1e-9;

    function compose(): void {
      halt();
      kb.clear();
      lightPosition();
      onKey = (p) => {
        const pn = posNotes.find((n) => pitchToMidi(n.pitch) === pitchToMidi(p));
        if (!pn) return toast('Dùng 5 phím sáng thôi nhé ✋');
        const out = addNote(notes, { pitch: pn.pitch, beats: RHYTHM_BEATS[rhythm], finger: pn.finger }, { bars, beatsPerBar: BPB });
        if (!out) return toast(`Bài đủ ${bars} ô rồi — bấm 💾 Lưu bài nhé`);
        notes = out;
        renderCompose();
        if (full()) void speak(app, 'Xong rồi! Nghe lại hoặc lưu bài nhé.');
      };
      renderCompose();
    }

    function renderCompose(): void {
      const palette = h(
        'div',
        { class: 'iv-palette', role: 'group', 'aria-label': 'Chọn nhịp' },
        ...(
          [
            ['walk', '👣', 'Đi', '1 phách'],
            ['long', '🐢', 'Đi-i', '2 phách'],
            ['run', '🏃', 'Chạy-chạy', 'nửa phách'],
          ] as const
        ).map(([r, icon, label, sub]) => {
          const b = h(
            'button',
            { class: `iv-rh${rhythm === r ? ' on' : ''}`, type: 'button', 'aria-pressed': String(rhythm === r) },
            h('span', { class: 'iv-rh-icon' }, icon),
            h('span', { class: 'iv-rh-label' }, label),
            h('span', { class: 'iv-rh-sub' }, sub),
          );
          b.addEventListener('click', () => {
            rhythm = r;
            renderCompose();
          });
          return b;
        }),
      );
      const left = bars * BPB - used(notes);
      const barNo = Math.min(bars, Math.floor(used(notes) / BPB) + 1);
      stage.replaceChildren(
        h('h1', { class: 'title iv-ctitle' }, `🎼 Con sáng tác ${bars} ô nhịp`),
        palette,
        notes.length
          ? staffOf(notes, hand, bars, `compose-${notes.length}`)
          : h('div', { class: 'iv-empty' }, '✏️ Chọn nhịp, rồi chạm phím sáng để viết nốt đầu tiên'),
        h(
          'p',
          { class: 'iv-left' },
          full() ? `✅ Đủ ${bars} ô nhịp — nghe lại rồi lưu bài nhé!` : `Ô ${barNo} / ${bars} · còn ${left} phách${notes.length >= 3 ? ` · nhớ kết thúc ở ${viName(tonic)} 🏠` : ''}`,
        ),
      );
      setBar(
        backButton(intro),
        button({ icon: '↶', label: 'Xóa nốt', disabled: !notes.length, onTap: () => ((notes = undoNote(notes)), renderCompose()) }),
        button({ icon: '▶', label: 'Nghe bài', disabled: !notes.length, onTap: playBack }),
        button({ icon: '💾', label: 'Lưu bài', kind: full() ? 'good' : 'primary', disabled: !full(), onTap: nameIt }),
      );
    }

    function playBack(): void {
      if (demoRun) demoRun.cancel();
      kb.clear();
      const run = playDemo(app.audio, kb, overlay, eventsOf(notes, hand), { bpm: 84 });
      demoRun = run;
      void run.done.then(() => {
        if (demoRun !== run) return;
        demoRun = null;
        overlay.hide();
        lightPosition();
      });
    }

    function nameIt(): void {
      const tk = halt();
      onKey = () => undefined;
      const def = nextCompositionTitle(app.store.compositions());
      const input = h('input', { class: 'iv-name', type: 'text', maxlength: '40', value: def, 'aria-label': 'Tên bài' });
      stage.replaceChildren(
        h('div', { class: 'hero-emoji' }, '🎼'),
        h('h1', { class: 'title' }, 'Đặt tên cho bài của con'),
        input,
        h('p', { class: 'muted' }, 'Bố mẹ gõ giúp con nhé — hoặc giữ tên này'),
      );
      setBar(
        backButton(() => compose()),
        button({
          icon: '💾',
          label: 'Lưu vào Thư viện',
          kind: 'primary',
          onTap: () => {
            if (tk !== token) return;
            const c = makeComposition(notes, { id: `c${Date.now().toString(36)}`, title: input.value || def, createdAt: Date.now() });
            app.store.addComposition(c);
            notes = [];
            praiseEnd(`🎼 "${c.title}"`, 'Bài của con đã vào Thư viện — mục 🎼 Bài của con!', compose);
          },
        }),
      );
    }

    intro();
    return () => {
      halt();
      overlay.destroy();
      kb.destroy();
    };
  };
}
