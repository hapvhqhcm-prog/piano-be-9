import { midiToFreq, midiToPitch, pitchToMidi, viName } from '../../piano/pitchTable';
import { restsFor } from '../../music/solfege';
import { timeline } from '../../music/tune';
import {
  barBeats,
  layoutNotes,
  NOTE_VALUES,
  OnsetCollector,
  suggestHandPosition,
  toEditorText,
  transcribe,
  type OnsetEvent,
  type SeqItem,
  type TimeSig,
  type Transcription,
} from '../../music/transcribe';
import { buildParentSong, PARENT_TEMPOS, parentSongToTune } from '../../practice/parentSongs';
import { micModule, type App } from '../App';
import { button, h, toast } from '../components/dom';
import { StaffView, type ReviewMark } from '../components/staffView';
import '../../styles/teacher.css';
import '../../styles/songRecord.css';

/**
 * "🎙️ Đàn để thêm bài" (2026-10-10) — lớp phủ trên màn soạn bài của bố mẹ (songEditor.ts nạp muộn file này).
 * Bố mẹ / bé đàn GIAI ĐIỆU một tay trên đàn thật (có / không máy đếm nhịp) → micro nghe từng lần gõ →
 * src/music/transcribe.ts chép thành nốt + trường độ + vạch nhịp → xem lại (chạm nốt để sửa, dời vạch nhịp,
 * ×2 / ÷2 trường độ, ▶ Nghe thử) → "✅ Đưa vào bài" điền vào ô Gõ chữ của trình soạn (lưu như bài bố mẹ thêm).
 * Không ghi âm: chỉ giữ danh sách nốt nghe được, trên iPad này.
 */

export interface RecordResult {
  text: string;
  ts: TimeSig;
  bpm: number;
  notes: number;
}

export interface RecorderOptions {
  ts: TimeSig;
  bpm: number;
  /** "✅ Đưa vào bài" — lớp phủ VẪN MỞ; trình soạn gọi hàm đóng (giá trị trả về của openSongRecorder) khi đã nhận */
  onApply(r: RecordResult): void;
  onClose(): void;
}

type Phase = 'setup' | 'count' | 'rec' | 'review';

/** Ghi tối đa (giây) / im lặng bao lâu thì tự dừng (giây). */
export const REC_MAX_S = 60;
export const REC_SILENCE_S = 2;

const DUR_NAME: Record<string, string> = { '4': 'tròn', '3': 'trắng chấm', '2': 'trắng', '1.5': 'đen chấm', '1': 'đen', '0.5': 'móc đơn', '0.25': 'móc kép' };
const durName = (b: number) => DUR_NAME[String(b)] ?? `${String(b).replace('.', ',')} phách`;
const shortName = (midi: number) => {
  const p = midiToPitch(midi);
  return `${viName(p).replace(' thăng', '♯').replace(' giáng', '♭')}${p.slice(-1)}`;
};
const nearestTempo = (bpm: number) => PARENT_TEMPOS.reduce((a, b) => (Math.abs(b - bpm) < Math.abs(a - bpm) ? b : a), PARENT_TEMPOS[0]);

/** Hook DEV cho kịch bản chụp màn (scripts/shots) — giả tiếng micro. */
interface DevHook {
  micOk?: boolean;
  live(events: OnsetEvent[]): void;
  finish(events: OnsetEvent[], metronome?: { bpm: number; downbeat: number }): void;
}

