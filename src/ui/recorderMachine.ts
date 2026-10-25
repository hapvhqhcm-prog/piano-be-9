/**
 * (+ 2026-10-25) Trạng thái 🎙️ Máy ghi âm (thuần — có test; màn hình: src/ui/screens/tapeRecorder.ts).
 *
 *   idle ──rec──▶ starting ──started──▶ recording ──stop / cap──▶ review ──save / discard──▶ idle
 *     ▲              │ fail(no-mic / denied / unsupported)                │
 *     └──────────────┴──────────── blocked ◀──────────────────────────────┘ (thử lại: rec)
 *
 * - review: đang có một bản vừa ghi chưa lưu (nghe thử, đặt tên, chọn emoji, Lưu / Bỏ).
 * - cap: hết REC_MAX_SECONDS → tự dừng, vào review như bấm ⏹.
 * - empty: dừng nhưng không có gì (quá ngắn / lỗi) → về idle.
 * - leave: rời màn ở bất kỳ trạng thái nào → idle (bản chưa lưu bị bỏ).
 */
export type RecState = 'idle' | 'starting' | 'recording' | 'review' | 'blocked';
export type BlockReason = 'mic-off' | 'denied' | 'unsupported' | 'error';
export type RecEvent =
  | { type: 'rec' }
  | { type: 'started' }
  | { type: 'fail'; reason: BlockReason }
  | { type: 'stop' }
  | { type: 'cap' }
  | { type: 'empty' }
  | { type: 'save' }
  | { type: 'discard' }
  | { type: 'leave' };

export interface RecMachine {
  state: RecState;
  blocked: BlockReason | null;
}

export const initialRec = (): RecMachine => ({ state: 'idle', blocked: null });

/** Bước chuyển; sự kiện không hợp lệ ở trạng thái hiện tại → giữ nguyên (cùng đối tượng). */
export function recNext(m: RecMachine, e: RecEvent): RecMachine {
  if (e.type === 'leave') return initialRec();
  switch (m.state) {
    case 'idle':
    case 'blocked':
      return e.type === 'rec' ? { state: 'starting', blocked: null } : m;
    case 'starting':
      if (e.type === 'started') return { state: 'recording', blocked: null };
      if (e.type === 'fail') return { state: 'blocked', blocked: e.reason };
      return m;
    case 'recording':
      if (e.type === 'stop' || e.type === 'cap') return { state: 'review', blocked: null };
      if (e.type === 'empty' || e.type === 'discard') return initialRec();
      if (e.type === 'fail') return { state: 'blocked', blocked: e.reason };
      return m;
    case 'review':
      if (e.type === 'save' || e.type === 'discard' || e.type === 'empty') return initialRec();
      return m;
  }
}

/** "1:05" */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Lời nhắn khi không ghi được (tiếng Việt cho bé). */
export function blockedText(r: BlockReason): string {
  switch (r) {
    case 'mic-off':
      return '🎙️ Micro đang tắt. Chạm “🎤 Bật micro” — khi iPad hỏi, con chạm “Cho phép” nhé!';
    case 'denied':
      return '🎙️ iPad chưa cho app dùng micro. Chạm “🎤 Bật micro” rồi chạm “Cho phép” nhé!';
    case 'unsupported':
      return '😢 iPad này chưa ghi âm được.';
    default:
      return '😮 Micro chưa bật được — chạm ⏺ để thử lại nhé!';
  }
}
