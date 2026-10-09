/**
 * Màn bài hát — (+ 2026-10-09) "🎯 LUYỆN NGAY CHỖ NÀY" (mở từ màn kết quả): chậm trước, rồi đúng tốc độ
 * (teacher.focusPlan), xong quay về màn kết quả cũ. Trạng thái dùng chung: songState.ts.
 */
import { focusPlan } from '../../music/teacher';
import { cancelSpeech } from '../../audio/voice';
import { button, h } from '../components/dom';
import { TEMPOS } from './songShared';
import { halt, setBar, type ResultBack, type SongCtx } from './songState';
import { showResult } from './songResult';

/** "🎯 Luyện ngay chỗ này": chỗ `local` (ô nhịp của lượt) — chậm trước, rồi đúng tốc độ — xong quay về kết quả */
export function startFocus(c: SongCtx, back: ResultBack, local: [number, number], place: string): void {
  cancelSpeech();
  const off = back.phrase ? back.phrase[0] : 0;
  c.focus = { steps: focusPlan(back.mode, back.bpm, TEMPOS), i: 0, range: [local[0] + off, local[1] + off], place, back, note: '', clean: null };
  c.take.hold(true); // giữ "🎧 Nghe lại" của lượt chính
  applyFocusStep(c);
}

function applyFocusStep(c: SongCtx): void {
  const st = c.focus!.steps[c.focus!.i];
  c.mode = st.mode;
  c.bpm = st.bpm;
  c.phrase = c.focus!.range;
  c.act.reset();
}

/** Màn chờ của một bước luyện (reset() gọi khi đang luyện) */
export function focusIdle(c: SongCtx): void {
  const f = c.focus!;
  const st = f.steps[f.i];
  const slow = f.i === 0 && f.steps.length > 1;
  const what =
    st.kind === 'demo'
      ? '🐢 Nghe thầy đàn chậm — nhìn ngón tay nhé'
      : st.mode === 'tempo'
        ? slow
          ? `🐢 Đàn chậm (tốc độ ${st.bpm}) — đếm vào rồi đàn theo tiếng tích`
          : `🐇 Giờ đàn đúng tốc độ ${st.bpm} nhé!`
        : '🎹 Giờ con đàn từng nốt chỗ này nhé!';
  c.status.replaceChildren(
    h(
      'div',
      { class: 'song-lines focus-lines' },
      h('b', {}, `🎯 Luyện ${f.place.toLowerCase()} · bước ${f.i + 1}/${f.steps.length}`),
      h('span', {}, f.note ? `${f.note} ` : '', what),
      h('span', { class: 'focus-point' }, `🧑‍🏫 ${f.back.point.text}`),
    ),
  );
  setBar(
    c,
    button({ icon: '↩', label: 'Về kết quả', onTap: () => endFocus(c, false) }),
    st.kind === 'demo'
      ? button({ icon: '🎬', label: 'Xem thầy đàn chậm', kind: 'primary', onTap: () => void c.act.demo(() => focusStepDone(c)) })
      : button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => void c.act.start() }),
  );
}

/** Xong một bước luyện: sang bước sau, hoặc quay về màn kết quả */
export function focusStepDone(c: SongCtx, clean: boolean | null = null): void {
  const f = c.focus;
  if (!f) return;
  const prev = f.steps[f.i];
  f.i++;
  if (clean !== null) f.clean = clean;
  if (f.i >= f.steps.length) return endFocus(c, true);
  if (clean) void c.app.audio.chime();
  f.note = prev.kind === 'demo' ? '✓ Xem xong rồi!' : clean === false ? '👍 Tốt lắm, thêm lần nữa nào!' : '✓ Xong lượt chậm!';
  applyFocusStep(c);
}

/** Thôi luyện (xong hoặc bấm "Về kết quả") → màn kết quả cũ (vẫn Nghe lại được) */
function endFocus(c: SongCtx, done: boolean): void {
  const f = c.focus;
  if (!f) return;
  c.focus = null;
  halt(c);
  c.overlay.hide();
  c.app.audio.stopAll();
  c.kb.clear();
  c.kb.setTargets([]);
  c.mode = f.back.mode;
  c.phrase = f.back.phrase;
  c.bpm = f.back.bpm;
  c.head.render({ handSel: c.handSel, mode: c.mode, phrase: c.phrase, hints: c.hints, level: c.level, bpm: c.bpm });
  c.take.hold(false);
  if (done && f.clean) void c.app.audio.chime();
  showResult(c, f.back.s, f.back.text, { ...f.back, practiced: done, clean: f.clean });
}
