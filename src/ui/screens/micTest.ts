import { MicListener, meterPct } from '../../audio/MicListener';
import type { Sensitivity } from '../../audio/micAnalyzer';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToPitch, noteLabel } from '../../piano/pitchTable';
import type { App } from '../App';
import { actionBar, backButton, button, h, toast } from '../components/dom';
import { parentScreen } from './parent';
import { loadAutoSens, loadMicLog, saveMicLog } from '../../audio/micLogStore';
import { SENS_NAME } from '../../audio/micTune';
import { MIC_GOOD, PROCESSING_NAME, STATE_TEXT, buildMicLog, type MicTestCtx } from './micTestShared';
import { createFiveNoteCheck } from './micFiveNoteCheck';
import { createAutoReport } from './micAutoReport';
import { createSupportTools } from './micSupportTools';

import '../../styles/parentux.css';

// Giữ nguyên API cũ
export { MIC_GOOD, buildMicLog, type MicLogState } from './micTestShared';

/**
 * Màn phụ huynh "🎤 Cài micro (3 bước)" (rà soát 2026-10-06 — trước đây không có bước nào bật settings.micEnabled):
 *   1) Cho phép micro → 2) Kiểm tra 5 nốt (tự chỉnh độ nhạy) → 3) kết quả tốt: nút to "✅ Dùng micro cho các buổi học"
 *   (đặt micEnabled = true; có nút tắt lại). Công cụ kỹ thuật nằm trong "🔧 Dành cho người hỗ trợ".
 * Bên trong vẫn là TRÌNH CHẨN ĐOÁN:
 * - thanh âm lượng có vạch ngưỡng (tiếng đàn phải vượt vạch mới được nghe)
 * - chỉnh độ nhạy, chỉnh theo đàn nhà (đàn cơ lâu không lên dây lệch vài chục cents)
 * - kiểm tra 5 nốt → kết luận + lời khuyên cụ thể; sao chép nhật ký để gửi người hỗ trợ
 * Phần: micFiveNoteCheck.ts (kiểm tra 5 nốt) · micAutoReport.ts (đo micro & tạo báo cáo) · micSupportTools.ts
 * (🔧 người hỗ trợ) · micTestShared.ts (hằng số, nhật ký, trạng thái dùng chung). File này: các bước, micro, dựng màn.
 */
