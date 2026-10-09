/**
 * Màn "🎤 Cài micro" — bước 2: KIỂM TRA 5 NỐT (thế tay Đô). Đo từng nốt (âm lượng, độ rõ, nốt ứng viên), tự chỉnh độ
 * nhạy (micTune.ts) rồi kết luận + lời khuyên cụ thể. Trạng thái dùng chung: micTestShared.ts.
 */
import type { MicFrame } from '../../audio/MicListener';
import { CandidateTally, chooseSensitivity, type NoteCheck } from '../../audio/micTune';
import { noteLabel, pitchToMidi, type Pitch } from '../../piano/pitchTable';
import { button, h } from '../components/dom';
import { loadMicLog, saveMicLog } from '../../audio/micLogStore';
import { CHECK_NOTES, MIC_GOOD, STEP_TIMEOUT_MS, TIP_TEXT, buildMicLog, type MicTestCtx, type StepLog } from './micTestShared';

export interface FiveNoteCheck {
  /** Bắt đầu (lại) bài kiểm tra 5 nốt */
  runCheck(): Promise<void>;
  /** Mỗi khung micro: ghi số đo cho nốt đang hỏi */
  onFrame(f: MicFrame): void;
  /** Micro nghe được nốt `p` khi đang kiểm tra (c.s.checking ≥ 0) */
  onNote(p: Pitch, latencyMs: number | null): void;
  readonly steps: StepLog[];
  readonly autoTune: ReturnType<typeof chooseSensitivity> | null;
  /** Kết quả lần kiểm tra 5 nốt gần nhất (số nốt nghe đúng); null = chưa kiểm tra */
  readonly lastOk: number | null;
  /** Đã từng làm "Kiểm tra 5 nốt" chưa (kể cả lần mở màn trước) */
  readonly everChecked: boolean;
}

