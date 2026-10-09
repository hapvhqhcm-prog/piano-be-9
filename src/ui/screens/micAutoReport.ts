/**
 * Màn "🎤 Cài micro" — 🎙️ ĐO MICRO & TẠO BÁO CÁO (OWNER 2026-10-09): app tự nghe ~1 phút, tự soạn báo cáo → bố mẹ chỉ
 * việc sao chép. Logic thuần: src/audio/micReport.ts. Không đổi cài đặt nào trừ khi bố mẹ bấm "Dùng độ nhạy đề xuất".
 * Trạng thái dùng chung: micTestShared.ts.
 */
import type { MicFrame, MicState } from '../../audio/MicListener';
import { button, h, toast } from '../components/dom';
import { loadAutoSens, loadMicReport, saveMicReport } from '../../audio/micLogStore';
import { CHORD_MIDIS, formatMicReport, MicReportSession, type MicReport, type ReportEnv } from '../../audio/micReport';
import { deviceText, parseDevice } from '../../pwa/diagnostics';
import { APP_VERSION } from '../../pwa/updater';
import { readErrors } from '../../pwa/errorLog';
import { isStandalone } from '../../progress/backup';
import { SENS_NAME } from '../../audio/micTune';
import { STATE_TEXT, type MicTestCtx } from './micTestShared';

export interface AutoReport {
  /** Thẻ "🎙️ Đo micro & tạo báo cáo" */
  readonly card: HTMLElement;
  /** Dừng bài đo đang chạy (bỏ dở, không soạn báo cáo) */
  stop(): void;
  /** Vẽ lại thẻ */
  render(): void;
  /** Micro đổi trạng thái: bị ngắt giữa bài đo → dừng, vẫn soạn báo cáo phần đã đo */
  onState(st: MicState): void;
  /** Mỗi khung micro (khi đang đo) */
  onFrame(f: MicFrame): void;
  /** Micro nghe được nốt: đang đo → ghi vào bài đo và trả về true (màn không xử lý nốt này nữa) */
  onNote(n: { midi: number; cents: number }, latencyMs: number | null): boolean;
  /** Rời màn */
  dispose(): void;
}

