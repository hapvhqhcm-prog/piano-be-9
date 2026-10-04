import { MicListener, meterPct, type MicFrame, type MicState } from '../../audio/MicListener';
import type { Sensitivity } from '../../audio/micAnalyzer';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToPitch, noteLabel, pitchFreq, pitchToMidi, type Pitch } from '../../piano/pitchTable';
import type { App } from '../App';
import { actionBar, backButton, button, h } from '../components/dom';
import { parentScreen } from './parent';

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
}

/**
 * Màn phụ huynh "Thử micro" = TRÌNH CHẨN ĐOÁN:
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
    const calib = h('p', { class: 'lead' });
    const report = h('div', { class: 'mic-report' });
    const kb = new PianoKeyboard({ labels: 'all', fingerOnPress: false });
    kb.setEnabled(false);

    let calibrating = false;
    let samples: number[] = [];
    // Kiểm tra 5 nốt
    let checking = -1;
    let stepStart = 0;
    let stepTimer: number | undefined;
    let steps: StepLog[] = [];
    let lastFrame: MicFrame | null = null;
    let lastMeterText = 0;

    const showTuning = () => {
      const c = store.settings.micTuningCents;
      tuning.textContent = `Đang bù cho đàn nhà: ${c > 0 ? '+' : ''}${c} cents`;
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
    });

    const askStep = () => {
      window.clearTimeout(stepTimer);
      if (checking >= CHECK_NOTES.length) return finishCheck();
      const want = CHECK_NOTES[checking];
      steps.push(newStep(want));
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
      kb.clear();
      const ok = steps.filter((s) => s.result === 'ok').length;
      const none = steps.filter((s) => s.result === 'none');
      const wrong = steps.filter((s) => s.result === 'wrong');
      const tips: string[] = [];
      if (none.length) {
        const quiet = none.filter((s) => s.maxRms < s.gate * 1.2);
        if (quiet.length) {
          tips.push(
            'Tiếng đàn tới micro còn NHỎ hơn vạch ngưỡng → chọn độ nhạy "Cao", đặt iPad trên giá nhạc (gần dây đàn), mở nắp trên của đàn nếu được.',
          );
        } else {
          tips.push(
            'Micro nghe thấy tiếng nhưng chưa rõ cao độ → bớt tiếng ồn (TV, quạt, điều hòa), đàn từng nốt rõ ràng, nhả phím trước khi đàn nốt sau.',
          );
        }
      }
      const offs = wrong.flatMap((s) =>
        s.heard.map((p) => pitchToMidi(p as Pitch) - pitchToMidi(s.want)).filter((d) => Math.abs(d) === 1),
      );
      if (offs.length >= 2) tips.push('Micro nghe lệch nửa cung → bấm "Chỉnh theo đàn nhà" (đàn lâu không lên dây).');
      if (wrong.some((s) => s.heard.some((p) => (pitchToMidi(p as Pitch) - pitchToMidi(s.want)) % 12 === 0)))
        tips.push('Có lúc nghe nhầm quãng 8 (cùng tên nốt, khác cao độ) — thường do micro quá gần búa đàn; dịch iPad ra xa thêm ~20 cm.');
      if (ok === steps.length) tips.push('Micro nghe tốt với đàn nhà. Có thể bật "Micro nghe đàn" trong Cài đặt. ✅');
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
        ...tips.map((t) => h('p', {}, '💡 ' + t)),
      );
      calib.textContent = 'Xong bài kiểm tra. Có thể bấm "Sao chép nhật ký" để gửi người hỗ trợ.';
    };

    const unState = app.mic.onState((s) => (status.textContent = STATE_TEXT[s]));
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
        }
      }
    });
    const unNote = app.mic.onNote((n) => {
      const p = midiToPitch(n.midi);
      big.textContent = noteLabel(p);
      const cents = Math.round(n.cents);
      detail.textContent = `${p} · ${n.freq.toFixed(1)} Hz · lệch ${cents > 0 ? '+' : ''}${cents} cents`;
      kb.setResult(p, 'good');
      if (checking >= 0) {
        const st = steps[steps.length - 1];
        st.heard.push(p);
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
          calib.textContent = `Mình nghe thấy ${noteLabel(p)} — hãy đàn Đô giữa (C4) nhé.`;
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
        calib.textContent =
          Math.abs(clamped) >= 40
            ? `Đã chỉnh: đàn nhà lệch ${clamped} cents. Lệch khá nhiều — nên gọi thợ lên dây khi có dịp.`
            : `Đã chỉnh xong: đàn nhà lệch ${clamped} cents. ✅`;
        showTuning();
      }
    });

    const startMic = async () => {
      app.mic.tuningCents = store.settings.micTuningCents;
      app.mic.sensitivity = store.settings.micSensitivity;
      if (app.mic.state !== 'on') await app.mic.start();
      return app.mic.state === 'on';
    };

    const copyLog = async () => {
      const log = {
        app: 'piano-be-9 mic log',
        at: new Date().toISOString(),
        ua: navigator.userAgent,
        sampleRate: app.audio.context?.sampleRate ?? null,
        tuningCents: store.settings.micTuningCents,
        sensitivity: store.settings.micSensitivity,
        lastFrame: lastFrame && {
          rms: +lastFrame.rms.toFixed(5),
          floor: +lastFrame.floor.toFixed(5),
          gate: +lastFrame.gate.toFixed(5),
        },
        steps: steps.map((s) => ({
          ...s,
          maxRms: +s.maxRms.toFixed(5),
          gate: +s.gate.toFixed(5),
          floor: +s.floor.toFixed(5),
          bestClarity: +s.bestClarity.toFixed(2),
        })),
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

    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'stage scrollable' },
          h('h1', { class: 'title' }, '🎤 Thử micro với đàn nhà'),
          status,
          big,
          detail,
          h('div', { class: 'mic-level wide with-gate' }, levelBar),
          meterText,
          h('h3', {}, 'Độ nhạy micro'),
          sensBox,
          calib,
          tuning,
          report,
          h(
            'p',
            { class: 'muted small' },
            'Mẹo: đặt iPad trên giá nhạc, mic hướng về đàn; tắt TV/quạt; bé đàn rõ từng nốt. Micro chỉ phân tích ngay trên iPad, không ghi âm.',
          ),
        ),
        h('div', { class: 'keyboard-wrap short' }, kb.el),
        actionBar(
          backButton(() => app.show(parentScreen(app))),
          button({ icon: '🎤', label: 'Bật micro', kind: 'primary', onTap: () => void startMic() }),
          button({
            icon: '🩺',
            label: 'Kiểm tra 5 nốt',
            kind: 'good',
            onTap: async () => {
              if (!(await startMic())) return;
              calibrating = false;
              steps = [];
              report.replaceChildren();
              checking = 0;
              askStep();
            },
          }),
          button({
            icon: '🎯',
            label: 'Chỉnh theo đàn nhà',
            onTap: async () => {
              if (!(await startMic())) return;
              checking = -1;
              window.clearTimeout(stepTimer);
              calibrating = true;
              samples = [];
              app.mic.tuningCents = 0;
              calib.textContent = 'Đàn phím Đô giữa (C4) 3 lần, mỗi lần cách nhau 1 giây.';
            },
          }),
          button({
            icon: '↺',
            label: 'Bù = 0',
            onTap: () => {
              store.updateSettings({ micTuningCents: 0 });
              app.mic.tuningCents = 0;
              calibrating = false;
              calib.textContent = '';
              showTuning();
            },
          }),
          button({ icon: '📋', label: 'Sao chép nhật ký', onTap: () => void copyLog() }),
        ),
      ),
    );
    status.textContent = MicListener.supported ? STATE_TEXT[app.mic.state] : STATE_TEXT.unsupported;
    showTuning();
    renderSens();

    return () => {
      window.clearTimeout(stepTimer);
      unState();
      unFrame();
      unNote();
      kb.destroy();
      app.mic.stop();
    };
  };
}
