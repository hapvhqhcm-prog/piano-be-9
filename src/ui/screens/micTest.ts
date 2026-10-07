import { MicListener, meterPct, type MicFrame, type MicState } from '../../audio/MicListener';
import { BLUETOOTH_LIKELY_MS, LATENCY_GAP, LATENCY_MAX, LATENCY_PINGS, estimateLatency } from '../../audio/latency';
import type { Sensitivity } from '../../audio/micAnalyzer';
import { CandidateTally, chooseSensitivity, type Candidate, type NoteCheck, type TuneTip } from '../../audio/micTune';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToPitch, noteLabel, pitchFreq, pitchToMidi, type Pitch } from '../../piano/pitchTable';
import type { App } from '../App';
import { actionBar, backButton, button, h, toast } from '../components/dom';
import { parentScreen } from './parent';
import '../../styles/parentux.css';

/** Kiểm tra 5 nốt "tốt" (đủ để dùng micro cho buổi học): nghe đúng ít nhất bấy nhiêu nốt */
export const MIC_GOOD = 4;

const STATE_TEXT: Record<MicState, string> = {
  off: 'Micro đang tắt',
  starting: 'Đang bật micro… (iPad có thể hỏi quyền — chọn Cho phép)',
  on: '🎤 Đang nghe — hãy đàn một phím',
  denied:
    'iPad đang chặn micro. Vào Cài đặt → Safari → Micrô → chọn "Hỏi" hoặc "Cho phép", rồi mở lại app.',
  unsupported: 'Thiết bị/trang này không dùng được micro (cần mở bằng địa chỉ https:// GitHub Pages).',
  error: 'Không bật được micro. Thử đóng hẳn app rồi mở lại.',
};

const SENS_LABEL: Array<{ value: Sensitivity; label: string }> = [
  { value: 'low', label: 'Thấp (phòng ồn)' },
  { value: 'normal', label: 'Vừa' },
  { value: 'high', label: 'Cao (đàn nhỏ / iPad xa)' },
];

/** Bài kiểm tra: 5 nốt thế tay Đô — đủ để thấy micro nghe được, nghe đúng, và đàn có lệch không. */
const CHECK_NOTES: Pitch[] = ['C4', 'D4', 'E4', 'F4', 'G4'];
const STEP_TIMEOUT_MS = 8000;
/** Nhật ký "đàn tự do" giữ tối đa bấy nhiêu nốt. */
const FREE_LOG_MAX = 100;

const TIP_TEXT: Record<TuneTip, string> = {
  calibrate: 'Có nốt tiếng đủ to mà micro nghe lệch nửa cung → bấm "Chỉnh theo đàn nhà" (đàn lâu không lên dây).',
  quiet:
    'Có nốt tiếng đủ to mà micro vẫn chưa rõ cao độ → bớt tiếng ồn (TV, quạt, điều hòa), đàn từng nốt rõ ràng, nhả phím trước khi đàn nốt sau.',
  closer:
    'Tiếng đàn tới micro rất nhỏ kể cả ở độ nhạy Cao → đặt iPad trên giá nhạc (gần dây đàn), mở nắp trên của đàn nếu được.',
};

/** Tên bộ lọc iOS (cảnh báo cho phụ huynh). */
const PROCESSING_NAME: Record<string, string> = {
  echoCancellation: 'lọc tiếng vọng',
  noiseSuppression: 'giảm ồn',
  autoGainControl: 'tự chỉnh âm lượng',
  voiceIsolation: 'tách giọng nói',
};

interface FreeNote {
  note: Pitch;
  cents: number;
  /** Từ lúc gõ phím (ước tính) tới lúc app báo nốt (ms) */
  latencyMs: number | null;
  /** Bố mẹ chấm: micro nghe đúng phím bé đàn không */
  verdict?: 'ok' | 'wrong';
}

interface StepLog {
  want: Pitch;
  result: 'ok' | 'wrong' | 'none';
  heard: string[];
  /** ms từ lúc yêu cầu tới lúc nghe đúng */
  ms?: number;
  maxRms: number;
  gate: number;
  floor: number;
  pitchedFrames: number;
  frames: number;
  bestClarity: number;
  /** Nốt ứng viên (top 3) từ các khung có cao độ */
  candidates: Candidate[];
  /** Gõ phím → app báo nốt (ms), từng lần nghe được */
  latencyMs: number[];
}

