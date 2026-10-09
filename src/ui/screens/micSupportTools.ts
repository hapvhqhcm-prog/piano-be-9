/**
 * Màn "🎤 Cài micro" — 🔧 DÀNH CHO NGƯỜI HỖ TRỢ: độ nhạy (app đã tự chỉnh), bù lệch dây đàn (cents), độ trễ loa → micro,
 * đàn tự do (bố mẹ chấm micro), sao chép nhật ký, mở "🩺 Kiểm tra iPad". Trạng thái dùng chung: micTestShared.ts.
 */
import { BLUETOOTH_LIKELY_MS, LATENCY_GAP, LATENCY_MAX, LATENCY_PINGS, estimateLatency } from '../../audio/latency';
import { noteLabel, pitchFreq, type Pitch } from '../../piano/pitchTable';
import { button, h, toast } from '../components/dom';
import { saveMicLog } from '../../audio/micLogStore';
import { describeAutoTune } from '../../audio/autoTune';
import { lazy, lazyScreen } from '../lazy';
import { FREE_LOG_MAX, SENS_LABEL, buildMicLog, type FreeNote, type MicTestCtx } from './micTestShared';

const diagnosticsMod = lazy(() => import('./diagnostics'));

export interface SupportTools {
  /** Mục "🔧 Dành cho người hỗ trợ" (thu gọn) */
  readonly helper: HTMLElement;
  /** Đàn tự do: nốt nghe được + bố mẹ chấm đúng/sai (độ chính xác THẬT với đàn nhà) */
  readonly freeLog: FreeNote[];
  renderSens(): void;
  showTuning(): void;
  showLatency(): void;
  showFree(): void;
  /** Đang "Chỉnh theo đàn nhà" (c.s.calibrating): micro nghe được nốt `p` (tần số `freq`) */
  onCalibNote(p: Pitch, freq: number): void;
  /** Đàn tự do: ghi lại nốt nghe được để bố mẹ chấm đúng/sai */
  onFreeNote(note: FreeNote): void;
}

