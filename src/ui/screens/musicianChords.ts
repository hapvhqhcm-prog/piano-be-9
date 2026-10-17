/**
 * (+ 2026-10-17, OWNER duyệt) 🎹 ĐỆM HỢP ÂM I – V7 / I – IV – V7 dưới giai điệu quen (hoạt động `musician`, task 'accompany').
 * Mỗi ô nhịp: app hiện ký hiệu hợp âm (lượt 1: phím sáng + số ngón; lượt 2: chỉ ký hiệu) → bé bấm hợp âm tay trái
 * (rải: từng nốt từ dưới lên) → micro kiểm tra "đủ nốt" (MicListener.verifyChord — như hợp âm ở màn Từng nốt) → app HÁT
 * giai điệu ô đó (tiếng app tính "đang phát" → micro không nghe nhầm) → ô sau. Không chấm nhịp (bé bấm khi sẵn sàng).
 * Không micro: bé bấm, bố mẹ chạm "Đúng rồi". Ghi PARENT_ASSESSMENT `accomp:<bài>` ở cuối lượt 2.
 */
import { cancelSpeech, speak } from '../../audio/voice';
import { SeqJudge, accompanyBars, chordOf } from '../../lessons/musician';
import type { MusicianActivity } from '../../lessons/musician';
import type { ChordSymbol, MusicianTask } from '../../lessons/types';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToFreq, midiToPitch, pitchToMidi, viName } from '../../piano/pitchTable';
import type { App, Screen } from '../App';
import { confetti } from '../components/celebrate';
import { backButton, button, h } from '../components/dom';
import { mascot } from '../components/mascot';
import { speakChip } from '../components/speakChip';
import { selfStudy } from '../selfStudy';
import type { MusicianHooks } from './musician';
import '../../styles/musician.css';

/** Tốc độ app hát giai điệu một ô */
const SING_BPM = 84;