/**
 * Màn phụ huynh "🎤 Cài micro (3 bước)" (rà soát 2026-10-06 — trước đây không có bước nào bật settings.micEnabled):
 *   1) Cho phép micro → 2) Kiểm tra 5 nốt (tự chỉnh độ nhạy) → 3) kết quả tốt: nút to "✅ Dùng micro cho các buổi học"
 *   (đặt micEnabled = true; có nút tắt lại). Công cụ kỹ thuật nằm trong "🔧 Dành cho người hỗ trợ".
 * Bên trong vẫn là TRÌNH CHẨN ĐOÁN:
 * - thanh âm lượng có vạch ngưỡng (tiếng đàn phải vượt vạch mới được nghe)
 * - chỉnh độ nhạy, chỉnh theo đàn nhà (đàn cơ lâu không lên dây lệch vài chục cents)
 * - kiểm tra 5 nốt → kết luận + lời khuyên cụ thể; sao chép nhật ký để gửi người hỗ trợ
 */
export function micTestScreen(app: App) {
  return (root: HTMLElement) => {
    const store = app.store;
    const status = h('p', { class: 'lead' });
    const big = h('div', { class: 'note-big' }, '—');
    const detail = h('div', { class: 'note-sub' }, ' ');
    const levelBar = h('span', { class: 'mic-level-bar' });
    const meterText = h('p', { class: 'muted small' }, ' ');
    const tuning = h('p', { class: 'muted' });
    const latencyText = h('p', { class: 'muted' });
    const calib = h('p', { class: 'lead' });
    const report = h('div', { class: 'mic-report' });
    const kb = new PianoKeyboard({ labels: 'all', fingerOnPress: false });
    kb.setEnabled(false);
    const kbWrap = h('div', { class: 'keyboard-wrap short' }, kb.el);
    const wizard = h('ol', { class: 'mic-wizard', 'aria-label': 'Các bước cài micro' });
    const useBox = h('div', { class: 'mic-use' });
    const helper = h('details', { class: 'mic-help' });
    /** Kết quả lần kiểm tra 5 nốt gần nhất (số nốt nghe đúng); null = chưa kiểm tra */
    let lastOk: number | null = null;

    let calibrating = false;
    let samples: number[] = [];
    // Kiểm tra 5 nốt
    let checking = -1;
    let stepStart = 0;
    let stepTimer: number | undefined;
    let steps: StepLog[] = [];
    let lastFrame: MicFrame | null = null;
    let lastMeterText = 0;
    /** Đang đo độ trễ (app phát tiếng "tinh") — bỏ qua nốt nghe được lúc này */
    let measuring = false;
    let disposed = false;
    let tally = new CandidateTally();
    /** Đàn tự do: nốt nghe được + bố mẹ chấm đúng/sai (độ chính xác THẬT với đàn nhà) */
    const freeLog: FreeNote[] = [];
    let autoTune: ReturnType<typeof chooseSensitivity> | null = null;
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
      if (measuring) return;
      if (!(await startMic())) return;
      const ctx = app.audio.context;
      if (!ctx) return;
      checking = -1;
      window.clearTimeout(stepTimer);
      calibrating = false;
      measuring = true;
      calib.textContent = '⏱️ Đang đo độ trễ… Giữ yên lặng, app sẽ phát 6 tiếng "tinh". Mở loa iPad vừa đủ nghe.';
      const onsets: number[] = [];
      const unOnset = app.mic.onOnset((at) => onsets.push(at));
      const t0 = ctx.currentTime + 0.6;
      const times = Array.from({ length: LATENCY_PINGS }, (_, i) => t0 + i * LATENCY_GAP);
      times.forEach((t) => app.audio.ping(t));
      const waitMs = (times[times.length - 1] - ctx.currentTime + LATENCY_MAX + 0.2) * 1000;
      await new Promise((r) => window.setTimeout(r, waitMs));
      unOnset();
      measuring = false;
      if (disposed) return;
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
      const c = store.settings.micTuningCents;
      tuning.textContent = `Đang bù cho đàn nhà: ${c > 0 ? '+' : ''}${c} cent (100 cent = nửa cung)`;
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

    const newStep = (want: Pitch): StepLog => ({
      want,
      result: 'none',
      heard: [],
      maxRms: 0,
      gate: 0,
      floor: 0,
      pitchedFrames: 0,
      frames: 0,
      bestClarity: 0,
      candidates: [],
      latencyMs: [],
    });

    const askStep = () => {
      window.clearTimeout(stepTimer);
      if (checking >= CHECK_NOTES.length) return finishCheck();
      const want = CHECK_NOTES[checking];
      steps.push(newStep(want));
      tally = new CandidateTally();
      stepStart = performance.now();
      kb.clear();
      kb.setTargets([{ pitch: want, hand: 'RH', finger: checking + 1 }]);
      app.mic.resetTracker();
      calib.textContent = `Kiểm tra ${checking + 1}/${CHECK_NOTES.length}: đàn phím ${noteLabel(want)} (${want}) một lần, vừa tay.`;
      stepTimer = window.setTimeout(() => {
        checking++;
        askStep();
      }, STEP_TIMEOUT_MS);
    };

    const finishCheck = () => {
      window.clearTimeout(stepTimer);
      checking = -1;
      showKb();
      kb.clear();
      const ok = steps.filter((s) => s.result === 'ok').length;
      const none = steps.filter((s) => s.result === 'none');
      const wrong = steps.filter((s) => s.result === 'wrong');
      // TỰ CHỈNH ĐỘ NHẠY theo số đo từng nốt (micTune.ts) rồi áp dụng ngay
      const cur = store.settings.micSensitivity;
      const checks: NoteCheck[] = steps.map((s) => ({
        want: pitchToMidi(s.want),
        result: s.result,
        heard: s.heard.map((p) => pitchToMidi(p as Pitch)),
        maxRms: s.maxRms,
        floor: s.floor,
        gate: s.gate,
        bestClarity: s.bestClarity,
        candidates: s.candidates,
      }));
      const adv = chooseSensitivity(checks, cur);
      autoTune = adv;
      if (adv.changed) {
        store.updateSettings({ micSensitivity: adv.sensitivity });
        app.mic.sensitivity = adv.sensitivity;
        renderSens();
      }
      const tips: string[] = [];
      const tip = (t: string) => {
        if (!tips.includes(t)) tips.push(t);
      };
      adv.tips.forEach((t) => tip(TIP_TEXT[t]));
      if (none.some((s) => s.maxRms < s.gate * 1.2) && adv.sensitivity === 'high' && !adv.changed) tip(TIP_TEXT.closer);
      const offs = wrong.flatMap((s) =>
        s.heard.map((p) => pitchToMidi(p as Pitch) - pitchToMidi(s.want)).filter((d) => Math.abs(d) === 1),
      );
      if (offs.length >= 2) tip(TIP_TEXT.calibrate);
      if (wrong.some((s) => s.heard.some((p) => (pitchToMidi(p as Pitch) - pitchToMidi(s.want)) % 12 === 0)))
        tips.push('Có lúc nghe nhầm quãng 8 (cùng tên nốt, khác cao độ) — thường do micro quá gần búa đàn; dịch iPad ra xa thêm ~20 cm.');
      if (ok === steps.length) tip('Micro nghe tốt với đàn nhà. ✅');
      const ms = steps.filter((s) => s.ms !== undefined).map((s) => s.ms!);
      report.replaceChildren(
        h('h3', {}, `Kết quả: nghe đúng ${ok}/${steps.length} nốt${ms.length ? ` · nhận sau ~${Math.round(ms.reduce((a, b) => a + b, 0) / ms.length / 100) / 10} giây` : ''}`),
        h(
          'ul',
          {},
          ...steps.map((s) =>
            h(
              'li',
              {},
              `${s.result === 'ok' ? '✅' : s.result === 'wrong' ? '⚠️' : '❌'} ${noteLabel(s.want)}: ` +
                (s.result === 'ok'
                  ? 'nghe đúng'
                  : s.result === 'wrong'
                    ? `nghe thành ${s.heard.map((p) => noteLabel(p as Pitch)).join(', ')}`
                    : s.maxRms < s.gate * 1.2
                      ? 'không nghe thấy (tiếng quá nhỏ)'
                      : 'nghe thấy tiếng nhưng không rõ nốt'),
            ),
          ),
        ),
        h('p', { class: 'lead' }, (adv.changed ? '🎚️ ' : '✔️ ') + adv.message),
        ...tips.map((t) => h('p', {}, '💡 ' + t)),
        h('div', { class: 'row' }, button({ icon: '🔁', label: 'Kiểm tra lại', onTap: () => void runCheck() })),
      );
      lastOk = ok;
      calib.textContent =
        ok >= MIC_GOOD
          ? 'Xong bài kiểm tra — micro nghe tốt! Bước 3: bấm nút xanh bên dưới.'
          : adv.changed
            ? 'Xong bài kiểm tra — đã đổi độ nhạy. Bấm "Kiểm tra lại" để thử với độ nhạy mới.'
            : 'Xong bài kiểm tra — micro chưa nghe rõ. Làm theo gợi ý rồi "Kiểm tra lại" (hoặc nhờ người hỗ trợ).';
      renderSteps();
    };

    /** Bước nào đang làm: 1 cho phép micro · 2 kiểm tra 5 nốt · 3 dùng micro cho buổi học */
    function stepNow(): 1 | 2 | 3 {
      if (store.settings.micEnabled || (lastOk !== null && lastOk >= MIC_GOOD)) return 3;
      return app.mic.state === 'on' ? 2 : 1;
    }

    function renderSteps(): void {
      const now = stepNow();
      const enabled = store.settings.micEnabled;
      const labels = ['Cho phép micro', 'Kiểm tra 5 nốt', 'Dùng micro cho buổi học'];
      wizard.replaceChildren(
        ...labels.map((t, i) => {
          const k = i + 1;
          const done = k < now || (k === 3 && enabled);
          return h('li', { class: done ? 'done' : k === now ? 'now' : '' }, h('b', {}, done ? '✓' : String(k)), t);
        }),
      );
      if (enabled) {
        useBox.replaceChildren(
          h('p', { class: 'lead' }, '✅ Micro đang được dùng cho các buổi học — app tự nghe và chấm nốt.'),
          button({
            icon: '🔇',
            label: 'Tắt micro (bố mẹ tự bấm “Đúng rồi”)',
            onTap: () => {
              store.updateSettings({ micEnabled: false });
              toast('Đã tắt micro cho buổi học');
              renderSteps();
            },
          }),
        );
      } else if (lastOk !== null) {
        const good = lastOk >= MIC_GOOD;
        useBox.replaceChildren(
          good || lastOk >= 3
            ? button({
                icon: good ? '✅' : '🎤',
                label: good ? 'Dùng micro cho các buổi học' : 'Vẫn dùng micro (chưa thật tốt)',
                kind: good ? 'good' : 'plain',
                big: good,
                onTap: () => {
                  store.updateSettings({ micEnabled: true });
                  toast('🎤 Đã bật micro cho các buổi học', 2600);
                  renderSteps();
                },
              })
            : h('p', { class: 'muted' }, 'Micro mới nghe đúng ' + lastOk + '/5 nốt — chưa nên dùng. Bố mẹ vẫn chấm bằng nút “Đúng rồi” như thường.'),
        );
      } else useBox.replaceChildren();
    }

    /** Bàn phím chỉ hiện khi cần (đang kiểm tra 5 nốt / chỉnh theo đàn nhà) — không che chữ của màn. */
    function showKb(): void {
      kbWrap.hidden = !(checking >= 0 || calibrating);
    }

    const unState = app.mic.onState((s) => {
      status.textContent = STATE_TEXT[s];
      renderSteps();
    });
    const unFrame = app.mic.onFrame((f) => {
      lastFrame = f;
      levelBar.style.width = `${meterPct(f)}%`;
      levelBar.classList.toggle('over', f.rms >= f.gate);
      const now = performance.now();
      if (now - lastMeterText > 400) {
        lastMeterText = now;
        meterText.textContent =
          f.app !== 'quiet'
            ? 'App đang phát tiếng — micro tạm không nghe'
            : f.rms >= f.gate
              ? `Nghe thấy tiếng đàn${f.pitch ? ` · độ rõ ${Math.round(f.pitch.clarity * 100)}%` : ''}`
              : 'Yên lặng (tiếng đàn phải vượt vạch giữa thanh)';
      }
      const st = checking >= 0 ? steps[steps.length - 1] : undefined;
      if (st && st.result !== 'ok') {
        st.frames++;
        st.maxRms = Math.max(st.maxRms, f.rms);
        st.gate = f.gate;
        st.floor = f.floor;
        if (f.pitch) {
          st.pitchedFrames++;
          st.bestClarity = Math.max(st.bestClarity, f.pitch.clarity);
          if (f.rms >= f.gate) {
            tally.add(f.pitch.freq, f.pitch.clarity, store.settings.micTuningCents);
            st.candidates = tally.top(3);
          }
        }
      }
    });
    const unNote = app.mic.onNote((n) => {
      if (measuring) return;
      const p = midiToPitch(n.midi);
      big.textContent = noteLabel(p);
      const cents = Math.round(n.cents);
      detail.textContent = `${p} · ${n.freq.toFixed(1)} Hz · lệch ${cents > 0 ? '+' : ''}${cents} cent`;
      kb.setResult(p, 'good');
      const ctxNow = app.audio.context?.currentTime;
      const latencyMs = n.at !== undefined && ctxNow !== undefined ? Math.round((ctxNow - n.at) * 1000) : null;
      if (checking >= 0) {
        const st = steps[steps.length - 1];
        st.heard.push(p);
        if (latencyMs !== null) st.latencyMs.push(latencyMs);
        if (pitchToMidi(p) === pitchToMidi(st.want)) {
          st.result = 'ok';
          st.ms = Math.round(performance.now() - stepStart);
          window.clearTimeout(stepTimer);
          // chờ nốt ngân bớt rồi hỏi nốt sau
          stepTimer = window.setTimeout(() => {
            checking++;
            askStep();
          }, 1200);
        } else st.result = 'wrong';
        return;
      }
      if (calibrating) {
        // Độ lệch "thô" so với C4 chuẩn — so trực tiếp tần số, vì đàn lệch > nửa cung
        // sẽ bị nhận thành Si/Đô thăng nếu chỉ nhìn tên nốt.
        const raw = 1200 * Math.log2(n.freq / pitchFreq('C4'));
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
        calibrating = false;
        showKb();
        calib.textContent =
          Math.abs(clamped) >= 40
            ? `Đã chỉnh: đàn nhà lệch ${clamped} cent (100 cent = nửa cung). Lệch khá nhiều — nên gọi thợ lên dây khi có dịp.`
            : `Đã chỉnh xong: đàn nhà lệch ${clamped} cent (100 cent = nửa cung). ✅`;
        showTuning();
        return;
      }
      // Đàn tự do: ghi lại để bố mẹ chấm đúng/sai
      freeLog.push({ note: p, cents, latencyMs });
      if (freeLog.length > FREE_LOG_MAX) freeLog.shift();
      showFree();
    });

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

    async function runCheck(): Promise<void> {
      if (measuring || !(await startMic())) return;
      calibrating = false;
      steps = [];
      autoTune = null;
      report.replaceChildren();
      checking = 0;
      showKb();
      askStep();
    }

    /** iOS ép bật bộ lọc giọng nói (dù app xin tắt) → báo phụ huynh (và ghi vào nhật ký). */
    const showProcessing = () => {
      const info = app.mic.trackInfo();
      if (!info?.forced.length) return;
      meterText.textContent = `⚠️ iPad đang tự bật: ${info.forced.map((k) => PROCESSING_NAME[k] ?? k).join(', ')} — tiếng đàn ngân có thể bị nhỏ dần.`;
      lastMeterText = performance.now() + 4000;
    };

    const startMic = async () => {
      app.mic.tuningCents = store.settings.micTuningCents;
      app.mic.sensitivity = store.settings.micSensitivity;
      app.mic.latencyMs = store.settings.micLatencyMs;
      if (app.mic.state !== 'on') {
        await app.mic.start();
        showProcessing();
      }
      return app.mic.state === 'on';
    };

    const copyLog = async () => {
      const ctx = app.audio.context as (AudioContext & { baseLatency?: number }) | null;
      const judged = freeLog.filter((x) => x.verdict);
      const lat = freeLog.map((x) => x.latencyMs).filter((x): x is number => x !== null);
      const log = {
        app: 'piano-be-9 mic log v2',
        at: new Date().toISOString(),
        ua: navigator.userAgent,
        sampleRate: ctx?.sampleRate ?? null,
        baseLatency: ctx?.baseLatency ?? null,
        ctxState: ctx?.state ?? null,
        audioSession: (navigator as unknown as { audioSession?: { type?: string } }).audioSession?.type ?? null,
        tuningCents: store.settings.micTuningCents,
        sensitivity: store.settings.micSensitivity,
        latencyMs: store.settings.micLatencyMs,
        outputLatency: app.audio.outputLatency,
        micState: app.mic.state,
        // Bộ lọc iOS THẬT SỰ áp dụng (getSettings) — forced = bị ép bật dù app xin tắt
        track: app.mic.trackInfo(),
        stats: app.mic.stats,
        warmingUp: app.mic.warmingUp,
        lastFrame: lastFrame && {
          rms: +lastFrame.rms.toFixed(5),
          floor: +lastFrame.floor.toFixed(5),
          gate: +lastFrame.gate.toFixed(5),
          app: lastFrame.app,
        },
        autoTune: autoTune && {
          sensitivity: autoTune.sensitivity,
          changed: autoTune.changed,
          reason: autoTune.reason,
          tips: autoTune.tips,
          margin: {
            low: +autoTune.margin.low.toFixed(2),
            normal: +autoTune.margin.normal.toFixed(2),
            high: +autoTune.margin.high.toFixed(2),
          },
        },
        steps: steps.map((s) => ({
          ...s,
          maxRms: +s.maxRms.toFixed(5),
          gate: +s.gate.toFixed(5),
          floor: +s.floor.toFixed(5),
          bestClarity: +s.bestClarity.toFixed(2),
          candidates: s.candidates.map((c) => ({ ...c, note: midiToPitch(c.midi) })),
        })),
        free: {
          heard: freeLog.length,
          judged: judged.length,
          correct: judged.filter((x) => x.verdict === 'ok').length,
          medianLatencyMs: lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)] : null,
          notes: freeLog,
        },
      };
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
      if (measuring || !(await startMic())) return;
      checking = -1;
      window.clearTimeout(stepTimer);
      calibrating = true;
      samples = [];
      app.mic.tuningCents = 0;
      showKb();
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
            calibrating = false;
            showKb();
            calib.textContent = '';
            showTuning();
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
    );

    root.append(
      h(
        'div',
        { class: 'screen mictest' },
        h(
          'div',
          { class: 'stage scrollable' },
          h('h1', { class: 'title' }, '🎤 Cài micro (3 bước)'),
          wizard,
          status,
          big,
          detail,
          h('div', { class: 'mic-level wide with-gate' }, levelBar),
          meterText,
          calib,
          report,
          useBox,
          h(
            'p',
            { class: 'muted small' },
            'Mẹo: đặt iPad trên giá nhạc, micro hướng về đàn; tắt TV/quạt; bé đàn rõ từng nốt. Micro chỉ phân tích ngay trên iPad, không gửi đi đâu; màn này không ghi âm.',
          ),
          helper,
        ),
        kbWrap,
        actionBar(
          backButton(() => app.show(parentScreen(app))),
          button({
            icon: '🎤',
            label: '1. Cho phép micro',
            kind: app.mic.state === 'on' ? 'plain' : 'primary',
            onTap: () => void startMic().then(renderSteps),
          }),
          button({
            icon: '🩺',
            label: '2. Kiểm tra 5 nốt',
            kind: 'good',
            onTap: () => void runCheck(),
          }),
        ),
      ),
    );
    status.textContent = MicListener.supported ? STATE_TEXT[app.mic.state] : STATE_TEXT.unsupported;
    showTuning();
    showLatency();
    renderSens();
    showFree();
    renderSteps();
    showKb();

    return () => {
      disposed = true;
      window.clearTimeout(stepTimer);
      unState();
      unFrame();
      unNote();
      kb.destroy();
      app.mic.stop();
    };
  };
}
