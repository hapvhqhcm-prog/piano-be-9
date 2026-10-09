/**
 * (+ 2026-10-09) Trang NGHE THỬ A/B tiếng đàn — CHỈ bản dev: mở `?soundtest` (vd http://<máy-dev>:5173/?soundtest).
 * A = tiếng cũ ('classic'), B = tiếng mới ('warm'). Nốt đơn C2–C7, hợp âm, nốt ngắt (nghe tiếng giảm chấn),
 * giai điệu + bè đệm (như màn bài hát), thử tải nặng (≥ 8 nốt → chế độ nhẹ). Hiện số nút Web Audio (CPU) và
 * bảng đo khách quan (trọng tâm phổ, tốc độ tắt bậc 1/6) tính từ voiceAnalysis.ts.
 */
import { AudioEngine } from '../audio/AudioEngine';
import type { VoiceModel } from '../audio/pianoVoice';
import { nodesPerNote, partialDecayRate, spectralCentroid } from '../audio/voiceAnalysis';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiOf = (name: string): number => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(name);
  return NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1);
};
const hz = (name: string): number => 440 * Math.pow(2, (midiOf(name) - 69) / 12);

interface Ev {
  at: number; // giây từ lúc bắt đầu
  note: string;
  dur: number;
  vol: number;
  track: boolean;
}

/** Một mục nghe thử: danh sách nốt (vol tương đối, nhân với độ mạnh đang chọn). */
interface Item {
  label: string;
  events: () => Ev[];
}

const single = (n: string): Item => ({ label: n, events: () => [{ at: 0, note: n, dur: 1.6, vol: 1, track: true }] });
const chord = (label: string, notes: string[], dur = 2): Item => ({
  label,
  events: () => notes.map((note) => ({ at: 0, note, dur, vol: 0.8, track: true })),
});

/** "Vui sao nhạc ơi" (Ode to Joy) giọng Đô + bè đệm Alberti tay trái nhẹ (bè đệm không chặn micro, như songState). */
function melodyWithAccomp(): Ev[] {
  const spb = 0.5;
  const mel = 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4'.split(' ');
  const lens = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 0.5, 2];
  const ev: Ev[] = [];
  let b = 0;
  mel.forEach((n, i) => {
    ev.push({ at: b * spb, note: n, dur: lens[i] * spb * 0.95, vol: 1, track: true });
    b += lens[i];
  });
  // Alberti: C–G–E–G (Đô) / B–G–D–G (Sol) theo từng ô nhịp 4 phách, móc đơn
  const bars = [
    ['C3', 'G3', 'E3', 'G3'],
    ['C3', 'G3', 'E3', 'G3'],
    ['C3', 'G3', 'E3', 'G3'],
    ['B2', 'G3', 'D3', 'G3'],
  ];
  for (let bar = 0; bar < 4; bar++)
    for (let k = 0; k < 8; k++) {
      const n = bars[bar][k % 4];
      ev.push({ at: (bar * 4 + k * 0.5) * spb, note: n, dur: 0.5 * spb * 0.9, vol: 0.35, track: false });
    }
  return ev;
}

