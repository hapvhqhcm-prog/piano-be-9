import type { SessionStep } from '../../lessons/lessonEngine';
import { makeSightTune } from '../../music/sightread';
import type { Tune } from '../../music/tune';
import type { App, Screen } from '../App';
import { h } from '../components/dom';
import { songScreen } from './song';
import '../../styles/warmup.css';

type SightDailyStep = Extract<SessionStep, { kind: 'sight-daily' }>;

/** Mã bài của đoạn đọc nhạc mỗi ngày (bắt đầu bằng "sight" → màn bài hát coi là đọc nhạc: không nhắc "bài mới"). */
export const SIGHT_DAILY_ID = 'sight-daily';

/** Đoạn nhạc MỚI cho bước "Đọc nhạc 1 phút" (hàm thuần theo rng — có test). */
export function sightDailyTune(step: SightDailyStep, rng: () => number = Math.random): Tune {
  const tune = makeSightTune(
    {
      position: step.position,
      hand: step.hand,
      measures: step.measures,
      rhythm: step.rhythm,
      timeSignature: step.timeSignature,
      startAnywhere: step.startAnywhere,
    },
    rng,
    SIGHT_DAILY_ID,
  );
  tune.titleVi = 'Đọc nhạc 1 phút';
  return tune;
}

/**
 * v5.2 (OWNER duyệt 2026-10-08) — ĐỌC NHẠC 1 PHÚT MỖI NGÀY (từ tuần 8): một đoạn mới toanh trong thế tay hiện tại,
 * chơi Từng nốt (chờ bé đàn đúng). Gợi ý rút dần theo tuần (tên nốt → chỉ khuông). KHÔNG ghi lượt chơi
 * (không đổi tiêu chí tuần / "đã thuộc" / học tiếp).
 */
export function sightDailyScreen(app: App, step: SightDailyStep, hooks: { onDone(): void; onBack(): void }): Screen {
  const inner = songScreen(
    app,
    sightDailyTune(step),
    {
      mode: 'wait',
      hints: step.hints,
      intro: step.hints === 'staff' ? 'Đoạn nhạc MỚI — chỉ nhìn khuông, đọc từng nốt rồi đàn nhé!' : 'Đoạn nhạc MỚI — đọc tên nốt rồi đàn nhé!',
    },
    { onRun: () => undefined, onDone: hooks.onDone, onBack: hooks.onBack },
  );
  return (root) => {
    const cleanup = inner(root);
    root.append(h('div', { class: 'sight-daily-tag', 'aria-hidden': 'true' }, '📖 1 phút mỗi ngày'));
    return cleanup;
  };
}
