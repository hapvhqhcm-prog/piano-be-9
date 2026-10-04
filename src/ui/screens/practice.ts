import type { Segment, Target } from '../../lessons/types';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import {
  PracticeStateMachine,
  type ParentResult,
  type PracticeEffect,
  type ResultSource,
} from '../../practice/PracticeStateMachine';
import { keyboardRangeFor, midiToPitch, noteLabel, pitchToMidi, samePitch } from '../../piano/pitchTable';
import { fingerFor, fingerOnKeyboard } from '../../piano/fingering';
import { leftHandActive } from '../../lessons/lessonEngine';
import { StaffView } from '../components/staffView';
import { HandOverlay, eventsFromTargets, playDemo } from '../components/demo';

/** Lời khen / động viên đa dạng (không lặp một câu mãi). */
const PRAISE = ['Giỏi lắm!', 'Tuyệt vời!', 'Xuất sắc!', 'Đúng rồi!', 'Hay quá!', 'Con làm được rồi!'];
const PRAISE_SUB = ['Con tìm đúng rồi', 'Ngón tay con khéo quá', 'Tai con nghe giỏi ghê', 'Cứ thế tiếp nhé!'];
const RETRY_SUB = ['Không sao, mình làm lại nào', 'Sai một chút thôi — thử lần nữa!', 'Nhìn kỹ phím đang sáng nhé', 'Từ từ thôi, con làm được mà'];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Khuông nhỏ hiện một nốt (tuần 7). */
function miniStaff(pitch: string, clef: 'treble' | 'bass' = 'treble'): HTMLElement {
  const sv = new StaffView(
    { id: `mini-${pitch}`, title: '', titleVi: pitch, hand: 'RH', bpm: 60, timeSignature: '4/4', notes: [{ pitch, beats: 4 }] },
    { clef, names: false, fingers: false, measuresPerPage: 1, pxPerBeat: 30 },
  );
  sv.el.classList.add('staff-mini');
  return sv.el;
}
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { FINGER_NAMES, handDiagram } from '../components/handDiagram';
import type { Hand } from '../../piano/fingering';

/** Hình bàn tay sáng đúng ngón + số ngón to + tên ngón. */
function fingerRow(finger: number, hand: Hand): HTMLElement {
  const d = handDiagram(hand);
  d.set(finger);
  return h(
    'div',
    { class: `finger-row hand-${hand.toLowerCase()}` },
    d.el,
    h(
      'div',
      { class: 'finger-text' },
      h('div', { class: 'finger-big' }, `Ngón ${finger}`),
      h('div', { class: 'finger-name' }, FINGER_NAMES[finger]),
    ),
  );
}

export interface PracticeHooks {
  record(target: Target, result: ParentResult): void;
  /** MIC_ASSESSMENT — lưu riêng, không trộn với PARENT */
  recordMic(target: Target, info: { firstHeard: string; wrongCount: number }): void;
  amendLast(result: ParentResult, source: ResultSource): void;
  onComplete(): void;
  onExit(): void;
}

/**
 * Màn "Từng nốt" (§4) — điều khiển hoàn toàn bằng PracticeStateMachine (§5).
 * Thứ tự hiển thị: NỐT → NGÓN → ÂM MẪU → HÀNH ĐỘNG. Tối đa 4 nút.
 */