export function createFiveNoteCheck(c: MicTestCtx): FiveNoteCheck {
  const { app, store, s, kb, calib, report } = c;
  /** Kết quả lần kiểm tra 5 nốt gần nhất (số nốt nghe đúng); null = chưa kiểm tra */
  let lastOk: number | null = null;
  /**
   * Đã từng làm "Kiểm tra 5 nốt" chưa (kể cả lần mở màn trước). OWNER 2026-10-08: bật micro mà CHƯA kiểm tra →
   * độ nhạy mặc định, app chưa biết tiếng đàn nhà tới micro to/nhỏ thế nào → nhắc thật rõ.
   */
  let everChecked = (() => {
    const prev = loadMicLog();
    return !!prev && Array.isArray(prev.steps) && prev.steps.length > 0;
  })();
  let stepStart = 0;
  let steps: StepLog[] = [];
  let tally = new CandidateTally();
  let autoTune: ReturnType<typeof chooseSensitivity> | null = null;

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
    window.clearTimeout(s.stepTimer);
    if (s.checking >= CHECK_NOTES.length) return finishCheck();
    const want = CHECK_NOTES[s.checking];
    steps.push(newStep(want));
    tally = new CandidateTally();
    stepStart = performance.now();
    kb.clear();
    kb.setTargets([{ pitch: want, hand: 'RH', finger: s.checking + 1 }]);
    app.mic.resetTracker();
    calib.textContent = `Kiểm tra ${s.checking + 1}/${CHECK_NOTES.length}: đàn phím ${noteLabel(want)} (${want}) một lần, NHẸ TAY như lúc con tập bình thường (đừng đàn thật to).`;
    s.stepTimer = window.setTimeout(() => {
      s.checking++;
      askStep();
    }, STEP_TIMEOUT_MS);
  };

  const finishCheck = () => {
    window.clearTimeout(s.stepTimer);
    s.checking = -1;
    c.showKb();
    kb.clear();
    const ok = steps.filter((x) => x.result === 'ok').length;
    const none = steps.filter((x) => x.result === 'none');
    const wrong = steps.filter((x) => x.result === 'wrong');
    // TỰ CHỈNH ĐỘ NHẠY theo số đo từng nốt (micTune.ts) rồi áp dụng ngay
    const cur = store.settings.micSensitivity;
    const checks: NoteCheck[] = steps.map((x) => ({
      want: pitchToMidi(x.want),
      result: x.result,
      heard: x.heard.map((p) => pitchToMidi(p as Pitch)),
      maxRms: x.maxRms,
      floor: x.floor,
      gate: x.gate,
      bestClarity: x.bestClarity,
      candidates: x.candidates,
    }));
    const adv = chooseSensitivity(checks, cur);
    autoTune = adv;
    if (adv.changed) {
      store.updateSettings({ micSensitivity: adv.sensitivity });
      app.mic.sensitivity = adv.sensitivity;
      c.renderSens();
    }
    const tips: string[] = [];
    const tip = (t: string) => {
      if (!tips.includes(t)) tips.push(t);
    };
    adv.tips.forEach((t) => tip(TIP_TEXT[t]));
    if (none.some((x) => x.maxRms < x.gate * 1.2) && adv.sensitivity === 'high' && !adv.changed) tip(TIP_TEXT.closer);
    const offs = wrong.flatMap((x) =>
      x.heard.map((p) => pitchToMidi(p as Pitch) - pitchToMidi(x.want)).filter((d) => Math.abs(d) === 1),
    );
    if (offs.length >= 2) tip(TIP_TEXT.calibrate);
    if (wrong.some((x) => x.heard.some((p) => (pitchToMidi(p as Pitch) - pitchToMidi(x.want)) % 12 === 0)))
      tips.push('Có lúc nghe nhầm quãng 8 (cùng tên nốt, khác cao độ) — thường do micro quá gần búa đàn; dịch iPad ra xa thêm ~20 cm.');
    if (ok === steps.length) tip('Micro nghe tốt với đàn nhà. ✅');
    const ms = steps.filter((x) => x.ms !== undefined).map((x) => x.ms!);
    report.replaceChildren(
      h('h3', {}, `Kết quả: nghe đúng ${ok}/${steps.length} nốt${ms.length ? ` · nhận sau ~${Math.round(ms.reduce((a, b) => a + b, 0) / ms.length / 100) / 10} giây` : ''}`),
      h(
        'ul',
        {},
        ...steps.map((x) =>
          h(
            'li',
            {},
            `${x.result === 'ok' ? '✅' : x.result === 'wrong' ? '⚠️' : '❌'} ${noteLabel(x.want)}: ` +
              (x.result === 'ok'
                ? 'nghe đúng'
                : x.result === 'wrong'
                  ? `nghe thành ${x.heard.map((p) => noteLabel(p as Pitch)).join(', ')}`
                  : x.maxRms < x.gate * 1.2
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
    everChecked = true;
    saveMicLog(buildMicLog(app, c.logState())); // cho "🩺 Kiểm tra iPad"
    calib.textContent =
      ok >= MIC_GOOD
        ? 'Xong bài kiểm tra — micro nghe tốt! Bước 3: bấm nút xanh bên dưới.'
        : adv.changed
          ? 'Xong bài kiểm tra — đã đổi độ nhạy. Bấm "Kiểm tra lại" để thử với độ nhạy mới.'
          : 'Xong bài kiểm tra — micro chưa nghe rõ. Làm theo gợi ý rồi "Kiểm tra lại" (hoặc nhờ người hỗ trợ).';
    c.renderSteps();
  };

  async function runCheck(): Promise<void> {
    c.stopAuto();
    if (s.measuring || !(await c.startMic())) return;
    s.calibrating = false;
    steps = [];
    autoTune = null;
    report.replaceChildren();
    s.checking = 0;
    c.showKb();
    c.renderSteps();
    askStep();
  }

  const onFrame = (f: MicFrame) => {
    const st = s.checking >= 0 ? steps[steps.length - 1] : undefined;
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
  };

  const onNote = (p: Pitch, latencyMs: number | null) => {
    const st = steps[steps.length - 1];
    st.heard.push(p);
    if (latencyMs !== null) st.latencyMs.push(latencyMs);
    if (pitchToMidi(p) === pitchToMidi(st.want)) {
      st.result = 'ok';
      st.ms = Math.round(performance.now() - stepStart);
      window.clearTimeout(s.stepTimer);
      // chờ nốt ngân bớt rồi hỏi nốt sau
      s.stepTimer = window.setTimeout(() => {
        s.checking++;
        askStep();
      }, 1200);
    } else st.result = 'wrong';
  };

  return {
    runCheck,
    onFrame,
    onNote,
    get steps() {
      return steps;
    },
    get autoTune() {
      return autoTune;
    },
    get lastOk() {
      return lastOk;
    },
    get everChecked() {
      return everChecked;
    },
  };
}