export function openSongRecorder(app: App, host: HTMLElement, o: RecorderOptions): () => void {
  let phase: Phase = 'setup';
  let ts = o.ts;
  let bpm = (PARENT_TEMPOS as readonly number[]).includes(o.bpm) ? o.bpm : 72;
  let metro = true;
  let micError = '';

  // Đang ghi
  let collector = new OnsetCollector();
  let downbeat = 0;
  let startAt = 0;
  let timers: number[] = [];
  let unsubs: Array<() => void> = [];
  let countNow = 0;

  // Xem lại
  let raw: OnsetEvent[] = [];
  let usedMetro: { bpm: number; downbeat: number } | undefined;
  let tr: Transcription | null = null;
  let seq: SeqItem[] = [];
  let pickupRest = 0;
  let outBpm = bpm;
  let sel = -1;
  let playing: { stop(): void } | null = null;
  let staff: StaffView | null = null;

  const head = h('header', { class: 'sr-head' });
  const body = h('div', { class: 'sr-body' });
  const bar = h('div', { class: 'actions sr-actions' });
  const el = h('div', { class: 'sr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Đàn để thêm bài' }, head, body, bar);
  host.append(el);

  const dev: DevHook | null = import.meta.env.DEV
    ? {
        live: (events) => {
          collector = new OnsetCollector();
          for (const e of events) collector.note(e.midi, e.t);
          phase = 'rec';
          startAt = app.audio.now() - 12;
          render();
        },
        finish: (events, m) => finish(events, m),
      }
    : null;
  if (dev) (window as unknown as { __songRec?: DevHook }).__songRec = dev;

  // ---------------- Micro có dùng được không ----------------
  function micBlock(): string | null {
    if (dev?.micOk) return null;
    const supported = micModule.loaded?.MicListener.supported ?? (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && isSecureContext);
    if (!supported) return 'Trình duyệt này không cho dùng micro (cần mở app từ biểu tượng trên màn hình chính, địa chỉ https). Bố mẹ vẫn gõ chữ hoặc chạm phím để thêm bài được.';
    if (!app.store.settings.micEnabled) return 'Micro đang TẮT. Vào Phụ huynh › Nâng cao › 🎤 Cài micro (3 bước) để bật, rồi quay lại đây. Trong lúc chờ, bố mẹ gõ chữ hoặc chạm phím để thêm bài.';
    return micError || null;
  }

  // ---------------- Vẽ ----------------
  function render(): void {
    el.dataset.phase = phase;
    head.replaceChildren(
      h('h2', { class: 'sr-title' }, '🎙️ Đàn để thêm bài'),
      h('span', { class: 'sr-sub' }, phase === 'review' ? 'Xem lại & sửa' : phase === 'setup' ? 'Đàn trên đàn thật — app chép thành nốt' : 'Đang nghe…'),
      (() => {
        const x = h('button', { class: 'sr-close', type: 'button', 'aria-label': 'Đóng' }, '✕');
        x.addEventListener('click', close);
        return x;
      })(),
    );
    if (phase === 'setup') renderSetup();
    else if (phase === 'review') renderReview();
    else renderLive();
  }

  const seg = <T extends string | number>(label: string, values: readonly T[], cur: T, set: (v: T) => void, fmt: (v: T) => string = String) =>
    h(
      'div',
      { class: 'sr-opt' },
      h('span', { class: 'sr-lbl' }, label),
      h(
        'div',
        { class: 'seg-group' },
        ...values.map((v) => {
          const b = h('button', { class: `seg-btn${v === cur ? ' on' : ''}`, type: 'button', 'aria-pressed': String(v === cur) }, fmt(v));
          b.addEventListener('click', () => set(v));
          return b;
        }),
      ),
    );

  function renderSetup(): void {
    const block = micBlock();
    body.replaceChildren(
      h(
        'ol',
        { class: 'sr-steps' },
        h('li', {}, h('b', {}, 'Đàn GIAI ĐIỆU bằng MỘT tay'), ' — mỗi lúc một nốt, đàn rõ, chậm vừa phải.'),
        h('li', {}, metro ? 'Nghe máy đếm nhịp ĐẾM VÀO một ô (tích… tích…), rồi đàn ĐÚNG theo tiếng tích.' : 'Không có máy đếm nhịp: cứ đàn đều tay, app tự đoán tốc độ.'),
        h('li', {}, 'Đàn xong bấm ', h('b', {}, '■ Xong'), ` — hoặc dừng tay ${REC_SILENCE_S} giây app tự dừng (tối đa ${REC_MAX_S} giây).`),
        h('li', {}, 'Xem lại: ', h('b', {}, 'chạm nốt'), ' để sửa, ▶ Nghe thử, rồi ', h('b', {}, '✅ Đưa vào bài'), '.'),
      ),
      h(
        'div',
        { class: 'sr-opts' },
        seg<TimeSig>('Nhịp', ['4/4', '3/4', '2/4'], ts, (v) => ((ts = v), render())),
        seg<number>('♩ =', PARENT_TEMPOS, bpm, (v) => ((bpm = v), render())),
        seg<string>('🥁 Máy đếm nhịp', ['on', 'off'], metro ? 'on' : 'off', (v) => ((metro = v === 'on'), render()), (v) => (v === 'on' ? 'Có' : 'Không')),
      ),
      block ? h('p', { class: 'sr-warn', role: 'alert' }, `🎤 ${block}`) : h('p', { class: 'sr-tip' }, '💡 Đặt iPad trên giá nhạc, phòng yên tĩnh. Nốt app tự phát (Nghe thử) không bị tính.'),
    );
    bar.replaceChildren(
      button({ icon: '←', label: 'Về trình soạn', onTap: close }),
      button({ icon: '🎙️', label: 'Bắt đầu đàn', kind: 'primary', big: true, disabled: !!block && !dev?.micOk, onTap: () => void start() }),
    );
  }

  function renderLive(): void {
    const n = collector.events.length;
    const last = collector.events.slice(-12);
    const counting = phase === 'count';
    const elapsed = Math.max(0, app.audio.now() - startAt);
    body.replaceChildren(
      h(
        'div',
        { class: `sr-live${counting ? ' counting' : ''}` },
        counting
          ? h('div', { class: 'sr-count', 'aria-live': 'assertive' }, String(countNow || '…'))
          : h('div', { class: 'sr-mic', 'aria-hidden': 'true' }, '🎙️'),
        h('p', { class: 'sr-live-msg' }, counting ? 'Đếm vào… chuẩn bị đàn!' : n ? `Đang nghe — đã chép ${n} nốt` : 'Đàn đi — app đang nghe!'),
        h('div', { class: 'sr-live-notes' }, ...last.map((e) => h('span', { class: 'sr-chip live' }, shortName(e.midi)))),
        h('p', { class: 'sr-live-time' }, `⏱ ${Math.floor(elapsed)} / ${REC_MAX_S} giây${metro ? ` · ♩ = ${bpm} · ${ts}` : ''}`),
      ),
    );
    bar.replaceChildren(
      button({ icon: '✕', label: 'Hủy', onTap: () => (stopCapture(), (phase = 'setup'), render()) }),
      button({ icon: '■', label: 'Xong', kind: 'primary', big: true, disabled: counting, onTap: () => stopAndReview() }),
    );
  }

  // ---------------- Ghi ----------------
  async function start(): Promise<void> {
    micError = '';
    if (!dev?.micOk) {
      if (!micModule.loaded) await micModule.load();
      const on = await app.ensureMic();
      if (!on) {
        const st = app.micWanted ? app.mic.state : 'off';
        micError =
          st === 'denied'
            ? 'iPad chưa cho app dùng micro: vào Cài đặt › Safari (hoặc app) › Micro → Cho phép, rồi thử lại.'
            : 'Chưa mở được micro — thử lại, hoặc vào Phụ huynh › 🩺 Kiểm tra iPad.';
        render();
        return;
      }
    }
    stopCapture();
    collector = new OnsetCollector();
    const bpb = barBeats(ts);
    const spb = 60 / bpm;
    const now = app.audio.now();
    startAt = now;
    if (!dev?.micOk) {
      const mic = app.mic;
      // Nốt chờ không có → micro không tự học lệch dây ở đây, nhưng VẪN ÁP DỤNG độ lệch đã học (autoTune) khi nghe nốt
      mic.expected = null;
      mic.resetTracker();
      const lat = mic.inputOutputLatency();
      unsubs.push(
        mic.onFrame((f) => {
          if (f.app !== 'quiet') return;
          collector.frame(app.audio.now() - lat, f.rms, f.gate);
        }),
        mic.onNote((nn) => {
          // Tiếng của chính app (Nghe thử, phím ảo) không tính; tiếng tích máy đếm nhịp đã bị bộ lọc micro chặn
          if (app.audio.isSounding || app.audio.msSinceSound() < 120) return;
          if (collector.note(nn.midi, (nn.at ?? app.audio.now() - 0.07) - lat) && phase === 'rec') renderLive();
        }),
      );
    }
    if (metro) {
      // Đếm vào: 1 ô (nhịp 2/4: 2 ô = 4 tiếng tích), rồi tiếp tục gõ phách suốt lúc đàn
      const countBeats = bpb === 2 ? 4 : bpb;
      const t0 = now + 0.5;
      downbeat = t0 + countBeats * spb;
      let k = 0;
      const sched = () => {
        const until = app.audio.now() + 0.3;
        while (t0 + k * spb < until) {
          app.audio.click(t0 + k * spb, k % bpb === 0);
          const beat = k;
          const at = t0 + k * spb;
          if (beat < countBeats) {
            timers.push(
              window.setTimeout(() => {
                countNow = (beat % bpb) + 1;
                if (phase === 'count') renderLive();
              }, Math.max(0, (at - app.audio.now()) * 1000)),
            );
          }
          k++;
        }
      };
      sched();
      timers.push(window.setInterval(sched, 60));
      countNow = 0;
      phase = 'count';
    } else {
      downbeat = 0;
      phase = 'rec';
    }
    timers.push(
      window.setInterval(() => {
        const t = app.audio.now();
        if (phase === 'count' && t >= downbeat - 0.05) {
          phase = 'rec';
          render();
          return;
        }
        if (phase !== 'rec') return;
        const lat = dev?.micOk ? 0 : app.mic.inputOutputLatency();
        if (t - startAt >= REC_MAX_S || (collector.events.length && collector.silentFor(t - lat) >= REC_SILENCE_S)) stopAndReview();
        else renderLiveTime();
      }, 200),
    );
    render();
  }

  function renderLiveTime(): void {
    const t = el.querySelector('.sr-live-time');
    if (t) t.textContent = `⏱ ${Math.floor(Math.max(0, app.audio.now() - startAt))} / ${REC_MAX_S} giây${metro ? ` · ♩ = ${bpm} · ${ts}` : ''}`;
  }

  function stopCapture(): void {
    timers.forEach((t) => (window.clearTimeout(t), window.clearInterval(t)));
    timers = [];
    unsubs.forEach((u) => u());
    unsubs = [];
    if (micModule.loaded && !dev?.micOk) {
      try {
        app.mic.stop();
      } catch {
        /* micro chưa tạo */
      }
    }
  }

  function stopAndReview(): void {
    const events = collector.events.map((e) => ({ ...e }));
    stopCapture();
    finish(events, metro ? { bpm, downbeat } : undefined);
  }

  // ---------------- Xem lại ----------------
  function finish(events: OnsetEvent[], m?: { bpm: number; downbeat: number }): void {
    raw = events;
    usedMetro = m;
    if (!events.length) {
      phase = 'setup';
      micError = '';
      render();
      toast('Chưa nghe được nốt nào — đàn to, rõ hơn một chút rồi thử lại nhé', 3200);
      return;
    }
    retranscribe();
    phase = 'review';
    render();
  }

  function retranscribe(): void {
    tr = transcribe(raw, { timeSig: ts, metronome: usedMetro });
    seq = tr.seq.map((s) => ({ ...s }));
    pickupRest = tr.pickupRest;
    outBpm = usedMetro ? usedMetro.bpm : nearestTempo(tr.bpm);
    sel = -1;
  }

  function notesNow() {
    return layoutNotes(seq, pickupRest, barBeats(ts));
  }

  function previewSong() {
    const notes = notesNow();
    if (!notes.some((n) => !n.rest)) return null;
    return buildParentSong(notes, { id: 'rec-preview', title: 'Đàn để thêm bài', createdAt: 0, timeSignature: ts, bpm: outBpm, pickupRest });
  }

  function renderReview(): void {
    stopPlay(false);
    const bpb = barBeats(ts);
    const song = previewSong();
    const notes = notesNow();
    const hint = suggestHandPosition(notes);
    const pitched = seq.filter((s) => !s.rest).length;
    let staffEl: HTMLElement;
    if (song) {
      const tune = parentSongToTune(song);
      staff = new StaffView(tune, { names: true, fingers: true, measuresPerPage: 4 });
      // Nốt ngoài thế tay → tô cam + "✋" (chỉ số trong tune.notes = có thêm dấu lặng lấy đà ở đầu)
      const lead = pickupRest > 0 ? restsFor(pickupRest).length : 0;
      if (hint?.outside.length) {
        const marks = new Map<number, ReviewMark>();
        for (const i of hint.outside) marks.set(i + lead, { kind: 'early', tag: '✋' });
        staff.setReview(marks);
      }
      staffEl = staff.el;
      staffEl.classList.add('sr-staff');
    } else {
      staff = null;
      staffEl = h('div', { class: 'sr-staff sr-staff-empty' }, 'Không còn nốt nào');
    }
    const measures = song ? Math.round(song.notes.reduce((s, n) => s + n.beats, 0) / bpb) : 0;
    const summary = h(
      'p',
      { class: 'sr-summary' },
      `✅ ${pitched} nốt · ${measures} ô nhịp ${ts} · ♩ = ${outBpm}${tr?.tempo === 'estimated' ? ` (app đoán ≈ ${Math.round(tr.bpm)})` : ''}${pickupRest > 0 ? ` · nhịp lấy đà ${String(bpb - pickupRest).replace('.', ',')} phách` : ''}${tr?.dropped ? ` · bỏ ${tr.dropped} tiếng lạ` : ''}`,
    );
    const hand = hint
      ? h(
          'p',
          { class: 'sr-hand' },
          `✋ Thế tay gợi ý: ${hint.hand === 'RH' ? 'tay phải' : 'tay trái'}, ngón 1 ở ${viName(hint.thumb)}${hint.thumb.slice(-1)} (${viName(hint.low)}–${viName(hint.high)}) · ${hint.inside}/${hint.total} nốt trong thế tay`,
          hint.outside.length
            ? h('span', { class: 'sr-out' }, ` · ${hint.outside.length} nốt ngoài thế tay (✋ cam) — app đã xếp ngón để với tới`)
            : ' · số ngón app ghi sẵn trên khuông',
        )
      : null;

    // Từng nốt: chạm để sửa
    const chips = h(
      'div',
      { class: 'sr-chips', role: 'listbox', 'aria-label': 'Các nốt — chạm để sửa' },
      ...seq.map((s, i) => {
        const c = h(
          'button',
          { class: `sr-chip${s.rest ? ' rest' : ''}${i === sel ? ' on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(i === sel) },
          h('b', {}, s.rest ? 'Lặng' : shortName(s.midi!)),
          h('small', {}, durName(s.beats)),
        );
        c.addEventListener('click', () => {
          sel = sel === i ? -1 : i;
          if (sel >= 0 && !seq[sel].rest) void app.audio.playPitch(midiToPitch(seq[sel].midi!), 0.5);
          renderReview();
        });
        return c;
      }),
    );
    const it = sel >= 0 ? seq[sel] : null;
    const vi = it ? NOTE_VALUES.indexOf(it.beats as (typeof NOTE_VALUES)[number]) : -1;
    const edit = it
      ? h(
          'div',
          { class: 'sr-edit' },
          h('span', { class: 'sr-edit-lbl' }, `Nốt ${sel + 1}: ${it.rest ? 'dấu lặng' : shortName(it.midi!)} · ${durName(it.beats)}`),
          it.rest ? null : button({ icon: '▲', label: 'Cao ½', onTap: () => editPitch(1) }),
          it.rest ? null : button({ icon: '▼', label: 'Thấp ½', onTap: () => editPitch(-1) }),
          button({ icon: '➕', label: 'Dài hơn', disabled: vi === 0, onTap: () => editDur(-1) }),
          button({ icon: '➖', label: 'Ngắn hơn', disabled: it.beats <= 0.5, onTap: () => editDur(1) }),
          button({ icon: '🗑️', label: 'Xóa', kind: 'retry', onTap: () => remove() }),
        )
      : h('p', { class: 'sr-edit-hint' }, '👆 Chạm một nốt để sửa cao độ / trường độ hoặc xóa. Sửa thêm được ở trình soạn sau khi đưa vào bài.');

    const canHalve = seq.every((s) => s.beats / 2 >= 0.5 - 1e-9);
    const tools = h(
      'div',
      { class: 'sr-tools' },
      h('span', { class: 'sr-lbl' }, 'Dời vạch nhịp'),
      button({ icon: '◀', label: 'Sớm ½', onTap: () => shiftBar(0.5) }),
      button({ icon: '▶', label: 'Muộn ½', onTap: () => shiftBar(-0.5) }),
      h('span', { class: 'sr-lbl' }, 'Trường độ'),
      button({ icon: '×2', label: 'Gấp đôi', disabled: seq.some((s) => s.beats * 2 > 4), onTap: () => scale(2) }),
      button({ icon: '÷2', label: 'Một nửa', disabled: !canHalve, onTap: () => scale(0.5) }),
      seg<TimeSig>('Nhịp', ['4/4', '3/4', '2/4'], ts, (v) => {
        ts = v;
        retranscribe();
        renderReview();
      }),
    );
    body.replaceChildren(h('div', { class: 'sr-review' }, summary, staffEl, hand, chips, edit, tools));
    renderReviewBar();
  }

  function renderReviewBar(): void {
    bar.replaceChildren(
      button({ icon: '🔁', label: 'Đàn lại', onTap: () => (stopPlay(false), (phase = 'setup'), render()) }),
      playing
        ? button({ icon: '■', label: 'Dừng', kind: 'retry', onTap: () => stopPlay() })
        : button({ icon: '▶', label: 'Nghe thử', kind: 'sun', disabled: !seq.some((s) => !s.rest), onTap: play }),
      button({ icon: '✅', label: 'Đưa vào bài', kind: 'primary', big: true, disabled: !seq.some((s) => !s.rest), onTap: apply }),
    );
  }

  function editPitch(d: number): void {
    const it = seq[sel];
    if (!it || it.rest || it.midi === undefined) return;
    const m = Math.max(48, Math.min(84, it.midi + d));
    seq[sel] = { ...it, midi: m };
    void app.audio.playPitch(midiToPitch(m), 0.5);
    renderReview();
  }
  function editDur(dir: number): void {
    const it = seq[sel];
    if (!it) return;
    const vals = [...NOTE_VALUES] as number[];
    let k = vals.indexOf(it.beats);
    if (k < 0) k = vals.findIndex((v) => v <= it.beats);
    const nk = Math.max(0, Math.min(vals.length - 1, k + dir));
    seq[sel] = { ...it, beats: vals[nk] };
    renderReview();
  }
  function remove(): void {
    seq.splice(sel, 1);
    // Bỏ dấu lặng ở đầu (nốt đầu luôn là nốt — lặng đầu nằm ở nhịp lấy đà)
    while (seq.length && seq[0].rest) {
      pickupRest = (pickupRest + seq[0].beats) % barBeats(ts);
      seq.shift();
    }
    sel = Math.min(sel, seq.length - 1);
    if (sel >= 0 && seq[sel].rest) sel = -1;
    renderReview();
  }
  function shiftBar(d: number): void {
    const bpb = barBeats(ts);
    pickupRest = (((pickupRest + d) % bpb) + bpb) % bpb;
    renderReview();
  }
  function scale(f: number): void {
    seq = seq.map((s) => ({ ...s, beats: s.beats * f }));
    pickupRest = (pickupRest * f) % barBeats(ts);
    outBpm = nearestTempo(outBpm * f);
    renderReview();
  }

  function play(): void {
    stopPlay(false);
    const song = previewSong();
    if (!song) return;
    const tune = parentSongToTune(song);
    const spb = 60 / outBpm;
    const t0 = app.audio.now() + 0.3;
    const ts_: number[] = [];
    const notes = timeline(tune);
    for (const n of notes) {
      if (n.rest || !n.pitch) continue;
      void app.audio.scheduleFreq(midiToFreq(pitchToMidi(n.pitch)), t0 + n.start * spb, n.beats * spb * 0.95);
      ts_.push(window.setTimeout(() => staff?.setCursor(n.index), 300 + n.start * spb * 1000));
    }
    const end = notes.reduce((s, n) => s + n.beats, 0);
    ts_.push(window.setTimeout(() => stopPlay(), 300 + end * spb * 1000 + 400));
    playing = {
      stop: () => {
        ts_.forEach((t) => window.clearTimeout(t));
        app.audio.stopAll();
      },
    };
    renderReviewBar();
  }
  function stopPlay(redraw = true): void {
    if (!playing) return;
    playing.stop();
    playing = null;
    if (redraw && phase === 'review') renderReviewBar();
  }

  function apply(): void {
    stopPlay(false);
    const notes = notesNow();
    const text = toEditorText(notes, pickupRest, barBeats(ts));
    if (!text) return;
    // Trình soạn hỏi "thay nốt đang có?" rồi tự đóng lớp phủ (hàm trả về của openSongRecorder) — bấm Hủy thì giữ bản chép
    o.onApply({ text, ts, bpm: outBpm, notes: notes.filter((n) => !n.rest).length });
  }

  function close(): void {
    destroy();
    o.onClose();
  }

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    stopPlay(false);
    stopCapture();
    el.remove();
    if (dev && (window as unknown as { __songRec?: DevHook }).__songRec === dev) delete (window as unknown as { __songRec?: DevHook }).__songRec;
  }

  render();
  return destroy;
}