export function accompanyScreen(app: App, a: MusicianActivity, task: Extract<MusicianTask, { type: 'accompany' }>, hooks: MusicianHooks): Screen {
  return (root) => {
    const bars = accompanyBars(task);
    if (!bars.length) {
      window.setTimeout(hooks.onDone, 0);
      return;
    }
    const broken = task.style === 'broken';
    const used = [...new Set(task.chords)];
    let token = 0;
    let timer = 0;
    let unNote: () => void = () => undefined;
    let round = 1;
    let bar = 0;
    let misses = 0;
    /** Ô của lượt 2 mà bé bấm sai ít nhất một lần */
    const missedBars = new Set<number>();
    let judge: SeqJudge | null = null;

    const kb = new PianoKeyboard({ low: 'A2', high: 'C5', labels: 'c', fingerOnPress: false, onPress: (p) => onKey(pitchToMidi(p)) });
    const stage = h('div', { class: 'stage scrollable mu-stage' });
    const actions = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap short' }, kb.el), actions));
    const setBar = (...b: Array<HTMLElement | null | false>) => actions.replaceChildren(...b.filter((x): x is HTMLElement => !!x));
    const micOn = () => app.mic.state === 'on';
    const pressed = new Set<number>();
    let pressTimer = 0;

    const halt = (): number => {
      token++;
      unNote();
      unNote = () => undefined;
      window.clearTimeout(timer);
      app.audio.stopAll();
      cancelSpeech();
      return token;
    };

    const keysOf = (s: ChordSymbol) => {
      const c = chordOf(s);
      return c.pitches.map((pitch, i) => ({ pitch, finger: c.fingers[i], hand: 'LH' as const }));
    };
    const playChord = (s: ChordSymbol) => chordOf(s).pitches.forEach((p, i) => void app.audio.playPitch(p, broken ? 0.6 + i * 0.1 : 1));
    const chordCard = (s: ChordSymbol, cls = '') =>
      h('span', { class: `mu-chord${cls}` }, s, h('small', {}, chordOf(s).pitches.map((p) => viName(p)).join('–')));

    function intro(): void {
      halt();
      kb.clear();
      const said = `${a.title}. ${a.intro}`;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Đệm hợp âm'),
        h('h1', { class: 'title' }, a.title),
        h('p', { class: 'lead' }, a.intro, speakChip(app, said)),
        h(
          'div',
          { class: 'mu-chords' },
          ...used.map((s) => {
            const b = button({
              label: `${s} · ${chordOf(s).name}`,
              onTap: () => {
                kb.setTargets(keysOf(s));
                playChord(s);
              },
            });
            return b;
          }),
        ),
        h('p', { class: 'muted' }, `Tay trái: ${used.map((s) => `${s} = ngón ${chordOf(s).fingers.join('–')}`).join(' · ')}`),
      );
      setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => startRound(1) }));
      const tk = token;
      timer = window.setTimeout(() => tk === token && void speak(app, said), 400);
    }

    function startRound(r: number): void {
      round = r;
      bar = 0;
      ask();
    }

    function lead(): HTMLElement {
      return h(
        'div',
        { class: 'mu-chords', 'aria-label': 'Hợp âm từng ô' },
        ...task.chords.map((s, i) => chordCard(s, i < bar ? ' done' : i === bar ? ' now' : '')),
      );
    }

    /** Chờ bé bấm hợp âm của ô `bar`. */
    function ask(): void {
      const tk = halt();
      const s = task.chords[bar];
      misses = 0;
      judge = broken ? new SeqJudge(chordOf(s).pitches.map((p) => ({ pitch: p, orig: p }))) : null;
      kb.clear();
      if (round === 1) kb.setTargets(keysOf(s));
      const hint = h('div', { class: 'mu-hint', role: 'status', 'aria-live': 'polite' }, micOn() ? '🎤 App đang nghe hợp âm…' : '');
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Lượt ${round}/2 · Ô ${bar + 1}/${task.chords.length}`),
        lead(),
        h('div', { class: 'mu-big' }, s),
        h('p', { class: 'lead' }, `${broken ? 'Rải' : 'Bấm'} hợp âm ${chordOf(s).name}${round === 1 ? ` — ngón ${chordOf(s).fingers.join('–')}` : ''}`),
        hint,
      );
      setBar(
        backButton(intro),
        button({ icon: '🔊', label: 'Nghe hợp âm', onTap: () => playChord(s) }),
        button({ icon: selfStudy(app) ? '✋' : '👪', label: 'Đúng rồi', kind: micOn() ? 'plain' : 'good', onTap: () => good() }),
      );
      const wrong = (text: string) => {
        misses++;
        if (round === 2) missedBars.add(bar);
        hint.textContent = text;
        hint.className = 'mu-hint wrong';
        if (misses >= 2) kb.setTargets(keysOf(s));
      };
      if (!micOn()) return;
      app.mic.resetTracker();
      let askedAt = -1;
      unNote = app.mic.onNote((n) => {
        if (tk !== token) return;
        if (judge) {
          const v = judge.feed(n.midi);
          if (v.kind === 'ok') {
            kb.setResult(chordOf(s).pitches[v.index], 'good');
            app.mic.resetTracker();
            if (v.done) good();
          } else if (v.kind === 'wrong') wrong(`Rải từ dưới lên: ${chordOf(s).pitches.map((p) => viName(p)).join(' – ')}`);
          return;
        }
        const at = n.at ?? -1;
        if (at >= 0 && Math.abs(at - askedAt) < 0.05) return;
        askedAt = at;
        const midis = chordOf(s).pitches.map(pitchToMidi);
        void app.mic.verifyChord(midis, at >= 0 ? at : undefined).then((r) => {
          if (tk !== token) return;
          if (r && r.conclusive) {
            if (r.missing.length === 0) return good();
            const names = r.missing.map((m) => viName(chordOf(s).pitches[midis.indexOf(m)] ?? '')).filter(Boolean).join(', ');
            return wrong(`🎤 Con quên nốt ${names} — bấm cùng lúc cả ${midis.length} phím nhé`);
          }
          // Micro chưa kết luận (tiếng nhỏ / ồn): nốt nghe được thuộc hợp âm → coi là đúng (nhẹ tay như màn Từng nốt)
          if (midis.some((m) => (m - n.midi) % 12 === 0)) good();
        });
      });
    }

    /** Phím ảo: đủ các phím của hợp âm trong ~0,6 giây (hoặc rải đúng thứ tự). */
    function onKey(m: number): void {
      void app.audio.playPitch(midiToPitch(m), 0.8);
      const s = task.chords[bar];
      if (!s) return;
      if (judge) {
        const v = judge.feed(m);
        if (v.kind === 'ok' && v.done) good();
        return;
      }
      pressed.add(m);
      window.clearTimeout(pressTimer);
      pressTimer = window.setTimeout(() => pressed.clear(), 600);
      if (chordOf(s).pitches.every((p) => pressed.has(pitchToMidi(p)))) {
        pressed.clear();
        good();
      }
    }

    /** Đúng hợp âm → app hát giai điệu ô đó → ô sau. */
    function good(): void {
      const tk = halt();
      const notes = bars[bar] ?? [];
      const spb = 60 / SING_BPM;
      const t0 = app.audio.now() + 0.1;
      for (const n of notes) void app.audio.scheduleFreq(midiToFreq(pitchToMidi(n.pitch)), t0 + n.start * spb, Math.max(0.25, n.beats * spb * 0.92), 0.8);
      const end = notes.length ? Math.max(...notes.map((n) => n.start + n.beats)) : 1;
      kb.setResult(null, null);
      stage.querySelector('.mu-hint')?.replaceChildren('🎵 Thầy hát…');
      // đang hát: không cho chạm "Đúng rồi" lần nữa (mỗi ô chỉ một lần)
      setBar(backButton(intro));
      timer = window.setTimeout(() => {
        if (tk !== token) return;
        bar++;
        if (bar < task.chords.length) return ask();
        if (round === 1) return roundTwo();
        done();
      }, (0.1 + end * spb + 0.2) * 1000);
    }

    function roundTwo(): void {
      halt();
      kb.clear();
      stage.replaceChildren(
        h('div', { class: 'hero-mascot' }, mascot('clap', 90)),
        h('h1', { class: 'title' }, 'Hay quá! Lượt 2: KHÔNG có phím sáng'),
        h('p', { class: 'lead' }, 'Chỉ nhìn ký hiệu hợp âm — con nhớ ngón chưa?'),
      );
      setBar(button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => startRound(2) }));
    }

    function done(): void {
      halt();
      // Micro: đạt khi lượt 2 sai ≤ 1 ô; không micro: bố mẹ đã xác nhận từng ô
      hooks.record(`accomp:${task.songId}`, !micOn() || missedBars.size <= 1 ? 'correct' : 'retry');
      confetti(24);
      void app.audio.chime();
      kb.clear();
      stage.replaceChildren(
        h('div', { class: 'hero-mascot' }, mascot('cheer', 100)),
        h('h1', { class: 'title' }, 'Con đệm hợp âm như nhạc công thật! 🎹'),
        h('p', { class: 'lead' }, `Hợp âm: ${task.chords.join(' – ')}`),
      );
      setBar(
        button({ icon: '↻', label: 'Chơi lại', onTap: () => (missedBars.clear(), startRound(1)) }),
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }),
      );
    }

    intro();
    return () => {
      halt();
      window.clearTimeout(pressTimer);
      kb.destroy();
    };
  };
}

