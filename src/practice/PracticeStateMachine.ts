/**
 * PRACTICE STATE MACHINE (§5) — thuần, không phụ thuộc DOM/audio.
 *
 * INTRO → READY → SHOW_NOTE → PLAY_SAMPLE → WAIT_PARENT → RESULT → NEXT_NOTE
 *                    ▲                                       │
 *                    └──────────── RETRY ────────────────────┘
 *                               CORRECT → NEXT_NOTE → (hết) → COMPLETE
 *
 * Màn hình chỉ gửi event và thực thi các "effect" trả về.
 */

export type PracticeState =
  | 'INTRO'
  | 'READY'
  | 'SHOW_NOTE'
  | 'PLAY_SAMPLE'
  | 'WAIT_PARENT'
  | 'RESULT'
  | 'NEXT_NOTE'
  | 'COMPLETE'
  | 'EXIT';

export type ParentResult = 'correct' | 'retry';

export type PracticeEvent =
  | { type: 'NEXT' } // INTRO→READY, READY→SHOW_NOTE, NEXT_NOTE→…
  | { type: 'SHOWN' } // SHOW_NOTE đã hiển thị xong → phát mẫu
  | { type: 'SAMPLE_END' }
  | { type: 'REPLAY' } // "Nghe lại"
  | { type: 'CORRECT' } // "Đúng rồi"
  | { type: 'HEARD' } // micro nghe bé đàn đúng nốt (MIC_ASSESSMENT)
  | { type: 'RETRY' } // "Thử lại"
  | { type: 'CONTINUE' } // nút "Tiếp" / "Thử lại" ở màn RESULT
  | { type: 'AUTO_ADVANCE' } // hết giờ đếm auto-advance
  | { type: 'EDIT' } // "Sửa" — phụ huynh bấm nhầm
  | { type: 'BACK' }; // "Quay lại"

export type PracticeEffect =
  | { type: 'playSample'; index: number }
  | { type: 'stopAudio' }
  | { type: 'record'; index: number; result: ParentResult }
  | { type: 'recordMic'; index: number }
  | { type: 'amendLast'; index: number; result: ParentResult; source: ResultSource }
  | { type: 'startAutoAdvance'; delaySec: number }
  | { type: 'cancelAutoAdvance' }
  | { type: 'complete' }
  | { type: 'exit' };

export interface PracticeSnapshot {
  state: PracticeState;
  index: number;
  total: number;
  lastResult: ParentResult | null;
  /** Ai chấm kết quả vừa rồi: bố/mẹ bấm nút, hay micro nghe được */
  lastSource: ResultSource | null;
}

export type ResultSource = 'parent' | 'mic';

export interface PracticeOptions {
  autoAdvance: boolean;
  autoAdvanceDelaySec: number;
  /** Micro nghe đúng → tự sang nốt sau (giống app nghe đàn), mặc định bật */
  micAutoNext?: boolean;
  micNextDelaySec?: number;
}

export class PracticeStateMachine {
  private s: PracticeSnapshot;
  private listeners = new Set<(s: PracticeSnapshot, effects: PracticeEffect[]) => void>();

  constructor(
    total: number,
    private readonly opts: PracticeOptions = { autoAdvance: false, autoAdvanceDelaySec: 4 },
  ) {
    this.s = { state: 'INTRO', index: 0, total, lastResult: null, lastSource: null };
  }

  get snapshot(): Readonly<PracticeSnapshot> {
    return this.s;
  }

