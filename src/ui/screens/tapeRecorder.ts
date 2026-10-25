/**
 * (+ 2026-10-25, bé xin "Làm một cái máy ghi âm") 🎙️ MÁY GHI ÂM của bé.
 *
 * - Mở từ: nút đỏ "⏺ Ghi âm" trên thanh trên của 🎹 Đàn tự do (kèm phím đàn trên màn) và thẻ "🎙️ Máy ghi âm" trong 🎮 Trò chơi.
 * - Nút to: ⏺ Ghi · ⏹ Dừng · ▶ Nghe. Thanh âm lượng sống + đồng hồ (tối đa 3 phút — tự dừng). Ghi bằng MICRO (đàn thật);
 *   phím trên màn vẫn kêu và lọt vào micro (không trộn tiếng trong app — giữ đơn giản).
 * - Ghi xong: đặt tên (không bắt buộc — mặc định "Bản ghi N"), chọn emoji → 💾 Lưu vào "📼 Bản ghi của con" / 🗑 Bỏ.
 * - Danh sách: ▶/⏸ nghe, 📤 chia sẻ (bảng Chia sẻ iOS; không có thì tải tệp), 🗑 xoá (hỏi lại). Tuỳ chọn 🐢 Phát chậm (0,75×)
 *   và 🔁 Phát liên tục — dùng cho cả bản vừa ghi lẫn bản đã lưu.
 * - Micro: dùng CHUNG MicListener của app (app.ensureMic) → luồng micro đang giữ (keep-alive) được dùng lại, iPad không hỏi
 *   quyền lần nữa; MediaRecorder ghi từ chính luồng đó (audio/recorder.ts takeRecorder). (2026-10-25, OWNER "bỏ phần phụ
 *   huynh") micro tắt / iPad chưa cho phép → nút "🎤 Bật micro" để BÉ TỰ BẬT (components/micAllow.ts: bật cài đặt + iPad hỏi
 *   quyền, bé chạm "Cho phép"); công tắc tắt micro chỉ ở ⚙️ Cài đặt.
 * - Lưu trữ: src/progress/recordingsStore.ts (IndexedDB riêng; 30 bản / 80 MB; đầy → hỏi xoá các bản cũ nhất).
 *   👤 Khách chơi: bản ghi vào danh sách TẠM (bộ nhớ) — xoá khi thoát chế độ khách; danh sách của bé không hiện / không đụng.
 * - Offline hoàn toàn. Giảm chuyển động: cuộn băng không quay, ⏺ không nhấp nháy (CSS prefers-reduced-motion).
 */
import { clipFromBlob, takeRecorder, type TakeClip, type TakeRecorder } from '../../audio/recorder';
import { meterPct, type MicListener } from '../../audio/MicListener';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { REC_EMOJIS, REC_MAX_SECONDS, recFileName, recordingsFor, type RecMeta, type RecordingsStore } from '../../progress/recordingsStore';
import { fmtBytes } from '../../progress/albumStore';
import { blockedText, fmtClock, initialRec, recNext, type BlockReason, type RecEvent, type RecMachine } from '../recorderMachine';
import type { App, Screen } from '../App';
import { actionBar, backButton, button, confirmDialog, h, toast } from '../components/dom';
import { shareFile } from '../components/shareFile';
import { confetti } from '../components/celebrate';
import { micAllowButton } from '../components/micAllow';
import '../../styles/tapeRecorder.css';

/** ⏺ / ⏹ dạng chữ (U+FE0E) — iPad không vẽ thành ô emoji xám trên nút đỏ */
const REC_ICON = '⏺︎';
const STOP_ICON = '⏹︎';

const fmtDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/** Đặt chữ + biểu tượng cho nút dom.button(). */
function setBtn(b: HTMLButtonElement, icon: string, label: string): void {
  const i = b.querySelector('.btn-icon');
  const l = b.querySelector('.btn-label');
  if (i) i.textContent = icon;
  if (l) l.textContent = label;
}

export interface TapeRecorderOpts {
  /** Hiện phím đàn trên màn ngay từ đầu (mở từ Đàn tự do) */
  keys?: boolean;
}

