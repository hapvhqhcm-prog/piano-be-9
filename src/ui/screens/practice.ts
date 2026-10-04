import type { Segment, Target } from '../../lessons/types';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import {
  PracticeStateMachine,
  type ParentResult,
  type PracticeEffect,
  type ResultSource,
} from '../../practice/PracticeStateMachine';
import { midiToPitch, noteLabel } from '../../piano/pitchTable';
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
    let firstHeard: string | null = null;
    let wrongCount = 0;
    let micForIndex = -1;
    const micOn = () => app.mic.state === 'on';
    const resetMicTurn = (index: number) => {
      if (micForIndex === index) return;
      micForIndex = index;
      heardKeys = new Set();
      firstHeard = null;
      wrongCount = 0;
    };
    const micHint = (text: string, kind: 'listen' | 'wrong' | 'good' = 'listen') => {
      const el = stage.querySelector<HTMLElement>('.mic-hint');
      if (!el) return;
      el.textContent = text;
      el.dataset.kind = kind;
    };
    const kb = new PianoKeyboard({ labels: 'c', onPress: (p) => void app.audio.playPitch(p) });
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

    const noteView = (t: Target) =>
      h(
        'div',
        { class: 'note-view' },
        progress(),
        h('div', { class: 'note-big' }, t.title),
        t.finger ? fingerRow(t.finger, t.hand ?? 'RH') : t.emoji ? h('div', { class: 'finger-big' }, t.emoji) : null,
        t.subtitle ? h('div', { class: 'note-sub' }, t.subtitle) : null,
        micOn() && t.keys.length > 0
          ? h(
              'div',
              { class: 'mic-row' },
              h('div', { class: 'mic-level' }, h('span', { class: 'mic-level-bar' })),
              h('div', { class: 'mic-hint', dataset: { kind: 'listen' } }, '🎤 Nghe mẫu xong rồi con đàn nhé'),
            )
          : null,
      );

    const showTargetOnKeyboard = (t: Target) => {
      kb.setResult(null, null);
      kb.setTargets(
        t.keys.map((pitch) => ({
          pitch,
          hand: t.hand ?? 'RH',
          finger: t.keys.length === 1 ? t.finger : undefined,
        })),
      );
      kb.setGuides(t.guides ?? []);
    };

    function render(): void {
      token++;
      const snap = sm.snapshot;
      stage.replaceChildren();
      bar.replaceChildren();
      const back = backButton(() => send('BACK'));

      switch (snap.state) {
        case 'INTRO':
          kb.clear();
          stage.append(
            h('div', { class: 'step-tag' }, seg.step),
            h('h1', { class: 'title' }, seg.title),
            h('p', { class: 'lead' }, seg.intro),
          );
          bar.append(back, button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => send('NEXT') }));
          break;

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
          stage.append(
            h('div', { class: 'hero-emoji' }, ok ? '🌟' : '💪'),
            h('h1', { class: 'title' }, ok ? 'Giỏi lắm!' : 'Thử lại nhé'),
            h(
              'p',
              { class: 'lead' },
              ok ? (byMic ? '🎤 App nghe con đàn đúng rồi!' : 'Con tìm đúng rồi') : 'Không sao, mình làm lại nào',
            ),
            countdown,
          );
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
            await app.audio.playSequence(t.sample, { onEach: (p, on) => kb.flash(p, on) });
          }
          if (tk === token && sm.snapshot.state === 'PLAY_SAMPLE') send('SAMPLE_END');
          break;
        }
        case 'stopAudio':
          app.audio.stopAll();
          break;
        case 'record':
          hooks.record(seg.targets[ef.index], ef.result);
          if (ef.result === 'correct') void app.audio.chime();
          break;
        case 'recordMic':
          hooks.recordMic(seg.targets[ef.index], { firstHeard: firstHeard ?? '', wrongCount });
          void app.audio.chime();
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
      if (t.keys.includes(heard)) {
        heardKeys.add(heard);
        kb.setResult(heard, 'good');
        if (t.keys.every((k) => heardKeys.has(k))) send('HEARD');
        else micHint(`🎤 Đúng rồi! Còn ${t.keys.length - heardKeys.size} phím nữa`, 'good');
      } else {
        wrongCount++;
        kb.setResult(heard, 'heard');
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
      kb.destroy();
    };
  };
}
