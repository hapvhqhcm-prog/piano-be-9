import { wait } from '../../audio/AudioEngine';
import { speak, speechBusy, cancelSpeech } from '../../audio/voice';
import type { SingRound } from '../../lessons/types';
import { SungNoteListener, matchSung, singFeedback, type SungEstimate } from '../../music/singMatch';
import { fingerOnKeyboard, type Hand } from '../../piano/fingering';
import { PianoKeyboard, type KeyTarget } from '../../piano/PianoKeyboard';
import { keyboardRangeFor, midiToPitch, pitchToMidi, viName, type Pitch } from '../../piano/pitchTable';
import type { ParentResult } from '../../progress/schema';
import type { App } from '../App';
import { confetti } from '../components/celebrate';
import { backButton, button, h } from '../components/dom';
import { mascot } from '../components/mascot';
import { MicHonestyWatch, micHonestyBox } from '../components/micHonesty';
import { meterPct } from '../../audio/MicListener';
import '../../styles/sing.css';

export interface SingHooks {
  title: string;
  intro: string;
  rounds: SingRound[];
  /** PARENT_ASSESSMENT: `sing:<nốt>` (hát) và `singplay:<nốt>` (đàn) */
  record(noteId: string, result: ParentResult): void;
  onDone(): void;
  onBack(): void;
}

/** Hát mãi chưa xong nốt (im) → nhắc nhẹ sau ngần này ms */
const QUIET_HINT_MS = 7000;
/** Khoảng cách giữa các nốt app đàn mẫu */
const NOTE_GAP_MS = 750;

/**
 * HÁT TRƯỚC KHI ĐÀN (OWNER duyệt 2026-10-08): mỗi lượt — 👂 nghe app đàn 2–3 nốt → 🎤 hát lại TỪNG nốt
 * (micro nghe giọng: src/music/singMatch.ts; tắt micro → bố mẹ chạm "Đúng rồi" / "Gần đúng") → 🎹 đàn các nốt đó.
 * Không bao giờ chê giọng hát: hát chưa trúng 2 lần → khen rồi đi tiếp (bàn phím giúp tai nhớ nốt).
 */