  subscribe(fn: (s: PracticeSnapshot, effects: PracticeEffect[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Gửi event. Event không hợp lệ ở state hiện tại bị bỏ qua (trả về null). */
  send(ev: PracticeEvent): PracticeEffect[] | null {
    const r = this.transition(ev);
    if (!r) return null;
    this.s = r.next;
    this.listeners.forEach((fn) => fn(this.s, r.effects));
    return r.effects;
  }

  private delay(): number {
    return Math.min(10, Math.max(2, this.opts.autoAdvanceDelaySec));
  }

  private micDelay(): number {
    return Math.min(5, Math.max(0.5, this.opts.micNextDelaySec ?? 1.2));
  }

  /** Effect bắt đầu đếm tự chuyển, tùy nguồn kết quả; null nếu không tự chuyển. */
  private autoFor(source: ResultSource): PracticeEffect | null {
    if (source === 'mic') {
      return this.opts.micAutoNext === false ? null : { type: 'startAutoAdvance', delaySec: this.micDelay() };
    }
    return this.opts.autoAdvance ? { type: 'startAutoAdvance', delaySec: this.delay() } : null;
  }

  private goPrev(extra: PracticeEffect[]): { next: PracticeSnapshot; effects: PracticeEffect[] } {
    const { index } = this.s;
    if (index > 0) {
      return {
        next: { ...this.s, state: 'SHOW_NOTE', index: index - 1, lastResult: null, lastSource: null },
        effects: extra,
      };
    }
    return { next: { ...this.s, state: 'READY', index: 0, lastResult: null, lastSource: null }, effects: extra };
  }

  private transition(ev: PracticeEvent): { next: PracticeSnapshot; effects: PracticeEffect[] } | null {
    const s = this.s;
    switch (s.state) {
      case 'INTRO':
        if (ev.type === 'NEXT') return { next: { ...s, state: 'READY' }, effects: [] };
        if (ev.type === 'BACK') return { next: { ...s, state: 'EXIT' }, effects: [{ type: 'exit' }] };
        return null;

      case 'READY':
        if (ev.type === 'NEXT') {
          if (s.total === 0) return { next: { ...s, state: 'COMPLETE' }, effects: [{ type: 'complete' }] };
          return { next: { ...s, state: 'SHOW_NOTE', index: 0, lastResult: null, lastSource: null }, effects: [] };
        }
        if (ev.type === 'BACK') return { next: { ...s, state: 'INTRO' }, effects: [] };
        return null;

      case 'SHOW_NOTE':
        if (ev.type === 'SHOWN') {
          return { next: { ...s, state: 'PLAY_SAMPLE' }, effects: [{ type: 'playSample', index: s.index }] };
        }
        if (ev.type === 'BACK') return this.goPrev([]);
        return null;

      case 'PLAY_SAMPLE':
        // Chỉ sang WAIT_PARENT sau khi âm mẫu kết thúc.
        if (ev.type === 'SAMPLE_END') return { next: { ...s, state: 'WAIT_PARENT' }, effects: [] };
        if (ev.type === 'BACK') return this.goPrev([{ type: 'stopAudio' }]);
        return null;

      case 'WAIT_PARENT':
        // "Nghe lại": phát lại mẫu, KHÔNG đổi state.
        if (ev.type === 'REPLAY') return { next: s, effects: [{ type: 'playSample', index: s.index }] };
        if (ev.type === 'CORRECT') {
          const effects: PracticeEffect[] = [
            { type: 'stopAudio' },
            { type: 'record', index: s.index, result: 'correct' },
          ];
          const auto = this.autoFor('parent');
          if (auto) effects.push(auto);
          return { next: { ...s, state: 'RESULT', lastResult: 'correct', lastSource: 'parent' }, effects };
        }
        if (ev.type === 'HEARD') {
          // Micro nghe đúng: cùng nhánh với "Đúng rồi" nhưng ghi MIC_ASSESSMENT, không ghi PARENT.
          const effects: PracticeEffect[] = [{ type: 'stopAudio' }, { type: 'recordMic', index: s.index }];
          const auto = this.autoFor('mic');
          if (auto) effects.push(auto);
          return { next: { ...s, state: 'RESULT', lastResult: 'correct', lastSource: 'mic' }, effects };
        }
        if (ev.type === 'RETRY') {
          return {
            next: { ...s, state: 'RESULT', lastResult: 'retry', lastSource: 'parent' },
            effects: [{ type: 'stopAudio' }, { type: 'record', index: s.index, result: 'retry' }],
          };
        }
        if (ev.type === 'BACK') return this.goPrev([{ type: 'stopAudio' }]);
        return null;

      case 'RESULT':
        if (ev.type === 'CONTINUE') {
          if (s.lastResult === 'correct') {
            return { next: { ...s, state: 'NEXT_NOTE' }, effects: [{ type: 'cancelAutoAdvance' }] };
          }
          // RETRY → về SHOW_NOTE của chính nốt đó.
          return {
            next: { ...s, state: 'SHOW_NOTE', lastResult: null, lastSource: null },
            effects: [{ type: 'cancelAutoAdvance' }],
          };
        }
        if (ev.type === 'AUTO_ADVANCE') {
          if (s.lastResult !== 'correct' || !this.autoFor(s.lastSource ?? 'parent')) return null;
          return { next: { ...s, state: 'NEXT_NOTE' }, effects: [] };
        }
        if (ev.type === 'EDIT') {
          const source = s.lastSource ?? 'parent';
          const result: ParentResult = s.lastResult === 'correct' ? 'retry' : 'correct';
          const effects: PracticeEffect[] = [
            { type: 'cancelAutoAdvance' },
            { type: 'amendLast', index: s.index, result, source },
          ];
          // Sau khi bố/mẹ đã sửa thì KHÔNG tự chuyển nữa (để người lớn quyết)
          if (result === 'correct' && source === 'parent' && this.opts.autoAdvance) {
            effects.push({ type: 'startAutoAdvance', delaySec: this.delay() });
          }
          return { next: { ...s, lastResult: result }, effects };
        }
        if (ev.type === 'BACK') return this.goPrev([{ type: 'cancelAutoAdvance' }]);
        return null;

      case 'NEXT_NOTE':
        if (ev.type === 'NEXT') {
          if (s.index + 1 < s.total) {
            return { next: { ...s, state: 'SHOW_NOTE', index: s.index + 1, lastResult: null, lastSource: null }, effects: [] };
          }
          return { next: { ...s, state: 'COMPLETE' }, effects: [{ type: 'complete' }] };
        }
        return null;

      case 'COMPLETE':
      case 'EXIT':
        return null;
    }
  }
}