export function practiceScreen(app: App, seg: Segment, hooks: PracticeHooks) {
  return (root: HTMLElement) => {
    const settings = app.store.settings;
    const sm = new PracticeStateMachine(seg.targets.length, {
      autoAdvance: settings.autoAdvance,
      autoAdvanceDelaySec: settings.autoAdvanceDelaySec,
      micAutoNext: settings.micAutoNext,
    });

    // --- Micro: theo dõi lượt hiện tại ---
    let heardKeys = new Set<string>();
    let seqPos = 0;
    let firstHeard: string | null = null;
    let wrongCount = 0;
    let micForIndex = -1;
    const micOn = () => app.mic.state === 'on';
    const resetMicTurn = (index: number) => {
      if (micForIndex === index) return;
      micForIndex = index;
      heardKeys = new Set();
      seqPos = 0;
      firstHeard = null;
      wrongCount = 0;
    };
    const micHint = (text: string, kind: 'listen' | 'wrong' | 'good' = 'listen') => {
      const el = stage.querySelector<HTMLElement>('.mic-hint');
      if (!el) return;
      el.textContent = text;
      el.dataset.kind = kind;
    };
    const lhOn = leftHandActive(app.store.get());
    const [kbLow, kbHigh] = keyboardRangeFor(seg.targets.flatMap((t) => t.keys));
    const segFingers = new Map<number, { finger: number; hand: Hand }>();
    for (const t of seg.targets) {
      t.keys.forEach((k, i) => {
        const f = t.fingers?.[i] ?? (t.keys.length === 1 ? t.finger : undefined);
        if (f && !segFingers.has(pitchToMidi(k))) segFingers.set(pitchToMidi(k), { finger: f, hand: t.hand ?? 'RH' });
      });
    }
    const kb = new PianoKeyboard({
      low: kbLow,
      high: kbHigh,
      labels: 'c',
      // Số ngón theo chính bài này (thế Sol, thế Rê…), nếu không có thì theo thế Đô
      fingerOnPress: (p) => segFingers.get(pitchToMidi(p)) ?? fingerOnKeyboard(p, lhOn),
      onPress: (p) => void app.audio.playPitch(p),
    });
    const overlay = new HandOverlay(kb);
    /** Số lần "Thử lại" cho từng nốt — để biết khi nào cần thầy đàn mẫu lại */
    const retries = new Map<number, number>();
    /** Micro nghe sai 3 lần → bàn tay mờ hiện đúng chỗ (không phát tiếng, để micro vẫn nghe bé) */
    const showHelpHand = (t: Target) => {
      t.keys.forEach((k, i) => {
        const f = fingerOf(t, k, i);
        if (f) overlay.place(t.hand ?? 'RH', k, f, true);
      });
      overlay.setGhost(true);
      const first = t.keys[0];
      const f0 = fingerOf(t, first, 0);
      if (f0) overlay.press(t.hand ?? 'RH', f0, 1500);
      micHint('🎤 Nhìn bàn tay mờ: ngón này đặt ở phím đang sáng nhé', 'wrong');
    };
    let demo: { cancel: () => void; done: Promise<void> } | null = null;
    const fingerOf = (t: Target, pitch: string, i = t.keys.indexOf(pitch)) =>
      t.fingers?.[i] ?? fingerFor(pitch, t.hand ?? 'RH', true);
    const stage = h('div', { class: 'stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap' }, kb.el), bar));

    /** Tăng mỗi lần vẽ lại → mọi tác vụ async cũ tự hủy. */
    let token = 0;
    const target = () => seg.targets[sm.snapshot.index];
    const send = (type: Parameters<typeof sm.send>[0]['type']) => sm.send({ type } as never);
    const later = (fn: () => void, ms = 0) => {
      const tk = token;
      window.setTimeout(() => tk === token && fn(), ms);
    };

    const progress = () =>
      h('div', { class: 'progress' }, `${sm.snapshot.index + 1} / ${sm.snapshot.total}`);

    const micRow = (t: Target) =>
      micOn() && t.keys.length > 0
        ? h(
            'div',
            { class: 'mic-row' },
            h('div', { class: 'mic-level' }, h('span', { class: 'mic-level-bar' })),
            h('div', { class: 'mic-hint', dataset: { kind: 'listen' } }, '🎤 Nghe mẫu xong rồi con đàn nhé'),
          )
        : null;

    const fingerView = (t: Target) =>
      t.sequence
        ? h(
            'div',
            { class: `finger-big hand-${(t.hand ?? 'RH').toLowerCase()}` },
            'Ngón ' + t.keys.map((k) => fingerOf(t, k) ?? '?').join(' – '),
          )
        : t.finger
          ? t.staff
            ? h('div', { class: `finger-big hand-${(t.hand ?? 'RH').toLowerCase()}` }, `Ngón ${t.finger}`)
            : fingerRow(t.finger, t.hand ?? 'RH')
          : t.emoji
            ? h('div', { class: 'finger-big' }, t.emoji)
            : null;

    const noteView = (t: Target) =>
      t.staff
        ? // Tuần 7: khuông nhạc bên trái, tên + ngón bên phải
          h(
            'div',
            { class: 'note-view staff-row' },
            progress(),
            miniStaff(t.keys[0], t.clef ?? (t.hand === 'LH' ? 'bass' : 'treble')),
            h(
              'div',
              { class: 'staff-text' },
              h('div', { class: 'note-big' }, t.title),
              fingerView(t),
              t.subtitle ? h('div', { class: 'note-sub' }, t.subtitle) : null,
              micRow(t),
            ),
          )
        : h(
            'div',
            { class: 'note-view' },
            progress(),
            h('div', { class: 'note-big' }, t.title),
            fingerView(t),
            t.subtitle ? h('div', { class: 'note-sub' }, t.subtitle) : null,
            micRow(t),
          );

    const showTargetOnKeyboard = (t: Target) => {
      kb.setResult(null, null);
      kb.setTargets(
        t.keys.map((pitch) => ({
          pitch,
          hand: t.hand ?? 'RH',
          finger: t.keys.length === 1 ? t.finger : t.sequence || t.fingers ? fingerOf(t, pitch) : undefined,
        })),
      );
      kb.setGuides(t.guides ?? []);
    };

    function render(): void {
      token++;
      if (demo) {
        demo.cancel();
        demo = null;
      }
      overlay.hide();
      const snap = sm.snapshot;
      stage.replaceChildren();
      bar.replaceChildren();
      const back = backButton(() => send('BACK'));

      switch (snap.state) {
        case 'INTRO': {
          kb.clear();
          const events = eventsFromTargets(seg.targets);
          const caption = h('div', { class: 'demo-caption' }, events.length ? '🎬 Xem thầy đàn mẫu…' : '');
          stage.append(
            h('div', { class: 'step-tag' }, seg.step),
            h('h1', { class: 'title' }, seg.title),
            h('p', { class: 'lead' }, seg.intro),
            caption,
          );
          // "Video minh họa": bàn tay hoạt hình đàn mẫu cả phần bài này, tự phát khi mở
          const playIntro = () => {
            demo?.cancel();
            kb.clear();
            overlay.setGhost(false);
            const tk = token;
            demo = playDemo(app.audio, kb, overlay, events, { onCaption: (t) => (caption.textContent = `🎬 ${t}`) });
            void demo.done.then(() => {
              if (tk !== token) return;
              demo = null;
              caption.textContent = '✅ Xem xong — đến lượt con!';
            });
          };
          if (events.length) later(playIntro, 500);
          bar.append(back);
          if (events.length) bar.append(button({ icon: '🎬', label: 'Xem lại', onTap: playIntro }));
          bar.append(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => send('NEXT') }));
          break;
        }

        case 'READY':
          kb.clear();
          stage.append(
            h('div', { class: 'hero-emoji' }, '🙌'),
            h('h1', { class: 'title' }, 'Con sẵn sàng chưa?'),
            h('p', { class: 'lead' }, 'Ngồi thẳng, tay tròn, nhìn lên iPad'),
          );
          bar.append(
            back,
            button({
              icon: '▶',
              label: 'Bắt đầu',
              kind: 'primary',
              // Chạm "Bắt đầu" = thao tác người dùng → được phép bật micro
              onTap: async () => {
                await app.ensureMic();
                send('NEXT');
              },
            }),
          );
          break;

        case 'SHOW_NOTE':
        case 'PLAY_SAMPLE':
        case 'WAIT_PARENT': {
          const t = target();
          // Mỗi lần vào lại một nốt (kể cả sau "Thử lại"/"Sửa") đều bắt đầu lượt nghe mới
          if (snap.state === 'SHOW_NOTE') micForIndex = -1;
          resetMicTurn(snap.index);
          showTargetOnKeyboard(t);
          stage.append(noteView(t));
          const waiting = snap.state === 'WAIT_PARENT';
          if (waiting && micOn() && t.keys.length > 0) {
            app.mic.resetTracker();
            micHint(t.keys.length > 1 ? '🎤 Đang nghe… đàn từng phím đang sáng' : '🎤 Đang nghe… con đàn đi!');
          }
          const hasSample = (t.sample?.length ?? 0) > 0;
          bar.append(back);
          if (hasSample) {
            bar.append(button({ icon: '🔊', label: 'Nghe lại', disabled: !waiting, onTap: () => send('REPLAY') }));
          }
          bar.append(
            button({ icon: '✓', label: 'Đúng rồi', kind: 'good', disabled: !waiting, onTap: () => send('CORRECT') }),
            button({ icon: '↻', label: 'Thử lại', kind: 'retry', disabled: !waiting, onTap: () => send('RETRY') }),
          );
          if (snap.state === 'SHOW_NOTE') later(() => send('SHOWN'), 450);
          break;
        }

        case 'RESULT': {
          const ok = snap.lastResult === 'correct';
          const byMic = snap.lastSource === 'mic';
          const countdown = h('div', { class: 'countdown' });
          const tries = retries.get(snap.index) ?? 0;
          const needHelp = !ok && tries >= 2;
          stage.append(
            h('div', { class: 'hero-mascot' }, mascot(ok ? 'cheer' : 'think', 110)),
            h('h1', { class: 'title' }, ok ? pick(PRAISE) : needHelp ? 'Mình xem thầy làm nhé!' : 'Thử lại nhé'),
            h(
              'p',
              { class: 'lead' },
              ok
                ? byMic
                  ? '🎤 App nghe con đàn đúng rồi!'
                  : pick(PRAISE_SUB)
                : needHelp
                  ? 'Nhìn ngón tay của thầy, rồi con làm theo'
                  : pick(RETRY_SUB),
            ),
            countdown,
          );
          // Trợ giúp thích ứng: sai từ 2 lần trở lên → thầy đàn mẫu lại nốt này (không mờ)
          if (needHelp) {
            const t = target();
            const events = eventsFromTargets([t]);
            if (events.length) {
              later(() => {
                overlay.setGhost(false);
                demo = playDemo(app.audio, kb, overlay, events, { onCaption: (c) => (countdown.textContent = `🎬 ${c}`) });
              }, 600);
            }
          }
          bar.append(
            back,
            button({ icon: '✎', label: 'Sửa', onTap: () => send('EDIT') }),
            ok
              ? button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => send('CONTINUE') })
              : button({ icon: '↻', label: 'Thử lại', kind: 'primary', onTap: () => send('CONTINUE') }),
          );
          break;
        }

        case 'NEXT_NOTE':
          later(() => send('NEXT'));
          break;

        case 'COMPLETE':
        case 'EXIT':
          break;
      }
    }

    async function runEffect(ef: PracticeEffect): Promise<void> {
      switch (ef.type) {
        case 'playSample': {
          const t = seg.targets[ef.index];
          const tk = token;
          if (t.sample?.length) {
            // Âm mẫu kèm bàn tay hoạt hình (mờ) nhấn đúng ngón — như một video ngắn cho từng nốt
            overlay.setGhost(true);
            const d = playDemo(app.audio, kb, overlay, eventsFromTargets([{ ...t, keys: t.sample }]));
            demo = d;
            await d.done;
            if (demo === d) demo = null;
            if (tk === token) {
              overlay.hide();
              showTargetOnKeyboard(t);
            }
          }
          if (tk === token && sm.snapshot.state === 'PLAY_SAMPLE') send('SAMPLE_END');
          break;
        }
        case 'stopAudio':
          app.audio.stopAll();
          break;
        case 'record':
          hooks.record(seg.targets[ef.index], ef.result);
          if (ef.result === 'retry') retries.set(ef.index, (retries.get(ef.index) ?? 0) + 1);
          if (ef.result === 'correct') {
            void app.audio.chime();
            confetti(24);
          }
          break;
        case 'recordMic':
          hooks.recordMic(seg.targets[ef.index], { firstHeard: firstHeard ?? '', wrongCount });
          void app.audio.chime();
          confetti(24);
          break;
        case 'amendLast':
          hooks.amendLast(ef.result, ef.source);
          break;
        case 'startAutoAdvance': {
          // Chỉ đếm sau khi âm mẫu kết thúc (§5).
          const tk = token;
          await app.audio.whenIdle();
          let left = ef.delaySec;
          while (left > 0) {
            if (tk !== token) return;
            const el = stage.querySelector('.countdown');
            if (el) el.textContent = ef.delaySec < 2 ? 'Sang nốt tiếp…' : `Tự chuyển sau ${Math.ceil(left)} giây…`;
            const step = Math.min(1, left);
            await new Promise((r) => setTimeout(r, step * 1000));
            left -= step;
          }
          if (tk === token) send('AUTO_ADVANCE');
          break;
        }
        case 'cancelAutoAdvance':
          break; // token đã tăng khi vẽ lại → bộ đếm cũ tự dừng
        case 'complete':
          window.setTimeout(hooks.onComplete, 0);
          break;
        case 'exit':
          window.setTimeout(hooks.onExit, 0);
          break;
      }
    }

    // Micro nghe được một nốt trên đàn cơ
    const unNote = app.mic.onNote((n) => {
      if (sm.snapshot.state !== 'WAIT_PARENT') return;
      const t = target();
      if (t.keys.length === 0) return;
      const heard = midiToPitch(n.midi);
      firstHeard ??= heard;
      if (t.sequence) {
        // Nhại lại: phải đúng THỨ TỰ; sai giữa chừng thì làm lại từ đầu (nhẹ nhàng)
        const want = t.keys[seqPos];
        if (samePitch(heard, want)) {
          seqPos++;
          kb.setResult(heard, 'good');
          if (seqPos >= t.keys.length) send('HEARD');
          else micHint(`🎤 Đúng rồi! Tiếp theo…`, 'good');
        } else {
          wrongCount++;
          if (wrongCount === 3) showHelpHand(t);
          seqPos = samePitch(heard, t.keys[0]) ? 1 : 0;
          kb.setResult(heard, 'heard');
          micHint(`🎤 Gần đúng! Đàn lại từ ${noteLabel(t.keys[0]).split(' / ')[0]} nhé`, 'wrong');
        }
        return;
      }
      const match = t.keys.find((k) => samePitch(k, heard));
      if (match) {
        heardKeys.add(match);
        kb.setResult(heard, 'good');
        if (t.keys.every((k) => heardKeys.has(k))) send('HEARD');
        else micHint(`🎤 Đúng rồi! Còn ${t.keys.length - heardKeys.size} phím nữa`, 'good');
      } else {
        wrongCount++;
        kb.setResult(heard, 'heard');
        if (wrongCount === 3) showHelpHand(t);
        // Không có âm thanh/chữ tiêu cực — chỉ nhắc nhẹ phím vừa nghe (§10)
        const want = t.keys.length === 1 ? noteLabel(t.keys[0]).split(' / ')[0] : 'phím đang sáng';
        micHint(`🎤 Con vừa đàn ${noteLabel(heard).split(' / ')[0]} — tìm ${want} nhé`, 'wrong');
      }
    });
    // Thanh âm lượng: cho bé/bố mẹ thấy app "đang nghe"
    const unFrame = app.mic.onFrame((f) => {
      const bar = stage.querySelector<HTMLElement>('.mic-level-bar');
      if (bar) bar.style.width = `${Math.min(100, Math.round(f.level * 250))}%`;
    });

    const unsub = sm.subscribe((_s, effects) => {
      render();
      effects.forEach((ef) => void runEffect(ef));
    });
    render();

    return () => {
      token++;
      unsub();
      unNote();
      unFrame();
      demo?.cancel();
      overlay.destroy();
      kb.destroy();
    };
  };
}