export function micTestScreen(app: App) {
  return (root: HTMLElement) => {
    const store = app.store;
    const status = h('p', { class: 'lead' });
    const big = h('div', { class: 'note-big' }, '—');
    const detail = h('div', { class: 'note-sub' }, ' ');
    const levelBar = h('span', { class: 'mic-level-bar' });
    const meterText = h('p', { class: 'muted small' }, ' ');
    const calib = h('p', { class: 'lead' });
    const report = h('div', { class: 'mic-report' });
    const kb = new PianoKeyboard({ labels: 'all', fingerOnPress: false });
    kb.setEnabled(false);
    const kbWrap = h('div', { class: 'keyboard-wrap short' }, kb.el);
    const wizard = h('ol', { class: 'mic-wizard', 'aria-label': 'Các bước cài micro' });
    const useBox = h('div', { class: 'mic-use' });

    const c: MicTestCtx = {
      app,
      store,
      s: { checking: -1, stepTimer: undefined, calibrating: false, measuring: false, disposed: false, lastFrame: null },
      kb,
      calib,
      report,
      showKb,
      startMic,
      renderSteps,
      renderSens: () => tools.renderSens(),
      stopAuto: () => auto.stop(),
      logState: () => ({ steps: check.steps, freeLog: tools.freeLog, lastFrame: c.s.lastFrame, autoTune: check.autoTune }),
    };
    const s = c.s;
    const check = createFiveNoteCheck(c);
    // Trong màn này phụ huynh chỉnh tay / bài 5 nốt tự chỉnh → tắt "tự tăng độ nhạy" của buổi học
    app.mic.autoSensitivity = false;
    const autoNote = h('p', { class: 'muted small' });
    const showAutoNote = () => {
      const last = loadAutoSens().slice(-1)[0];
      if (!last) return void (autoNote.hidden = true);
      const t = Date.parse(last.at);
      const day = isNaN(t) ? '' : ` (${new Date(t).toLocaleDateString('vi-VN')})`;
      autoNote.hidden = false;
      autoNote.textContent =
        `🎤 Trong buổi học, micro đã tự tăng độ nhạy ${SENS_NAME[last.from as Sensitivity] ?? last.from} → ` +
        `${SENS_NAME[last.to as Sensitivity] ?? last.to}${day} vì ${last.missed} lần bé đàn khẽ chưa nghe được. ` +
        'Nên làm lại “Kiểm tra 5 nốt” cho chắc.';
    };
    const tools = createSupportTools(c);
    const auto = createAutoReport(c);

    let lastMeterText = 0;

    /** Bước nào đang làm: 1 cho phép micro · 2 kiểm tra 5 nốt · 3 dùng micro cho buổi học */
    function stepNow(): 1 | 2 | 3 {
      const lastOk = check.lastOk;
      // (2026-10-10) Vừa thử bật mà iPad chặn / không có micro → bước 1 CHƯA xong (trước đây vẫn ✓ nếu Cài đặt đang bật micro)
      const st = app.mic.state;
      if (st === 'denied' || st === 'unsupported' || st === 'error') return 1;
      // Đã bật micro cho buổi học nhưng CHƯA từng kiểm tra 5 nốt → vẫn ở bước 2
      if ((store.settings.micEnabled && check.everChecked) || (lastOk !== null && lastOk >= MIC_GOOD)) return 3;
      if (store.settings.micEnabled) return 2;
      return app.mic.state === 'on' ? 2 : 1;
    }

    function renderSteps(): void {
      const now = stepNow();
      const enabled = store.settings.micEnabled;
      const everChecked = check.everChecked;
      const lastOk = check.lastOk;
      const labels = ['Cho phép micro', 'Kiểm tra 5 nốt', 'Dùng micro cho buổi học'];
      wizard.replaceChildren(
        ...labels.map((t, i) => {
          const k = i + 1;
          const done = k < now || (k === 3 && enabled && everChecked);
          return h('li', { class: done ? 'done' : k === now ? 'now' : '' }, h('b', {}, done ? '✓' : String(k)), t);
        }),
      );
      const notChecked =
        !everChecked && s.checking < 0
          ? [
              h(
                'div',
                { class: 'mic-warn' },
                h(
                  'p',
                  { class: 'lead' },
                  '⚠️ Chưa làm “Kiểm tra 5 nốt”: app chưa biết tiếng đàn nhà tới micro to hay nhỏ, đang dùng độ nhạy mặc định ' +
                    '→ bé đàn khẽ có thể không được nghe. Làm ngay (khoảng 1 phút) để app tự chỉnh độ nhạy:',
                ),
                button({ icon: '🩺', label: 'Kiểm tra 5 nốt ngay', kind: 'good', big: true, onTap: () => void check.runCheck() }),
              ),
            ]
          : [];
      if (enabled) {
        useBox.replaceChildren(
          ...notChecked,
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
      } else useBox.replaceChildren(...notChecked);
    }

    /** Bàn phím chỉ hiện khi cần (đang kiểm tra 5 nốt / chỉnh theo đàn nhà) — không che chữ của màn. */
    function showKb(): void {
      kbWrap.hidden = !(s.checking >= 0 || s.calibrating);
    }

    const unState = app.mic.onState((st) => {
      status.textContent = STATE_TEXT[st];
      auto.onState(st);
      renderSteps();
    });
    const unFrame = app.mic.onFrame((f) => {
      s.lastFrame = f;
      auto.onFrame(f);
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
      check.onFrame(f);
    });
    const unNote = app.mic.onNote((n) => {
      if (s.measuring) return;
      const p = midiToPitch(n.midi);
      big.textContent = noteLabel(p);
      const cents = Math.round(n.cents);
      detail.textContent = `${p} · ${n.freq.toFixed(1)} Hz · lệch ${cents > 0 ? '+' : ''}${cents} cent`;
      kb.setResult(p, 'good');
      const ctxNow = app.audio.context?.currentTime;
      const latencyMs = n.at !== undefined && ctxNow !== undefined ? Math.round((ctxNow - n.at) * 1000) : null;
      if (auto.onNote(n, latencyMs)) return;
      if (s.checking >= 0) return check.onNote(p, latencyMs);
      if (s.calibrating) return tools.onCalibNote(p, n.freq);
      // Đàn tự do: ghi lại để bố mẹ chấm đúng/sai
      tools.onFreeNote({ note: p, cents, latencyMs });
    });

    /** iOS ép bật bộ lọc giọng nói (dù app xin tắt) → báo phụ huynh (và ghi vào nhật ký). */
    const showProcessing = () => {
      const info = app.mic.trackInfo();
      if (!info?.forced.length) return;
      meterText.textContent = `⚠️ iPad đang tự bật: ${info.forced.map((k) => PROCESSING_NAME[k] ?? k).join(', ')} — tiếng đàn ngân có thể bị nhỏ dần.`;
      lastMeterText = performance.now() + 4000;
    };

    async function startMic(): Promise<boolean> {
      app.mic.tuningCents = store.settings.micTuningCents;
      app.mic.sensitivity = store.settings.micSensitivity;
      app.mic.latencyMs = store.settings.micLatencyMs;
      if (app.mic.state !== 'on') {
        await app.mic.start();
        showProcessing();
      }
      return app.mic.state === 'on';
    }

    root.append(
      h(
        'div',
        { class: 'screen mictest' },
        h(
          'div',
          { class: 'stage scrollable' },
          h('h1', { class: 'title' }, '🎤 Cài micro (3 bước)'),
          auto.card,
          wizard,
          status,
          big,
          detail,
          h('div', { class: 'mic-level wide with-gate' }, levelBar),
          meterText,
          calib,
          report,
          useBox,
          autoNote,
          h(
            'p',
            { class: 'muted small' },
            'Mẹo: đặt iPad trên giá nhạc, micro hướng về đàn; tắt TV/quạt; bé đàn rõ từng nốt. Micro chỉ phân tích ngay trên iPad, không gửi đi đâu; màn này không ghi âm.',
          ),
          tools.helper,
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
            onTap: () => void check.runCheck(),
          }),
        ),
      ),
    );
    status.textContent = MicListener.supported ? STATE_TEXT[app.mic.state] : STATE_TEXT.unsupported;
    tools.showTuning();
    tools.showLatency();
    tools.renderSens();
    tools.showFree();
    renderSteps();
    showKb();
    showAutoNote();
    auto.render();

    return () => {
      s.disposed = true;
      auto.stop();
      auto.dispose();
      app.mic.autoSensitivity = true;
      // Rời màn: lưu nhật ký mới nhất (đàn tự do chưa sao chép); không có bài 5 nốt lần này → giữ kết quả 5 nốt lần trước
      const steps = check.steps;
      if (steps.length || tools.freeLog.length) {
        const log = buildMicLog(app, c.logState());
        const prev = steps.length ? null : loadMicLog();
        if (prev && Array.isArray(prev.steps) && prev.steps.length) {
          log.steps = prev.steps;
          log.checkAt = prev.checkAt ?? prev.at;
        }
        saveMicLog(log);
      }
      window.clearTimeout(s.stepTimer);
      unState();
      unFrame();
      unNote();
      kb.destroy();
      app.mic.stop();
    };
  };
}