const ITEMS: Item[] = [
  ...['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].map(single),
  {
    label: 'Dãy Đô C2→C7',
    events: () => ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].map((note, i) => ({ at: i * 0.7, note, dur: 0.65, vol: 1, track: true })),
  },
  chord('Hợp âm Đô trầm (C3 E3 G3 C4)', ['C3', 'E3', 'G3', 'C4']),
  chord('Hợp âm Đô cao (C5 E5 G5 C6)', ['C5', 'E5', 'G5', 'C6']),
  chord('Hợp âm Sol7 (G2 B3 D4 F4)', ['G2', 'B3', 'D4', 'F4']),
  {
    label: 'Nốt ngắt (nghe giảm chấn)',
    events: () => ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'].map((note, i) => ({ at: i * 0.3, note, dur: 0.14, vol: 1, track: true })),
  },
  {
    label: 'Gam Đô 2 quãng tám (legato)',
    events: () => {
      const s = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      const notes = [...s.map((x) => x + '4'), ...s.map((x) => x + '5'), 'C6'];
      return notes.map((note, i) => ({ at: i * 0.25, note, dur: 0.27, vol: 0.9, track: true }));
    },
  },
  { label: 'Giai điệu + bè đệm (Vui sao nhạc ơi)', events: melodyWithAccomp },
  {
    label: 'Tải nặng: 16 nốt cùng lúc (chế độ nhẹ)',
    events: () =>
      Array.from({ length: 16 }, (_, i) => ({ at: 0, note: NAMES[(i * 7) % 12] + String(2 + Math.floor(i / 4)), dur: 1.5, vol: 0.4, track: false })),
  },
];

function length(evs: Ev[]): number {
  return evs.reduce((m, e) => Math.max(m, e.at + e.dur + 0.5), 0);
}

