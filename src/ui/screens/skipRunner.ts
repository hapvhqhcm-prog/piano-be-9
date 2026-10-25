/**
 * (+ 2026-10-25, OWNER duyệt "Bé thấy dễ quá") Chạy các BƯỚC của ⚡ Thi vượt tuần / 🧭 Kiểm tra xếp lớp (lessons/testOut.ts TestStep)
 * bằng CÁC MÀN SẴN CÓ (bài hát, trò đố, đọc nhạc, thẻ từng nốt, sân khấu) — ghi vào MỘT buổi (`sessionId`).
 * Không cần bố mẹ (OWNER 2026-10-25): sau mỗi bước micro KHÔNG chấm được (micro tắt / thẻ xem tay / sân khấu chưa có huy chương)
 * → một câu hỏi thật thà để bé TỰ XÁC NHẬN (lessons/testOut.stepVerdict 'unjudged'). Micro đã chấm (đạt hay chưa) → đi tiếp.
 * Tự xác nhận chỉ để chấm (testOut.gradeTestOut) — không ghi lượt giả; riêng sân khấu: bé đã biểu diễn → huy chương thật.
 */
import { makeSightTune } from '../../music/sightread';
import { findTune } from '../../music/exercises';
import { stepVerdict, type TestStep } from '../../lessons/testOut';
import type { App, Screen } from '../App';
import { backButton, button, h } from '../components/dom';
import { mascot } from '../components/mascot';
import { cancelSpeech, speak } from '../../audio/voice';
import { lazy, lazyScreen } from '../lazy';
import { quizScreen } from './ear';
import { practiceScreen } from './practice';
import { songScreen } from './song';
import '../../styles/skip.css';

const stageMod = lazy(() => import('./stage'));

export interface StepsResult {
  /** Mã các bước bé tự xác nhận "Con làm được rồi" */
  selfOk: string[];
  /** Câu đố điều mới của tuần: [đúng, tổng]; null = không có */
  concept: [number, number] | null;
}

export interface RunStepsOpts {
  app: App;
  sessionId: string;
  steps: readonly TestStep[];
  /** Nhãn nhỏ trên đầu mỗi bước ("⚡ Thi vượt tuần 5 · 1/3") */
  tag: (k: number) => string;
  onFinish(r: StepsResult): void;
  /** Bé bấm Quay lại giữa chừng */
  onAbort(): void;
}

/** Câu hỏi tự xác nhận (lời cho bé — ngắn, thật thà). */
export function selfQuestion(step: TestStep): string {
  switch (step.kind) {
    case 'song':
      return step.need.tempo
        ? `Con vừa đàn “${findTune(step.songId)?.titleVi ?? step.label}” TRỌN BÀI theo nhịp — đúng nốt, đều nhịp, đúng ngón chưa?`
        : `Con vừa đàn “${findTune(step.songId)?.titleVi ?? step.label}” TRỌN BÀI — đúng nốt, đúng ngón chưa?`;
    case 'sight':
      return 'Con đọc và đàn đúng các đoạn nhạc mới chưa?';
    case 'notes':
      return step.key === 'c4' ? 'Con tìm đúng Đô giữa 10 lần (sai nhiều nhất 1 lần) chưa?' : 'Lúc đàn, vai con thả lỏng, ngón tròn, cổ tay mềm chưa?';
    case 'stage':
      return 'Con đã biểu diễn trọn 2–3 bài trên sân khấu chưa?';
    case 'quiz':
      return '';
  }
}

/** Màn câu hỏi tự xác nhận (export cho ảnh chụp DEV). */
export function selfCheckScreen(app: App, step: TestStep, tag: string, onAnswer: (yes: boolean) => void): Screen {
  return (root) => {
    const q = selfQuestion(step);
    let done = false;
    const answer = (yes: boolean) => {
      if (done) return;
      done = true;
      onAnswer(yes);
    };
    root.append(
      h(
        'div',
        { class: 'screen center skip-self' },
        h('div', { class: 'step-tag' }, tag),
        h('div', { class: 'skip-self-mascot' }, mascot('think', 96)),
        h('h1', { class: 'title skip-self-q' }, q),
        h('p', { class: 'lead skip-self-note' }, '🤞 Nói thật nhé — thi vượt chỉ có ý nghĩa khi con làm được thật. Chưa được cũng không sao!'),
        h(
          'div',
          { class: 'skip-self-actions' },
          button({ icon: '✅', label: 'Con làm được rồi', kind: 'good', big: true, onTap: () => answer(true) }),
          button({ icon: '🔁', label: 'Chưa — con tập thêm', kind: 'plain', big: true, onTap: () => answer(false) }),
        ),
      ),
    );
    void speak(app, q);
    return () => cancelSpeech();
  };
}