export function tapeRecorderScreen(app: App, onBack: () => void, opts: TapeRecorderOpts = {}): Screen {
  return (root) => {
    const guest = app.store.guest;
    const store: RecordingsStore = recordingsFor(guest);
    let m: RecMachine = initialRec();
    let disposed = false;
    let rec: TakeRecorder | null = null;
    let recStart = 0;
    let tick = 0;
    /** Bản vừa ghi, chưa lưu */
    let pending: TakeClip | null = null;
    /** Đang phát: 'pending' hoặc id bản đã lưu */
    let playing: { id: string; clip: TakeClip; own: boolean } | null = null;
    let playSeq = 0;
    let slow = false;
    let loop = false;
    let emoji: string = REC_EMOJIS[0];
    const files = new Map<string, File>();
    let unFrame: (() => void) | null = null;

    const micOrNull = (): MicListener | null => {
      try {
        return app.mic;
      } catch {
        return null;
      }
    };

    // ---------- Máy (cassette) ----------
    const time = h('div', { class: 'tape-time', 'aria-live': 'off' }, '0:00');
    const maxLabel = h('div', { class: 'tape-max' }, `/ ${fmtClock(REC_MAX_SECONDS)}`);
    const status = h('div', { class: 'tape-status', role: 'status', 'aria-live': 'polite' }, 'Chạm ⏺ để ghi tiếng đàn của con!');
    // (2026-10-25) micro tắt / chưa được phép → bé tự bật micro (iPad hỏi quyền)
    const allow = micAllowButton(app, (on) => {
      if (disposed) return;
      if (on) {
        m = initialRec();
        watchMeter(micOrNull());
        render();
        status.textContent = '🎙️ Micro sẵn sàng — chạm ⏺ để ghi nhé!';
      } else {
        m = { state: 'blocked', blocked: micOrNull()?.state === 'unsupported' ? 'unsupported' : 'denied' };
        render();
      }
    });
    allow.classList.add('tape-allow');
    allow.hidden = true;
    const fill = h('div', { class: 'tape-meter-fill' });
    const meter = h('div', { class: 'tape-meter', role: 'meter', 'aria-label': 'Âm lượng micro', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
    const reel = () => h('div', { class: 'tape-reel', 'aria-hidden': 'true' }, h('span'));
    const deck = h(
      'div',
      { class: 'tape-deck' },
      h('div', { class: 'tape-window', 'aria-hidden': 'true' }, reel(), h('div', { class: 'tape-band' }), reel()),
      h('div', { class: 'tape-clock' }, h('span', { class: 'tape-dot', 'aria-hidden': 'true' }), time, maxLabel),
      meter,
      status,
      allow,
    );

    const recBtn = button({ icon: REC_ICON, label: 'Ghi', onTap: () => void startRec() });
    recBtn.classList.add('tape-btn', 'tape-rec');
    recBtn.setAttribute('data-test', 'tape-rec');
    const stopBtn = button({ icon: STOP_ICON, label: 'Dừng', onTap: () => void stopRec('stop') });
    stopBtn.classList.add('tape-btn', 'tape-stop');
    const playBtn = button({ icon: '▶', label: 'Nghe', onTap: () => togglePending() });
    playBtn.classList.add('tape-btn', 'tape-play');

    // Tuỳ chọn phát (cho cả bản vừa ghi lẫn bản đã lưu)
    const optChip = (icon: string, label: string, get: () => boolean, set: (v: boolean) => void) => {
      const b = h(
        'button',
        { class: 'tape-opt', type: 'button', 'aria-pressed': 'false' },
        h('span', { 'aria-hidden': 'true' }, icon),
        ` ${label}`,
      );
      b.addEventListener('click', () => {
        set(!get());
        b.classList.toggle('on', get());
        b.setAttribute('aria-pressed', String(get()));
        // Đang phát → phát lại với tuỳ chọn mới
        if (playing) {
          const id = playing.id;
          if (id === 'pending') togglePending(true);
          else void playSaved(id, true);
        }
      });
      return b;
    };
    const opts2 = h(
      'div',
      { class: 'tape-opts', role: 'group', 'aria-label': 'Cách phát' },
      optChip('🐢', 'Phát chậm', () => slow, (v) => (slow = v)),
      optChip('🔁', 'Phát liên tục', () => loop, (v) => (loop = v)),
    );

    // ---------- Đặt tên sau khi ghi ----------
    const nameInput = h('input', {
      class: 'tape-name',
      type: 'text',
      maxlength: '40',
      enterkeyhint: 'done',
      autocomplete: 'off',
      'aria-label': 'Tên bản ghi',
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameInput.blur();
    });
    const emojiRow = h(
      'div',
      { class: 'tape-emojis', role: 'radiogroup', 'aria-label': 'Chọn hình' },
      ...REC_EMOJIS.map((e, i) =>
        h(
          'button',
          {
            class: `tape-emoji${i === 0 ? ' on' : ''}`,
            type: 'button',
            role: 'radio',
            'aria-checked': String(i === 0),
            'aria-label': `Hình ${e}`,
            onClick: (ev: Event) => {
              emoji = e;
              emojiRow.querySelectorAll('.tape-emoji').forEach((x) => {
                const on = x === ev.currentTarget;
                x.classList.toggle('on', on);
                x.setAttribute('aria-checked', String(on));
              });
            },
          },
          e,
        ),
      ),
    );
    const saveBtn = button({ icon: '💾', label: 'Lưu', onTap: () => void savePending() });
    saveBtn.classList.add('tape-btn', 'tape-save');
    saveBtn.setAttribute('data-test', 'tape-save');
    const dropBtn = button({ icon: '🗑', label: 'Bỏ', onTap: () => confirmDrop() });
    dropBtn.classList.add('tape-btn', 'tape-drop');
    // Ghi xong (review): hàng nút to đổi thành 🗑 Bỏ · ▶ Nghe · 💾 Lưu (luôn thấy, không phải cuộn)
    const controls = h('div', { class: 'tape-controls' }, recBtn, stopBtn, dropBtn, playBtn, saveBtn);
    const review = h(
      'section',
      { class: 'tape-review', hidden: true, 'aria-label': 'Lưu bản ghi' },
      h('div', { class: 'tape-review-k' }, '✨ Đặt tên cho bản ghi (không bắt buộc)'),
      nameInput,
      emojiRow,
    );

    // ---------- Danh sách "📼 Bản ghi của con" ----------
    const listHead = h('h2', { class: 'tape-list-h' }, guest ? '📼 Bản ghi của khách' : '📼 Bản ghi của con');
    const usage = h('div', { class: 'tape-usage' });
    const note =
      guest || store.temporary
        ? h('p', { class: 'tape-note' }, guest ? '👤 Bản ghi của khách chỉ giữ tới khi thoát chế độ khách.' : 'iPad này không lưu được lâu — bản ghi mất khi tắt app.')
        : null;
    const list = h('ul', { class: 'tape-list' });
    const side = h('section', { class: 'tape-side', 'aria-label': 'Bản ghi đã lưu' }, h('div', { class: 'tape-list-top' }, listHead, usage), opts2, note, list);

    // ---------- Phím đàn (tuỳ chọn) ----------
    let kb: PianoKeyboard | null = null;
    const kbWrap = h('div', { class: 'keyboard-wrap tape-kb', hidden: true });
    const keysBtn = button({ icon: '🎹', label: 'Phím đàn', kind: 'mint', onTap: () => setKeys(kbWrap.hidden) });
    keysBtn.classList.add('tape-keys-btn');
    function setKeys(on: boolean): void {
      if (on && !kb) {
        kb = new PianoKeyboard({ low: 'C4', high: 'C6', labels: 'all', fingerOnPress: false, onPress: (p) => void app.audio.playPitch(p, 1.0) });
        kbWrap.append(kb.el);
      }
      kbWrap.hidden = !on;
      keysBtn.setAttribute('aria-pressed', String(on));
      keysBtn.classList.toggle('on', on);
      screen.classList.toggle('with-keys', on);
    }

    const screen = h(
      'div',
      { class: 'screen tape-screen' },
      h('header', { class: 'tape-top' }, h('h1', { class: 'tape-title' }, '🎙️ Máy ghi âm')),
      h('div', { class: 'tape-body' }, h('div', { class: 'tape-main' }, deck, controls, review), side),
      kbWrap,
      actionBar(backButton(() => onBack()), keysBtn),
    );
    root.append(screen);
    if (opts.keys) setKeys(true);

    // ---------- Vẽ theo trạng thái ----------
    function render(): void {
      const s = m.state;
      screen.dataset.state = s;
      recBtn.disabled = !(s === 'idle' || s === 'blocked');
      stopBtn.disabled = s !== 'recording';
      playBtn.disabled = s !== 'review';
      recBtn.hidden = s === 'recording' || s === 'review';
      stopBtn.hidden = s !== 'recording';
      playBtn.hidden = s === 'recording';
      dropBtn.hidden = saveBtn.hidden = s !== 'review';
      setBtn(recBtn, REC_ICON, s === 'starting' ? 'Đợi chút…' : 'Ghi');
      review.hidden = s !== 'review';
      if (s === 'idle') {
        status.textContent = 'Chạm ⏺ để ghi tiếng đàn của con!';
        time.textContent = '0:00';
      } else if (s === 'starting') status.textContent = '🎙️ Đang bật micro…';
      else if (s === 'recording') status.textContent = '🔴 Đang ghi… con đàn đi!';
      else if (s === 'review') status.textContent = '🎧 Nghe lại rồi lưu nhé!';
      else if (s === 'blocked' && m.blocked) status.textContent = blockedText(m.blocked);
      allow.hidden = !(s === 'blocked' && (m.blocked === 'mic-off' || m.blocked === 'denied'));
    }
    const go = (e: RecEvent) => {
      m = recNext(m, e);
      render();
    };

    // ---------- Thanh âm lượng ----------
    function watchMeter(mic: MicListener | null): void {
      if (unFrame || !mic) return;
      unFrame = mic.onFrame((f) => {
        const pct = meterPct(f);
        fill.style.width = `${pct}%`;
        meter.setAttribute('aria-valuenow', String(pct));
      });
    }

    // ---------- Ghi ----------
    async function startRec(): Promise<void> {
      if (!(m.state === 'idle' || m.state === 'blocked')) return;
      go({ type: 'rec' });
      stopPlaying();
      const fail = (reason: BlockReason) => !disposed && go({ type: 'fail', reason });
      if (!app.micWanted) return void fail('mic-off');
      const ok = await app.ensureMic().catch(() => false);
      if (disposed) return;
      const mic = micOrNull();
      if (!ok || !mic) {
        const st = mic?.state;
        return void fail(st === 'denied' ? 'denied' : st === 'unsupported' ? 'unsupported' : 'error');
      }
      watchMeter(mic);
      rec = takeRecorder(mic, {}, { maxSeconds: REC_MAX_SECONDS });
      if (!rec) return void fail('unsupported');
      rec.start();
      recStart = performance.now();
      go({ type: 'started' });
      tick = window.setInterval(() => {
        const sec = (performance.now() - recStart) / 1000;
        time.textContent = fmtClock(Math.min(sec, REC_MAX_SECONDS));
        if (sec >= REC_MAX_SECONDS) void stopRec('cap');
      }, 250);
    }

    async function stopRec(kind: 'stop' | 'cap'): Promise<void> {
      if (m.state !== 'recording' || !rec) return;
      window.clearInterval(tick);
      const r = rec;
      rec = null;
      stopBtn.disabled = true;
      const clip = await r.stop();
      if (disposed) return void clip?.dispose();
      if (!clip) {
        toast('Bản ghi ngắn quá — ghi lại nhé!');
        go({ type: 'empty' });
        return;
      }
      pending = clip;
      time.textContent = fmtClock(clip.seconds);
      go({ type: kind });
      if (kind === 'cap') toast('⏱ Hết 3 phút — máy tự dừng rồi!', 3000);
      nameInput.value = '';
      nameInput.placeholder = await store.defaultName();
    }

    function stopPlaying(): void {
      playSeq++;
      const p = playing;
      playing = null;
      if (p) {
        p.clip.stopPlayback();
        if (!p.own) p.clip.dispose();
      }
      setBtn(playBtn, '▶', 'Nghe');
      list.querySelectorAll<HTMLButtonElement>('.tape-row-play').forEach((b) => setBtn(b, '▶', 'Nghe'));
      list.querySelectorAll('.tape-row.playing').forEach((r) => r.classList.remove('playing'));
    }
    const playOpts = () => ({ rate: slow ? 0.75 : 1, loop });

    /** ▶ Nghe bản vừa ghi (chạm lại = dừng). restart: phát lại từ đầu với tuỳ chọn mới. */
    function togglePending(restart = false): void {
      if (!pending) return;
      const wasMine = playing?.id === 'pending';
      stopPlaying();
      if (wasMine && !restart) return;
      const clip = pending;
      playing = { id: 'pending', clip, own: true };
      const seq = playSeq;
      setBtn(playBtn, '⏸', 'Dừng nghe');
      void clip.play(playOpts()).then(() => {
        if (seq === playSeq && playing?.id === 'pending') {
          playing = null;
          setBtn(playBtn, '▶', 'Nghe');
        }
      });
    }

    async function playSaved(id: string, restart = false): Promise<void> {
      const wasMine = playing?.id === id;
      stopPlaying();
      if (wasMine && !restart) return;
      const seq = playSeq;
      const t = await store.get(id);
      if (disposed || seq !== playSeq) return;
      if (!t) return void toast('Không mở được bản ghi này 😢');
      const clip = clipFromBlob(new Blob([t.data], { type: t.mime }), t.seconds, app.audio);
      playing = { id, clip, own: false };
      const row = list.querySelector(`[data-rec="${CSS.escape(id)}"]`);
      row?.classList.add('playing');
      const b = row?.querySelector<HTMLButtonElement>('.tape-row-play');
      if (b) setBtn(b, '⏸', 'Dừng');
      void clip.play(playOpts()).then(() => {
        if (seq === playSeq && playing?.id === id) stopPlaying();
      });
    }

    // ---------- Lưu / Bỏ ----------
    function finishPending(): void {
      if (playing?.id === 'pending') stopPlaying();
      pending?.dispose();
      pending = null;
    }

    function confirmDrop(): void {
      confirmDialog({
        title: 'Bỏ bản ghi này?',
        text: 'Bản vừa ghi sẽ mất (không lưu).',
        okLabel: 'Bỏ',
        okIcon: '🗑',
        danger: true,
        onOk: () => {
          finishPending();
          go({ type: 'discard' });
        },
      });
    }

    async function savePending(freeIds: readonly string[] = []): Promise<void> {
      if (m.state !== 'review' || !pending) return;
      const blob = pending.blob?.() ?? null;
      if (!blob) return;
      saveBtn.disabled = true;
      const input = { blob, seconds: pending.seconds, name: nameInput.value, emoji };
      const v = freeIds.length ? await store.saveFreeing(input, freeIds) : await store.save(input);
      saveBtn.disabled = false;
      if (disposed) return;
      if (v.saved) {
        finishPending();
        go({ type: 'save' });
        void app.audio.chime();
        confetti(18);
        toast(`💾 Đã lưu “${v.meta.name}”!`);
        void refresh();
        return;
      }
      if (v.reason === 'full') {
        if (!v.oldest.length) return void toast('Bản ghi dài quá, không lưu được 😢', 3000);
        const names = v.oldest.slice(0, 3).map((o) => `${o.emoji} ${o.name}`).join(', ') + (v.oldest.length > 3 ? '…' : '');
        confirmDialog({
          title: '📼 Hết chỗ rồi!',
          text: `Muốn lưu bản này phải xoá ${v.oldest.length} bản cũ nhất: ${names}. Xoá nhé?`,
          okLabel: 'Xoá bản cũ & lưu',
          okIcon: '🗑',
          danger: true,
          onOk: () => void savePending(v.oldest.map((o) => o.id)),
        });
        return;
      }
      toast(v.reason === 'too-short' ? 'Bản ghi ngắn quá — ghi lại nhé!' : 'Chưa lưu được 😢 — thử lại nhé', 3000);
    }

    // ---------- Danh sách ----------
    const rowOf = (r: RecMeta): HTMLElement => {
      const playB = button({ icon: '▶', label: 'Nghe', kind: 'sun', onTap: () => void playSaved(r.id) });
      playB.classList.add('tape-row-play');
      playB.setAttribute('aria-label', `Nghe ${r.name}`);
      const shareB = button({
        icon: '📤',
        label: 'Gửi',
        onTap: async () => {
          let f = files.get(r.id);
          if (!f) {
            const t = await store.get(r.id);
            if (!t) return void toast('Không mở được bản ghi này 😢');
            f = new File([t.data], recFileName(t), { type: t.mime });
            files.set(r.id, f);
          }
          const res = await shareFile(f, `${r.emoji} ${r.name}`);
          if (res === 'retry') toast('Chạm 📤 lần nữa nhé');
          else if (res === 'download') toast('Đã tải tệp xuống');
        },
      });
      shareB.setAttribute('aria-label', `Gửi ${r.name}`);
      const delB = button({
        icon: '🗑',
        label: 'Xoá',
        onTap: () =>
          confirmDialog({
            title: `Xoá “${r.name}”?`,
            text: 'Xoá rồi là mất hẳn, không lấy lại được.',
            okLabel: 'Xoá',
            okIcon: '🗑',
            danger: true,
            onOk: async () => {
              if (playing?.id === r.id) stopPlaying();
              files.delete(r.id);
              if (await store.remove(r.id)) toast('Đã xoá');
              void refresh();
            },
          }),
      });
      delB.classList.add('tape-row-del');
      delB.setAttribute('aria-label', `Xoá ${r.name}`);
      return h(
        'li',
        { class: 'tape-row', 'data-rec': r.id },
        h('span', { class: 'tape-row-emoji', 'aria-hidden': 'true' }, r.emoji),
        h('span', { class: 'tape-row-text' }, h('span', { class: 'tape-row-name' }, r.name), h('span', { class: 'tape-row-meta' }, `${fmtClock(r.seconds)} · ${fmtDay(r.savedAt)}`)),
        h('span', { class: 'tape-row-actions' }, playB, shareB, delB),
      );
    };

    async function refresh(): Promise<void> {
      const metas = await store.list();
      if (disposed) return;
      if (playing && playing.id !== 'pending') stopPlaying();
      const bytes = metas.reduce((s, x) => s + (x.size || 0), 0);
      usage.textContent = metas.length ? `${metas.length}/${store.maxCount} · ${fmtBytes(bytes)}` : '';
      list.replaceChildren(
        ...(metas.length ? metas.map(rowOf) : [h('li', { class: 'tape-empty' }, 'Chưa có bản ghi nào — chạm ⏺ để ghi bản đầu tiên!')]),
      );
    }

    render();
    void refresh();
    // Micro đã được bật trong Cài đặt → bật luôn (luồng đang giữ được dùng lại, không hỏi quyền) để thanh âm lượng chạy
    if (app.micWanted) {
      void app
        .ensureMic()
        .then((ok) => ok && !disposed && watchMeter(micOrNull()))
        .catch(() => undefined);
    } else {
      m = { state: 'blocked', blocked: 'mic-off' };
      render();
    }

    return () => {
      disposed = true;
      window.clearInterval(tick);
      unFrame?.();
      rec?.cancel();
      rec = null;
      stopPlaying();
      pending?.dispose();
      pending = null;
      kb?.destroy();
      files.clear();
      // Rời màn: tắt micro (MicListener giữ luồng chờ màn kế — không hỏi quyền lại)
      try {
        app.micIfReady?.stop();
      } catch {
        /* bỏ qua */
      }
    };
  };
}