export function mountSoundTest(root: HTMLElement): void {
  const eng = new AudioEngine();
  let vel = 0.8;
  let timers: number[] = [];

  root.innerHTML = '';
  const page = document.createElement('div');
  page.style.cssText =
    'position:fixed;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;background:#fff8ec;color:#2b2118;font:16px/1.4 system-ui,sans-serif;padding:16px;box-sizing:border-box';
  page.className = 'scrollable';
  root.appendChild(page);

  const h = (tag: string, text = '', css = ''): HTMLElement => {
    const e = document.createElement(tag);
    e.textContent = text;
    if (css) e.style.cssText = css;
    return e;
  };
  const btn = (text: string, onClick: () => void, css = ''): HTMLButtonElement => {
    const b = h('button', text, 'font:inherit;padding:10px 14px;margin:4px;border-radius:12px;border:1px solid #c9a97a;background:#fff;min-width:56px;' + css) as HTMLButtonElement;
    b.addEventListener('click', onClick);
    return b;
  };

  page.appendChild(h('h1', '🎹 Nghe thử tiếng đàn — A/B', 'font-size:24px;margin:0 0 4px'));
  page.appendChild(
    h('p', 'A = tiếng cũ · B = tiếng mới (ấm hơn). Bấm "A→B" để nghe lần lượt cùng một đoạn. Nên đeo tai nghe hoặc nghe loa iPad ở âm lượng vừa.', 'margin:0 0 12px;color:#6b5a48'),
  );

  const status = h('div', '', 'padding:10px;border-radius:12px;background:#f3e6cf;margin-bottom:12px;font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap');
  page.appendChild(status);

  const unlock = btn('🔈 Bật âm thanh', () => {
    void eng.unlock().then((ok) => (unlock.textContent = ok ? '✅ Âm thanh đã bật' : '⚠️ Chưa bật được — bấm lại'));
  }, 'background:#ffd98a;font-weight:600');
  page.appendChild(unlock);

  // Độ mạnh
  const velRow = h('div', 'Độ mạnh: ', 'margin:8px 0');
  const velBtns: HTMLButtonElement[] = [];
  for (const [label, v] of [['nhẹ (p)', 0.4], ['vừa (mf)', 0.8], ['mạnh (f)', 1.2]] as const) {
    const b = btn(label, () => {
      vel = v;
      velBtns.forEach((x) => (x.style.background = '#fff'));
      b.style.background = '#cde8c4';
    });
    if (v === vel) b.style.background = '#cde8c4';
    velBtns.push(b);
    velRow.appendChild(b);
  }
  page.appendChild(velRow);
  page.appendChild(btn('⏹ Dừng', () => stop(), 'background:#f6c7c0'));

  const stop = (): void => {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
    eng.stopAll();
  };

  const play = (evs: Ev[], model: VoiceModel, offset: number): void => {
    const go = (): void => {
      eng.voiceModel = model;
      const t0 = eng.now() + 0.08;
      for (const e of evs) void eng.scheduleFreq(hz(e.note), t0 + e.at, e.dur, e.vol * vel, e.track);
      lastModel = model;
    };
    if (offset <= 0) go();
    else timers.push(window.setTimeout(go, offset * 1000));
  };
  let lastModel: VoiceModel = 'warm';

  const list = h('div', '', 'margin-top:12px');
  for (const it of ITEMS) {
    const row = h('div', '', 'display:flex;align-items:center;flex-wrap:wrap;border-top:1px solid #ead9bd;padding:6px 0');
    row.appendChild(h('div', it.label, 'flex:1 1 220px;min-width:0'));
    const run = (models: VoiceModel[]): void => {
      if (eng.state !== 'running') void eng.unlock();
      stop();
      eng.resetStats();
      const evs = it.events();
      models.forEach((m, i) => play(evs, m, i * (length(evs) + 0.6)));
    };
    row.appendChild(btn('A', () => run(['classic'])));
    row.appendChild(btn('B', () => run(['warm']), 'background:#e4f1ff'));
    row.appendChild(btn('A→B', () => run(['classic', 'warm'])));
    row.appendChild(btn('B→A', () => run(['warm', 'classic'])));
    list.appendChild(row);
  }
  page.appendChild(list);

  // Bảng đo khách quan
  page.appendChild(h('h2', 'Số đo (tính từ tham số — tests/pianoTone.test.ts)', 'font-size:18px;margin:20px 0 6px'));
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;font:13px ui-monospace,monospace';
  const head = ['kiểu', 'nốt', 'sáng lúc gõ (×f0)', 'sáng 0,5 s / lúc gõ', 'mạnh/nhẹ', 'tắt bậc1 dB/s', 'tắt bậc6 dB/s', 'nút/nốt'];
  const tr = (cells: string[], th = false): HTMLTableRowElement => {
    const r = document.createElement('tr');
    for (const c of cells) {
      const d = document.createElement(th ? 'th' : 'td');
      d.textContent = c;
      d.style.cssText = 'border:1px solid #ead9bd;padding:3px 6px;text-align:right';
      r.appendChild(d);
    }
    return r;
  };
  table.appendChild(tr(head, true));
  for (const m of ['classic', 'warm'] as const)
    for (const n of ['C2', 'C3', 'C4', 'C5', 'C6', 'C7']) {
      const f = hz(n);
      const c0 = spectralCentroid(m, f, 1, 10, 0.01);
      const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
      table.appendChild(
        tr([
          m === 'classic' ? 'A cũ' : 'B mới',
          n,
          (c0 / f).toFixed(2),
          (spectralCentroid(m, f, 1, 10, 0.5) / c0).toFixed(2),
          (spectralCentroid(m, f, 1.2, 10, 0.01) / spectralCentroid(m, f, 0.3, 10, 0.01)).toFixed(2),
          fmt(partialDecayRate(m, f, 1, 0.05, 0.5)),
          fmt(partialDecayRate(m, f, 6, 0.05, 0.5)),
          String(nodesPerNote(m, f, 1, 0.3, false)),
        ]),
      );
    }
  const wrap = h('div', '', 'overflow-x:auto');
  wrap.appendChild(table);
  page.appendChild(wrap);

  const tick = (): void => {
    const s = eng.stats;
    status.textContent =
      `Trạng thái: ${eng.state} · đang nghe: ${lastModel === 'classic' ? 'A (cũ)' : 'B (mới)'}\n` +
      `Nốt đang vang / đã hẹn: ${s.voices} · nút Web Audio của các nốt đó: ${s.liveNodes} (đỉnh ${s.peakNodes})\n` +
      `Nút của nốt gần nhất: ${s.lastNoteNodes} · số nốt chế độ nhẹ: ${s.lightNotes}/${s.notes}`;
  };
  window.setInterval(tick, 150);
  tick();
}