export function createSupportTools(c: MicTestCtx): SupportTools {
  const { app, store, s, calib, report } = c;
  const tuning = h('p', { class: 'muted' });
  const latencyText = h('p', { class: 'muted' });
  const helper = h('details', { class: 'mic-help' });
  let samples: number[] = [];
  const freeLog: FreeNote[] = [];
  const freeText = h('p', { class: 'muted' });

  const showLatency = () => {
    const ms = store.settings.micLatencyMs;
    latencyText.textContent = ms > 0 ? `Độ trễ loa → micro đã đo: ${ms} ms (dùng khi chấm nhịp)` : 'Chưa đo độ trễ loa → micro.';
  };

  /**
   * Đo độ trễ: phát 6 tiếng "tinh" (Đô5 — tiếng tích máy đếm nhịp bị bộ lọc micro chặn nên không dùng được),
   * micro bắt lần gõ → so với giờ hẹn → độ trễ khứ hồi (trung vị, bỏ lần lệch xa).
   */
  const measureLatency = async () => {
    if (s.measuring) return;
    c.stopAuto();
    if (!(await c.startMic())) return;
    const ctx = app.audio.context;
    if (!ctx) return;
    s.checking = -1;
    window.clearTimeout(s.stepTimer);
    s.calibrating = false;
    s.measuring = true;
    calib.textContent = '⏱️ Đang đo độ trễ… Giữ yên lặng, app sẽ phát 6 tiếng "tinh". Mở loa iPad vừa đủ nghe.';
    const onsets: number[] = [];
    const unOnset = app.mic.onOnset((at) => onsets.push(at));
    const t0 = ctx.currentTime + 0.6;
    const times = Array.from({ length: LATENCY_PINGS }, (_, i) => t0 + i * LATENCY_GAP);
    times.forEach((t) => app.audio.ping(t));
    const waitMs = (times[times.length - 1] - ctx.currentTime + LATENCY_MAX + 0.2) * 1000;
    await new Promise((r) => window.setTimeout(r, waitMs));
    unOnset();
    s.measuring = false;
    if (s.disposed) return;
    const est = estimateLatency(times, onsets);
    if (!est) {
      calib.textContent =
        'Chưa đo được: micro không nghe rõ tiếng "tinh". Tăng âm lượng iPad, tháo tai nghe, giữ yên lặng rồi đo lại.';
      return;
    }
    store.updateSettings({ micLatencyMs: est.ms });
    app.mic.latencyMs = est.ms;
    showLatency();
    calib.textContent =
      `⏱️ Độ trễ loa → micro: ${est.ms} ms (đo được ${est.used}/${est.total} lần, lệch ±${est.spreadMs} ms). ` +
      (est.ms > BLUETOOTH_LIKELY_MS
        ? 'Đang dùng tai nghe Bluetooth? Hãy dùng loa iPad để chấm nhịp chính xác.'
        : 'Đã lưu — app dùng con số này khi chấm nhịp. ✅');
  };

  const showTuning = () => {
    const cents = store.settings.micTuningCents;
    tuning.textContent =
      `Đang bù cho đàn nhà: ${cents > 0 ? '+' : ''}${cents} cent (100 cent = nửa cung)` +
      ` · Tự học khi bé đàn đúng: ${describeAutoTune(app.mic.autoTune.stats())}`;
  };

  const sensBox = h('div', { class: 'seg' });
  const renderSens = () => {
    sensBox.replaceChildren(
      ...SENS_LABEL.map((o) => {
        const b = h('button', { class: `seg-btn${o.value === store.settings.micSensitivity ? ' on' : ''}`, type: 'button' }, o.label);
        b.addEventListener('click', () => {
          store.updateSettings({ micSensitivity: o.value });
          app.mic.sensitivity = o.value;
          renderSens();
        });
        return b;
      }),
    );
  };

  const onCalibNote = (p: Pitch, freq: number) => {
    // Độ lệch "thô" so với C4 chuẩn — so trực tiếp tần số, vì đàn lệch > nửa cung
    // sẽ bị nhận thành Si/Đô thăng nếu chỉ nhìn tên nốt.
    const raw = 1200 * Math.log2(freq / pitchFreq('C4'));
    if (Math.abs(raw) > 100) {
      calib.textContent = `App nghe thấy ${noteLabel(p)} — hãy đàn Đô giữa (C4) nhé.`;
      return;
    }
    samples.push(raw);
    if (samples.length < 3) {
      calib.textContent = `Tốt! Đàn Đô giữa thêm ${3 - samples.length} lần nữa…`;
      return;
    }
    const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    const clamped = Math.max(-100, Math.min(100, avg));
    store.updateSettings({ micTuningCents: clamped });
    app.mic.tuningCents = clamped;
    s.calibrating = false;
    c.showKb();
    calib.textContent =
      Math.abs(clamped) >= 40
        ? `Đã chỉnh: đàn nhà lệch ${clamped} cent (100 cent = nửa cung). Lệch khá nhiều — nên gọi thợ lên dây khi có dịp.`
        : `Đã chỉnh xong: đàn nhà lệch ${clamped} cent (100 cent = nửa cung). ✅`;
    showTuning();
  };

  /** Bộ đếm "nhận nốt" khi đàn tự do: bố mẹ chạm Đúng/Sai cho nốt vừa hiện → độ chính xác thật với đàn nhà. */
  function showFree(): void {
    const judged = freeLog.filter((x) => x.verdict);
    const good = judged.filter((x) => x.verdict === 'ok').length;
    const last = freeLog[freeLog.length - 1];
    freeText.textContent =
      `Micro đã nghe ${freeLog.length} nốt` +
      (judged.length ? ` · bố mẹ chấm ${good}/${judged.length} đúng (${Math.round((good / judged.length) * 100)}%)` : '') +
      (last && !last.verdict ? ` · nốt vừa nghe: ${noteLabel(last.note)} — đúng phím bé đàn không?` : '');
  }
  const judge = (v: 'ok' | 'wrong') => {
    const last = freeLog[freeLog.length - 1];
    if (!last || last.verdict) return;
    last.verdict = v;
    showFree();
  };
  const onFreeNote = (note: FreeNote) => {
    freeLog.push(note);
    if (freeLog.length > FREE_LOG_MAX) freeLog.shift();
    showFree();
  };

  const copyLog = async () => {
    const log = buildMicLog(app, c.logState());
    saveMicLog(log);
    const text = JSON.stringify(log, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      calib.textContent = 'Đã sao chép nhật ký — dán vào tin nhắn gửi người hỗ trợ.';
    } catch {
      const ta = h('textarea', { class: 'mic-log', readonly: '' }) as HTMLTextAreaElement;
      ta.value = text;
      report.append(ta);
      ta.select();
      calib.textContent = 'Không sao chép tự động được — hãy chọn và sao chép đoạn chữ bên dưới.';
    }
  };

  const calibrate = async () => {
    c.stopAuto();
    if (s.measuring || !(await c.startMic())) return;
    s.checking = -1;
    window.clearTimeout(s.stepTimer);
    s.calibrating = true;
    samples = [];
    app.mic.tuningCents = 0;
    c.showKb();
    calib.textContent = 'Đàn phím Đô giữa (C4) 3 lần, mỗi lần cách nhau 1 giây.';
  };

  // 🔧 Dành cho người hỗ trợ: độ nhạy (app đã tự chỉnh), bù lệch dây đàn (cents), độ trễ, chấm micro, nhật ký
  helper.append(
    h('summary', {}, '🔧 Dành cho người hỗ trợ (kỹ thuật)'),
    h('h3', {}, 'Độ nhạy micro (bài kiểm tra 5 nốt tự chỉnh)'),
    sensBox,
    h('h3', {}, 'Đàn nhà lệch dây'),
    tuning,
    h(
      'div',
      { class: 'row mic-tools' },
      button({ icon: '🎯', label: 'Chỉnh theo đàn nhà', onTap: () => void calibrate() }),
      button({
        icon: '↺',
        label: 'Bù = 0',
        onTap: () => {
          store.updateSettings({ micTuningCents: 0 });
          app.mic.tuningCents = 0;
          s.calibrating = false;
          c.showKb();
          calib.textContent = '';
          showTuning();
        },
      }),
      button({
        icon: '🧹',
        label: 'Học lại lệch dây',
        onTap: () => {
          // (+ 2026-10-09) Xóa kết quả tự học (vd vừa lên dây đàn / đổi đàn) — app học lại từ các nốt bé đàn đúng
          app.mic.loadAutoTune(null);
          store.updateSettings({ micAutoTune: undefined });
          showTuning();
          toast('🧹 Đã xóa — micro sẽ tự học lại độ lệch dây khi bé đàn', 3000);
        },
      }),
    ),
    h('h3', {}, 'Độ trễ loa → micro (chấm nhịp)'),
    latencyText,
    h('div', { class: 'row mic-tools' }, button({ icon: '⏱️', label: 'Đo độ trễ', onTap: () => void measureLatency() })),
    h('h3', {}, 'Đàn tự do — bố mẹ chấm micro'),
    freeText,
    h(
      'div',
      { class: 'row mic-tools' },
      button({ icon: '✅', label: 'Đúng', onTap: () => judge('ok') }),
      button({ icon: '❌', label: 'Sai', onTap: () => judge('wrong') }),
      button({ icon: '📋', label: 'Sao chép nhật ký', onTap: () => void copyLog() }),
    ),
    h('h3', {}, 'Kiểm tra cả iPad (âm thanh, giọng đọc, lưu trữ…)'),
    h(
      'div',
      { class: 'row mic-tools' },
      button({ icon: '🩺', label: 'Kiểm tra iPad', onTap: () => app.show(lazyScreen(diagnosticsMod, (m) => m.diagnosticsScreen(app))) }),
    ),
  );

  return { helper, freeLog, renderSens, showTuning, showLatency, showFree, onCalibNote, onFreeNote };
}