/** Chạy lần lượt các bước; xong gọi onFinish. */
export function runSteps(o: RunStepsOpts): void {
  const { app, sessionId: sid } = o;
  const store = app.store;
  const selfOk: string[] = [];
  let concept: [number, number] | null = null;
  const session = () => store.get().sessions.find((s) => s.id === sid);

  const after = (k: number): void => {
    const step = o.steps[k];
    const s = session();
    if (s && step.kind !== 'quiz' && stepVerdict(step, s) === 'unjudged') {
      app.mic.stop();
      app.show(
        selfCheckScreen(app, step, o.tag(k), (yes) => {
          if (yes) {
            selfOk.push(step.key);
            // Sân khấu: bé đã biểu diễn thật → huy chương thật (stickers đọc huy chương từ buổi)
            if (step.kind === 'stage') store.addParentAssessment(sid, 'medal', 'correct');
          }
          go(k + 1);
        }),
      );
      return;
    }
    go(k + 1);
  };

  const go = (k: number): void => {
    if (k >= o.steps.length) {
      app.mic.stop();
      o.onFinish({ selfOk, concept });
      return;
    }
    const step = o.steps[k];
    const next = () => after(k);
    const abort = () => {
      app.mic.stop();
      o.onAbort();
    };
    const intro = `${o.tag(k)} — ${step.label}`;
    switch (step.kind) {
      case 'song': {
        const tune = findTune(step.songId);
        if (!tune) return go(k + 1);
        app.show(
          songScreen(
            app,
            tune,
            { mode: step.mode, level: 2, hints: step.hints, intro, ...(step.bpm ? { bpm: step.bpm } : {}) },
            { onRun: (run) => store.addSongRun(sid, run), onDone: next, onBack: abort },
          ),
        );
        return;
      }
      case 'quiz': {
        const before = session()?.appAssessments.length ?? 0;
        app.show(
          quizScreen(app, {
            title: step.title,
            intro: step.intro,
            quiz: step.quiz,
            onAnswer: (e, act) => store.addAppAssessment(sid, e, act),
            onDone: () => {
              if (step.concept) {
                const got = (session()?.appAssessments ?? []).slice(before);
                concept = [got.filter((a) => a.correct).length, got.length];
              }
              next();
            },
            onBack: abort,
          }),
        );
        return;
      }
      case 'sight': {
        let n = 0;
        const one = (): Screen => {
          const tune = makeSightTune(
            { position: step.position, hand: step.hand, measures: 3, rhythm: step.rhythm, timeSignature: step.timeSignature },
            Math.random,
            `sight:${step.position}:${step.hand}`,
          );
          tune.titleVi = `Đọc nhạc (${n + 1}/${step.count})`;
          return songScreen(
            app,
            tune,
            { mode: 'wait', hints: step.hints, intro },
            { onRun: (run) => store.addSongRun(sid, run), onDone: () => (++n < step.count ? app.show(one()) : next()), onBack: abort },
          );
        };
        app.show(one());
        return;
      }
      case 'notes':
        app.show(
          practiceScreen(app, step.segment, {
            record: (t, r) => store.addParentAssessment(sid, t.noteId, r),
            recordMic: (t, info) => store.addMicAssessment(sid, { expected: t.keys.join('+'), firstHeard: info.firstHeard, wrongCount: info.wrongCount }),
            amendLast: (r, src) => (src === 'mic' ? store.overrideLastMic(sid, r) : store.amendLastParentAssessment(sid, r)),
            onComplete: next,
            onExit: abort,
          }),
        );
        return;
      case 'stage':
        app.show(
          lazyScreen(stageMod, (m) =>
            m.stageScreen(app, {
              level: step.level,
              onRun: (run) => store.addSongRun(sid, run),
              onMedal: () => store.addParentAssessment(sid, 'medal', 'correct'),
              onDone: next,
              onBack: abort,
            }),
          ),
        );
        return;
    }
  };
  go(0);
}

/** Thẻ giới thiệu / kết quả dùng chung (mascot + tiêu đề + đoạn + nút). */
export function skipCard(o: {
  tag: string;
  mood: Parameters<typeof mascot>[0];
  title: string;
  lead?: string;
  list?: readonly string[];
  art?: Node | null;
  actions: HTMLElement[];
  onBack?: () => void;
  extraClass?: string;
}): HTMLElement {
  return h(
    'div',
    { class: `screen skip-screen${o.extraClass ? ` ${o.extraClass}` : ''}` },
    h(
      'div',
      { class: 'stage scrollable skip-stage' },
      h('div', { class: 'step-tag' }, o.tag),
      h('div', { class: 'skip-hero' }, o.art ?? null, h('div', { class: 'skip-mascot' }, mascot(o.mood, 96))),
      h('h1', { class: 'title skip-title' }, o.title),
      o.lead ? h('p', { class: 'lead skip-lead' }, o.lead) : null,
      o.list?.length ? h('ul', { class: 'skip-list' }, ...o.list.map((x) => h('li', {}, x))) : null,
    ),
    h('div', { class: 'actions' }, o.onBack ? backButton(o.onBack) : null, ...o.actions),
  );
}