export function singScreen(app: App, hooks: SingHooks) {
  return (root: HTMLElement) => {
    let r = 0;
    let token = 0;
    let disposed = false;
    let unFrame: () => void = () => undefined;
    let unNote: () => void = () => undefined;
    let timer = 0;
    /** Đang ở bước đàn: vị trí nốt tiếp theo cần đàn (−1 = không ở bước đàn) */
    let playPos = -1;
    /** Lượt này hát đúng hết (micro) */
    let roundOk = true;
    let spokeIntro = false;
    const listener = new SungNoteListener();
    const micOn = () => app.mic.state === 'on';
    /**
     * (+ 2026-10-08) MICRO NÓI THẬT: bước đang để micro nghe ('sing' = hát, 'play' = đàn; null = không). Bé có vẻ đang
     * hát / đàn mà micro không ra nốt nào 3 lần liền → "Micro nghe chưa rõ — không phải lỗi của con" + bố mẹ chấm giúp.
     */
    let micStep: 'sing' | 'play' | null = null;
    let onHonestParent: () => void = () => undefined;
    const honesty = new MicHonestyWatch(app.mic, {
      active: () => micStep !== null && micOn() && !disposed,
      // Hát: giọng to hơn ngưỡng mà chưa ra cao độ; đàn: tiếng gõ phím / "suýt nghe"
      activity: (f, near) => (micStep === 'sing' ? f.onset || (meterPct(f) >= 55 && !listener.hearing) : f.onset || near),
      onTrigger: () => {
        if (stage.querySelector('.mic-honest')) return;
        stage.append(micHonestyBox(() => onHonestParent()));
      },
    });
    const round = (): SingRound => hooks.rounds[r] ?? hooks.rounds[0];
    const idOf = (x: SingRound) => x.notes.join('-');
    const names = (x: SingRound) => x.notes.map((p) => viName(p)).join(' – ');

    const all = hooks.rounds.flatMap((x) => x.notes);
    const [low, high] = keyboardRangeFor(all.length ? all : ['C4']);
    const handOf = (x: SingRound): Hand => x.hand ?? (pitchToMidi(x.notes[0]) < 60 ? 'LH' : 'RH');
    const fingerOf = (x: SingRound, p: Pitch): { finger: number; hand: Hand } | null => {
      const k = x.notes.findIndex((n) => pitchToMidi(n) === pitchToMidi(p));
      const f = k >= 0 ? x.fingers?.[k] : undefined;
      return f ? { finger: f, hand: handOf(x) } : fingerOnKeyboard(p, handOf(x) === 'LH');
    };
    const kb = new PianoKeyboard({
      low,
      high,
      labels: 'c',
      fingerOnPress: (p) => fingerOf(round(), p),
      onPress: (p) => {
        void app.audio.playPitch(p);
        // Micro tắt: chạm phím ảo ở bước đàn cũng tính (như "Từng nốt")
        if (playPos >= 0 && !micOn()) onPlayed(pitchToMidi(p));
      },
    });
    const stage = h('div', { class: 'stage scrollable sing-stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap sing-kb' }, kb.el), bar));
    const setBar = (...b: (HTMLElement | null | false)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    /** Bong bóng tên nốt của lượt — trạng thái: now / good / tried / again */
    let bubbles: HTMLElement[] = [];
    const bubbleRow = (x: SingRound) => {
      bubbles = x.notes.map((p, i) =>
        h('div', { class: 'sing-note', 'data-i': String(i) }, h('span', { class: 'sing-note-num' }, String(i + 1)), h('span', { class: 'sing-note-name' }, viName(p))),
      );
      return h('div', { class: 'sing-notes' }, ...bubbles);
    };
    const mark = (i: number, cls: 'now' | 'good' | 'tried' | 'again' | null) => {
      const b = bubbles[i];
      if (!b) return;
      b.classList.remove('now', 'again');
      if (cls === 'good' || cls === 'tried') b.classList.remove('good', 'tried');
      if (cls) b.classList.add(cls);
    };
    const hintEl = () => stage.querySelector<HTMLElement>('.sing-hint');
    const hint = (text: string, kind: 'listen' | 'good' | 'soft' = 'listen') => {
      const el = hintEl();
      if (!el) return;
      el.textContent = text;
      el.dataset.kind = kind;
    };

    /** Dừng mọi thứ đang chạy (nghe, đàn mẫu, hẹn giờ) trước mỗi bước mới. */
    function halt(): number {
      token++;
      window.clearTimeout(timer);
      unFrame();
      unFrame = () => undefined;
      unNote();
      unNote = () => undefined;
      listener.reset();
      playPos = -1;
      micStep = null;
      stage.querySelector('.mic-honest')?.remove();
      return token;
    }

    /** App đàn mẫu các nốt (phím sáng theo) — trả về false nếu bị ngắt giữa chừng. */
    async function playNotes(x: SingRound, tk: number, light = true): Promise<boolean> {
      for (let i = 0; i < x.notes.length; i++) {
        if (tk !== token || disposed) return false;
        if (light) mark(i, 'now');
        kb.setResult(x.notes[i], 'show');
        void app.audio.playPitch(x.notes[i], 0.7);
        await wait(NOTE_GAP_MS);
        if (light) mark(i, null);
        kb.setResult(null, null);
      }
      return tk === token && !disposed;
    }

    function intro(): void {
      halt();
      kb.setTargets([]);
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Hát rồi đàn'),
        h('h1', { class: 'title' }, hooks.title),
        h('p', { class: 'lead' }, hooks.intro),
        h('div', { class: 'sing-hero' }, '👂 → 🎤 → 🎹'),
      );
      setBar(
        backButton(hooks.onBack),
        button({
          icon: '▶',
          label: 'Bắt đầu',
          kind: 'primary',
          onTap: async () => {
            const tk = halt();
            await app.ensureMic(); // chạm "Bắt đầu" = thao tác người dùng (iOS cần để mở micro)
            if (tk === token && !disposed) void listen();
          },
        }),
      );
    }

    /** 👂 Bước 1: nghe app đàn các nốt của lượt. */
    async function listen(): Promise<void> {
      const tk = halt();
      const x = round();
      roundOk = true;
      kb.setTargets([]);
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Lượt ${r + 1} / ${hooks.rounds.length}`),
        h('h1', { class: 'title' }, `👂 Nghe thầy đàn ${x.notes.length} nốt`),
        bubbleRow(x),
        h('p', { class: 'sing-hint', 'data-kind': 'listen' }, 'Nghe thật kỹ — lát nữa con hát lại nhé!'),
      );
      setBar(backButton(intro));
      await wait(400);
      if (!(await playNotes(x, tk))) return;
      if (micOn()) singNote(0);
      else parentSing();
    }

    /** 🎤 Bước 2 (micro bật): bé hát nốt thứ i — app nghe giọng, so tên nốt (bỏ quãng 8). */
    function singNote(i: number, tries = 0): void {
      const tk = halt();
      const x = round();
      const p = x.notes[i];
      bubbles.forEach((_, j) => j !== i && bubbles[j].classList.remove('now', 'again'));
      mark(i, 'now');
      const title = stage.querySelector('.title');
      if (title) title.textContent = `🎤 Con hát nốt ${i + 1}: “${viName(p)}”`;
      hint(tries ? 'Hát lại nào — app đang nghe 🎤' : `Hát “${viName(p)}” thật rõ nhé — app đang nghe 🎤`);
      setBar(
        backButton(() => void listen()),
        button({
          icon: '🔊',
          label: 'Nghe nốt này',
          onTap: () => {
            listener.reset();
            void app.audio.playPitch(p, 0.8);
          },
        }),
        // Luôn có lối ra cho bố mẹ (micro không nghe rõ giọng) — không bao giờ kẹt
        button({ icon: '👪', label: 'Đúng rồi', kind: 'good', onTap: () => sungDone(i, true) }),
      );
      if (!spokeIntro && i === 0) {
        spokeIntro = true;
        void speak(app, 'Giờ con hát lại từng nốt nhé!');
      }
      let lastSound = Date.now();
      micStep = 'sing';
      honesty.step();
      // Micro nghe chưa rõ giọng → bố mẹ chấm cả lượt hát (như khi tắt micro)
      onHonestParent = () => parentSing();
      unFrame = app.mic.onFrame((f) => {
        if (tk !== token) return;
        const t = app.audio.now();
        // Tiếng app (đàn mẫu / chuông) và giọng đọc không phải tiếng bé hát
        const busy = f.app !== 'quiet' || speechBusy();
        const est = listener.push(busy || !f.pitch ? { t, freq: null, clarity: 0 } : { t, freq: f.pitch.freq, clarity: f.pitch.clarity });
        if (listener.hearing) {
          lastSound = Date.now();
          honesty.heard();
          if (hintEl()?.dataset.kind !== 'good') hint('🎤 App đang nghe con hát…');
        }
        if (est) {
          honesty.heard();
          onSung(i, tries, est);
        }
      });
      let quietCounted = false;
      const quiet = () => {
        if (tk !== token || disposed) return;
        if (Date.now() - lastSound >= QUIET_HINT_MS) {
          hint('🎤 App chưa nghe thấy — con hát to hơn, hoặc bố mẹ chạm 👪 Đúng rồi', 'soft');
          if (!quietCounted) honesty.timeout();
          quietCounted = true;
        }
        timer = window.setTimeout(quiet, 1000);
      };
      timer = window.setTimeout(quiet, QUIET_HINT_MS);
    }

    function onSung(i: number, tries: number, est: SungEstimate): void {
      const x = round();
      const v = matchSung(est.midi, x.notes[i]);
      const n = tries + 1;
      if (v.ok) {
        hint(singFeedback(v, n), 'good');
        return sungDone(i, true, 900);
      }
      if (n >= 2) {
        // Hai lần chưa trúng: vẫn khen, đi tiếp — không bắt hát mãi
        hint(singFeedback(v, n), 'soft');
        return sungDone(i, false, 1400);
      }
      hint(singFeedback(v, n), 'soft');
      mark(i, 'again');
      const tk = halt();
      // Lệch xa: app đàn lại nốt này cho bé nghe rồi hát theo
      timer = window.setTimeout(() => {
        if (tk !== token || disposed) return;
        void app.audio.playPitch(x.notes[i], 0.8);
        timer = window.setTimeout(() => tk === token && !disposed && singNote(i, n), v.close ? 300 : 1100);
      }, 700);
    }

    /** Xong một nốt hát (đúng / đã cố gắng) → nốt tiếp hoặc bước đàn. */
    function sungDone(i: number, ok: boolean, delay = 300): void {
      const tk = halt();
      mark(i, ok ? 'good' : 'tried');
      if (!ok) roundOk = false;
      if (ok) void app.audio.chime();
      timer = window.setTimeout(() => {
        if (tk !== token || disposed) return;
        if (i + 1 < round().notes.length) return singNote(i + 1);
        hooks.record(`sing:${idOf(round())}`, roundOk ? 'correct' : 'retry');
        toPlay(roundOk ? 'Con hát đúng hết rồi! 🎉' : 'Con hát hay lắm! 🎵');
      }, delay);
    }

    /** 🎤 Bước 2 (micro tắt): bé hát cả lượt, bố mẹ chấm — "Gần đúng" vẫn được đi tiếp (không chê). */
    function parentSing(): void {
      halt();
      const x = round();
      const title = stage.querySelector('.title');
      if (title) title.textContent = `🎤 Con hát lại ${x.notes.length} nốt nhé!`;
      hint(`Hát tên nốt: ${names(x)}`);
      void speak(app, `Con hát lại nhé: ${names(x)}`);
      setBar(
        backButton(intro),
        button({ icon: '🔊', label: 'Nghe lại', onTap: () => void playNotes(x, token) }),
        button({
          icon: '🙂',
          label: 'Gần đúng',
          onTap: () => {
            hooks.record(`sing:${idOf(x)}`, 'retry');
            toPlay('Hát giúp tai nhớ nốt — con giỏi lắm! 🎵');
          },
        }),
        button({
          icon: '👪',
          label: 'Đúng rồi',
          kind: 'good',
          onTap: () => {
            hooks.record(`sing:${idOf(x)}`, 'correct');
            void app.audio.chime();
            toPlay('Con hát đúng rồi! 🎉');
          },
        }),
      );
    }

    /** 🎹 Bước 3: đàn các nốt vừa hát (đúng thứ tự). Micro nghe, hoặc chạm phím ảo / bố mẹ xác nhận. */
    function toPlay(praise: string): void {
      const tk = halt();
      const x = round();
      playPos = 0;
      const ts: KeyTarget[] = x.notes.map((p) => {
        const f = fingerOf(x, p);
        return { pitch: p, finger: f?.finger, hand: f?.hand ?? handOf(x) };
      });
      kb.setTargets(ts);
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Lượt ${r + 1} / ${hooks.rounds.length}`),
        h('h1', { class: 'title' }, `🎹 Giờ con đàn: ${names(x)}`),
        bubbleRow(x),
        h('p', { class: 'sing-praise' }, praise),
        h('p', { class: 'sing-hint', 'data-kind': 'listen' }, micOn() ? '🎤 Đàn trên đàn thật — app nghe nhé' : 'Đàn trên đàn thật nhé!'),
      );
      mark(0, 'now');
      setBar(
        backButton(() => void listen()),
        button({ icon: '🔊', label: 'Nghe lại', onTap: () => void app.audio.playPitch(x.notes[playPos >= 0 ? playPos : 0], 0.8) }),
        button({ icon: '👪', label: 'Đúng rồi', kind: 'good', onTap: () => playDone() }),
      );
      if (micOn()) {
        app.mic.resetTracker();
        micStep = 'play';
        honesty.step();
        // Micro nghe chưa rõ tiếng đàn → thôi nghe, bố mẹ nhìn bé đàn rồi bấm "Đúng rồi"
        onHonestParent = () => {
          if (tk !== token) return;
          micStep = null;
          unNote();
          unNote = () => undefined;
          stage.querySelector('.mic-honest')?.remove();
          hint('👪 Bố mẹ nhìn con đàn rồi bấm Đúng rồi nhé', 'listen');
        };
        unNote = app.mic.onNote((n) => {
          if (tk !== token) return;
          honesty.heard(); // micro nghe ra nốt (đúng hay sai) → micro vẫn nghe được
          onPlayed(n.midi);
        });
      }
    }

    function onPlayed(midi: number): void {
      const x = round();
      if (playPos < 0 || playPos >= x.notes.length) return;
      const want = x.notes[playPos];
      if (midi === pitchToMidi(want)) {
        kb.setResult(want, 'good');
        mark(playPos, 'good');
        playPos++;
        if (playPos >= x.notes.length) return playDone();
        mark(playPos, 'now');
        hint(`Đúng ${viName(want)}! Tiếp nào 🎵`, 'good');
      } else {
        const heard = midiToPitch(midi);
        kb.setResult(heard, 'heard');
        hint(`Con vừa đàn ${viName(heard)} — tìm ${viName(want)} nhé`, 'soft');
      }
    }

    function playDone(): void {
      halt();
      const x = round();
      x.notes.forEach((_, i) => mark(i, 'good'));
      hooks.record(`singplay:${idOf(x)}`, 'correct');
      void app.audio.chime();
      confetti(20);
      hint('Hát đúng — đàn đúng! Tai và tay cùng nhớ nốt rồi! 🎉', 'good');
      setBar(
        backButton(() => void listen()),
        button({
          icon: '▶',
          label: 'Tiếp',
          kind: 'primary',
          onTap: () => {
            r++;
            if (r >= hooks.rounds.length) done();
            else void listen();
          },
        }),
      );
    }

    function done(): void {
      halt();
      kb.setTargets([]);
      stage.replaceChildren(
        h('div', { class: 'hero-mascot' }, mascot('cheer', 90)),
        h('h1', { class: 'title' }, 'Con hát rồi đàn giỏi quá! 🎤🎹'),
        h('p', { class: 'lead' }, 'Nốt nào hát được thì tay cũng đàn dễ hơn.'),
      );
      setBar(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    intro();
    return () => {
      disposed = true;
      halt();
      honesty.dispose();
      cancelSpeech();
      kb.destroy();
    };
  };
}