export function createAutoReport(c: MicTestCtx): AutoReport {
  const { app, store, s } = c;
  let autoSes: MicReportSession | null = null;
  /** DEV: bài đo giả (chụp màn hình) — không cần micro */
  let autoDemo = false;
  let autoTimer: number | undefined;
  let autoSeq = 0;
  /** Lần bấm "Bắt đầu đo" gần nhất — chạm 2 lần khi đang chờ micro thì chỉ lần SAU CÙNG chạy tiếp (không 2 vòng đo) */
  let autoStart = 0;
  let chordAsked = false;
  let autoReport: MicReport | null = null;
  let autoMsg = '';
  const autoCard = h('section', { class: 'card mic-auto', 'aria-live': 'polite' });

  const stopAuto = () => {
    window.clearInterval(autoTimer);
    autoTimer = undefined;
    if (autoSes && !autoSes.done) {
      autoSes.abort(performance.now());
      autoSes = null;
      autoReport = null;
      renderAuto();
    }
  };

  const lessonMicStats = (): ReportEnv['lessons'] => {
    try {
      const recent = store.get().sessions.slice(-10).filter((x) => x.micAssessments?.length);
      const all = recent.flatMap((x) => x.micAssessments);
      return {
        sessions: recent.length,
        judged: all.length,
        firstTry: all.filter((a) => a.firstTry).length,
        wrongNotes: all.reduce((n, a) => n + (a.wrongCount || 0), 0),
        overrides: all.filter((a) => a.parentOverride).length,
      };
    } catch {
      return null;
    }
  };

  const reportEnv = (): ReportEnv => {
    const ctx = app.audio.context as (AudioContext & { baseLatency?: number; outputLatency?: number }) | null;
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
    const errs = (() => {
      try {
        return readErrors();
      } catch {
        return [];
      }
    })();
    return {
      version: APP_VERSION,
      at: Date.now(),
      device: deviceText(parseDevice(navigator.userAgent, navigator.maxTouchPoints || 0)),
      standalone: isStandalone(),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      ctx: ctx ? { state: String(ctx.state), sampleRate: ctx.sampleRate, baseLatency: num(ctx.baseLatency), outputLatency: num(ctx.outputLatency) } : null,
      track: app.mic.trackInfo(),
      tuningCents: store.settings.micTuningCents,
      autoTune: app.mic.autoTune.stats(),
      latencyMs: store.settings.micLatencyMs,
      micEnabled: store.settings.micEnabled,
      autoSens: loadAutoSens(),
      stats: app.mic.state === 'on' || autoDemo ? app.mic.stats : null,
      lessons: lessonMicStats(),
      errors: errs.length,
      lastErrorAt: errs[errs.length - 1]?.t,
    };
  };

  const finishAuto = () => {
    window.clearInterval(autoTimer);
    autoTimer = undefined;
    if (!autoSes) return;
    autoReport = formatMicReport(autoSes, reportEnv());
    // Lưu báo cáo cho "🩺 Kiểm tra iPad" (không phải tiến độ học)
    if (!autoDemo) saveMicReport({ at: new Date().toISOString(), summary: autoReport.summary, text: autoReport.text });
    autoMsg = '';
    renderAuto();
  };

  const autoLoop = () => {
    const ses = autoSes;
    if (!ses || s.disposed) return;
    if (ses.tick(performance.now())) app.mic.resetTracker(); // sang nốt mới: nốt cũ còn ngân không tính
    if (ses.done) return finishAuto();
    renderAuto();
  };

  const startAuto = async () => {
    if (s.measuring) return;
    stopAuto();
    const my = ++autoStart;
    s.checking = -1;
    window.clearTimeout(s.stepTimer);
    s.calibrating = false;
    c.showKb();
    autoDemo = false;
    autoReport = null;
    autoMsg = '⏳ Đang bật micro… (iPad có thể hỏi quyền — chọn Cho phép)';
    renderAuto();
    if (!(await c.startMic())) {
      autoMsg = '⚠️ ' + STATE_TEXT[app.mic.state === 'starting' ? 'error' : app.mic.state];
      renderAuto();
      return;
    }
    if (s.disposed || my !== autoStart) return;
    autoMsg = '';
    app.mic.resetTracker();
    chordAsked = false;
    autoSes = new MicReportSession(store.settings.micSensitivity, store.settings.micTuningCents);
    autoSes.start(performance.now());
    autoSeq = autoSes.seq;
    window.clearInterval(autoTimer); // không bao giờ để vòng cũ chạy mãi
    autoTimer = window.setInterval(autoLoop, 200);
    renderAuto();
  };

  const autoText = (): HTMLTextAreaElement | null => autoCard.querySelector('textarea.mic-auto-text');
  const copyReport = async () => {
    const text = autoReport?.text;
    if (!text) return;
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      autoMsg = '✅ Đã sao chép — dán vào tin nhắn gửi người hỗ trợ.';
    } catch {
      autoMsg = 'Không tự sao chép được — chạm vào ô chữ bên dưới, chọn hết rồi Sao chép.';
      const ta = autoText();
      try {
        ta?.focus();
        ta?.select();
      } catch {
        /* bỏ qua */
      }
    }
    renderAutoMsg();
  };
  const nav = navigator as Navigator & { share?: (d: { text?: string; title?: string }) => Promise<void> };
  const shareReport = async () => {
    if (!autoReport || typeof nav.share !== 'function') return;
    try {
      await nav.share({ title: 'Piano bé — báo cáo micro', text: autoReport.text });
    } catch {
      /* đóng bảng chia sẻ — bỏ qua */
    }
  };

  const msgEl = h('p', { class: 'mic-auto-msg lead' });
  const renderAutoMsg = () => {
    msgEl.textContent = autoMsg;
    msgEl.hidden = !autoMsg;
  };

  /** Phần "đang đo": cập nhật tại chỗ (không vẽ lại cả thẻ 5 lần/giây). */
  const run = {
    step: h('p', { class: 'mic-auto-step muted' }),
    say: h('p', { class: 'mic-auto-say' }),
    hint: h('p', { class: 'muted' }),
    bar: h('span', { class: 'mic-auto-bar' }),
    count: h('p', { class: 'mic-auto-count' }),
    status: h('p', { class: 'lead' }),
  };
  let runBuilt = false;

  function renderAuto(): void {
    renderAutoMsg();
    const ses = autoSes;
    if (ses && !ses.done) {
      const v = ses.view(performance.now());
      if (!v) return;
      if (!runBuilt) {
        runBuilt = true;
        autoCard.replaceChildren(
          h('h2', {}, '🎙️ Đang đo micro…'),
          run.step,
          run.say,
          run.hint,
          h('div', { class: 'mic-auto-track' }, run.bar),
          run.count,
          run.status,
          msgEl,
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'linklike', type: 'button', onclick: () => (autoSes?.skip(performance.now()), app.mic.resetTracker(), autoLoop()) }, 'Bỏ qua bước này ›'),
            h('button', { class: 'linklike', type: 'button', onclick: () => stopAuto() }, 'Dừng'),
          ),
        );
      }
      if (ses.seq !== autoSeq) autoSeq = ses.seq;
      run.step.textContent = `Bước ${v.index + 1}/${v.total}`;
      run.say.textContent = v.prompt.say;
      run.hint.textContent = v.prompt.hint;
      run.bar.style.width = `${Math.round(v.frac * 100)}%`;
      run.count.textContent = `${Math.ceil(v.remainingMs / 1000)} s`;
      run.status.textContent = v.status;
      return;
    }
    runBuilt = false;
    if (autoReport) {
      const rep = autoReport;
      const an = rep.analysis;
      const cur = store.settings.micSensitivity;
      const ta = h('textarea', { class: 'mic-auto-text', readonly: '', rows: '12', spellcheck: 'false' }) as HTMLTextAreaElement;
      ta.value = rep.text;
      autoCard.replaceChildren(
        h('h2', {}, autoSes?.aborted ? '🎙️ Báo cáo micro (bài đo bị dừng giữa chừng)' : '🎙️ Báo cáo micro đã xong'),
        ...rep.summary.map((x) => h('p', { class: 'mic-auto-sum' }, x)),
        h('p', { class: 'muted' }, 'Bấm nút xanh rồi dán vào tin nhắn gửi người hỗ trợ.'),
        button({ icon: '📋', label: 'Sao chép báo cáo', kind: 'good', big: true, onTap: () => void copyReport() }),
        msgEl,
        h(
          'div',
          { class: 'row' },
          an.recommend !== cur
            ? button({
                icon: '🎚️',
                label: `Dùng độ nhạy đề xuất: ${SENS_NAME[an.recommend]}`,
                kind: 'primary',
                onTap: () => {
                  store.updateSettings({ micSensitivity: an.recommend });
                  app.mic.sensitivity = an.recommend;
                  c.renderSens();
                  toast(`🎚️ Đã đổi độ nhạy: ${SENS_NAME[an.recommend]}`, 2400);
                  renderAuto();
                },
              })
            : null,
          typeof nav.share === 'function' ? button({ icon: '📤', label: 'Chia sẻ', onTap: () => void shareReport() }) : null,
          button({ icon: '🔁', label: 'Đo lại', onTap: () => void startAuto() }),
        ),
        ta,
      );
      renderAutoMsg();
      return;
    }
    const prev = loadMicReport();
    const t = prev ? Date.parse(prev.at) : NaN;
    autoCard.replaceChildren(
      h('h2', {}, '🎙️ Đo micro & tạo báo cáo (≈1 phút)'),
      h(
        'p',
        { class: 'lead' },
        'Bé ngồi ở đàn, iPad đặt chỗ thường dùng. Bấm Bắt đầu rồi làm theo chữ to trên màn — app tự nghe, tự chuyển bước, ' +
          'cuối cùng soạn sẵn báo cáo để bố mẹ sao chép gửi người hỗ trợ.',
      ),
      button({ icon: '▶️', label: 'Bắt đầu đo', kind: 'good', big: true, onTap: () => void startAuto() }),
      msgEl,
      prev
        ? h(
            'p',
            { class: 'muted small' },
            `Báo cáo gần nhất: ${isNaN(t) ? '' : new Date(t).toLocaleString('vi-VN')} — `,
            h(
              'button',
              {
                class: 'linklike',
                type: 'button',
                onclick: async () => {
                  try {
                    await navigator.clipboard.writeText(prev.text);
                    autoMsg = '✅ Đã sao chép báo cáo gần nhất.';
                  } catch {
                    autoMsg = 'Không tự sao chép được — bấm “Bắt đầu đo” để tạo báo cáo mới.';
                  }
                  renderAutoMsg();
                },
              },
              'sao chép lại',
            ),
          )
        : '',
    );
    renderAutoMsg();
  }

  if (import.meta.env.DEV) {
    // Hook chụp màn hình: hiện một bài đo giả (đang đo / đã xong) không cần micro
    (window as unknown as Record<string, unknown>).__micAuto = {
      show(ses: MicReportSession) {
        window.clearInterval(autoTimer);
        autoDemo = true;
        autoSes = ses;
        autoReport = null;
        if (ses.done) finishAuto();
        else renderAuto();
      },
    };
  }

  return {
    card: autoCard,
    stop: stopAuto,
    render: renderAuto,
    onState: (st) => {
      // Micro bị ngắt giữa bài đo tự động (cuộc gọi, khóa màn hình…) → dừng, vẫn soạn báo cáo phần đã đo
      if (st !== 'on' && st !== 'starting' && autoSes && !autoSes.done && !autoDemo) {
        autoSes.abort(performance.now());
        finishAuto();
      }
    },
    onFrame: (f) => {
      if (autoSes && !autoSes.done) {
        autoSes.frame(f, performance.now());
        // Hợp âm: có lần gõ → hỏi bộ kiểm tra hợp âm (NNLS) một lần, chỉ để ghi vào báo cáo
        if (autoSes.chordOnset && !chordAsked) {
          chordAsked = true;
          const ses = autoSes;
          void app.mic.verifyChord(CHORD_MIDIS).then((r) => ses.chordResult(r));
        }
      }
    },
    onNote: (n, latencyMs) => {
      if (autoSes && !autoSes.done) {
        autoSes.note({ midi: n.midi, cents: n.cents, latencyMs }, performance.now());
        renderAuto();
        return true;
      }
      return false;
    },
    dispose: () => {
      if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__micAuto;
    },
  };
}
