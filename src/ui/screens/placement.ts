/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") 🧭 KIỂM TRA XẾP LỚP — màn (nạp trễ; mời ở màn chính / 📋 Xem các bài).
 * Bé tự làm (5–10 phút), không cần bố mẹ: các MỐC khó dần (lessons/placement.ts) — mỗi mốc vài bài / trò ngắn của tiêu chí tuần đó
 * (skipRunner: micro chấm hoặc bé tự xác nhận), dừng ở mốc đầu tiên chưa qua → áp dụng NGAY tuần gợi ý (chỉ nhảy tới) + mừng.
 */
import { weekPlan } from '../../lessons/lessonEngine';
import { applyPlacement, markPassed, markTitle, placementLessonId, placementMarks, placementTarget } from '../../lessons/placement';
import type { App, Screen } from '../App';
import { button, h } from '../components/dom';
import { confetti } from '../components/celebrate';
import { islandArrival } from '../components/arrival';
import { islandIcon } from '../components/art/islandArt';
import { cancelSpeech, speak } from '../../audio/voice';
import { homeScreen } from './home';
import { runSteps, skipCard } from './skipRunner';
import '../../styles/skip.css';

const islandArt = (week: number): Node | null => {
  try {
    return h('div', { class: 'skip-island' }, islandIcon(week, 'current'));
  } catch {
    return null;
  }
};

export function placementScreen(app: App): Screen {
  return (root) => {
    const store = app.store;
    const from = store.get().progress.currentWeek;
    const marks = placementMarks(from);
    const home = () => app.show(homeScreen(app));
    if (!marks.length) {
      root.append(
        skipCard({
          tag: '🧭 Kiểm tra xếp lớp',
          mood: 'happy',
          title: 'Con đã ở chặng rất cao rồi!',
          actions: [button({ icon: '🏠', label: 'Về màn chính', kind: 'primary', onTap: home })],
        }),
      );
      return;
    }
    const begin = () => {
      const session = store.startSession(placementLessonId(store.today()));
      const sid = session.id;
      const passed: number[] = [];
      const total = marks.length;
      const finish = () => {
        const cur = store.get().sessions.find((x) => x.id === sid);
        if (cur && (cur.songRuns.length || cur.appAssessments.length)) store.finishSession(sid);
        else store.discardSessionIfEmpty(sid);
        const target = placementTarget(from, passed);
        const now = Date.now();
        const today = store.today();
        store.applySkipChange((d) => void applyPlacement(d, target, now, today));
        app.show(resultScreen(app, from, store.get().progress.currentWeek));
      };
      const runMark = (k: number): void => {
        if (k >= total) return finish();
        const mark = marks[k];
        // Thẻ ngắn "Mức k" (≤ 1 chạm) rồi các bước của mốc
        app.show((r) => {
          r.append(
            skipCard({
              tag: `🧭 Kiểm tra xếp lớp · ${k + 1}/${total}`,
              mood: k ? 'clap' : 'point',
              art: islandArt(mark.week),
              title: markTitle(mark, k),
              lead: k ? 'Giỏi! Thử mức khó hơn nhé.' : 'Bắt đầu từ chặng của con.',
              list: mark.plan.steps.map((s) => s.label),
              onBack: () => finish(),
              actions: [
                button({
                  icon: '▶',
                  label: 'Thử mức này',
                  kind: 'primary',
                  big: true,
                  onTap: () =>
                    runSteps({
                      app,
                      sessionId: sid,
                      steps: mark.plan.steps,
                      tag: (j) => `🧭 ${markTitle(mark, k)} · ${j + 1}/${mark.plan.steps.length}`,
                      onAbort: finish,
                      onFinish: ({ selfOk }) => {
                        const cur = store.get().sessions.find((x) => x.id === sid);
                        if (cur && markPassed(mark, cur, selfOk)) {
                          passed.push(mark.week);
                          runMark(k + 1);
                        } else finish();
                      },
                    }),
                }),
              ],
            }),
          );
        });
      };
      runMark(0);
    };
    root.append(
      skipCard({
        tag: '🧭 Kiểm tra xếp lớp',
        mood: 'wave',
        title: 'Con thấy dễ quá? Kiểm tra xếp lớp 5–10 phút!',
        lead: 'Con chơi vài bài ngắn, khó dần. Làm tốt tới đâu, con lên thẳng chặng đó. Gặp bài khó thì dừng — không sao cả!',
        onBack: home,
        actions: [button({ icon: '🧭', label: 'Bắt đầu', kind: 'primary', big: true, onTap: begin })],
      }),
    );
    void speak(app, 'Con thấy dễ quá? Kiểm tra xếp lớp năm đến mười phút nhé!');
    return () => cancelSpeech();
  };
}

/** Kết quả (export cho ảnh chụp DEV). */
export function resultScreen(app: App, from: number, to: number): Screen {
  return (root) => {
    const toHome = () => app.show(homeScreen(app));
    const jumped = to > from;
    const plan = weekPlan(to);
    root.append(
      skipCard({
        tag: '🧭 Kiểm tra xếp lớp',
        mood: jumped ? 'cheer' : 'happy',
        art: islandArt(to),
        title: jumped ? `🚀 Con lên thẳng Tuần ${to}: ${plan.island}!` : 'Con đang học đúng chặng rồi!',
        lead: jumped
          ? `Con vượt ${to - from} tuần — bài của các tuần đó vẫn có trong 🎵 Thư viện`
          : 'Bài tuần này vừa sức con — luyện thật chắc rồi ⚡ thi vượt tuần nhé!',
        extraClass: jumped ? 'skip-pass' : undefined,
        actions: [button({ icon: '▶', label: 'Về màn chính', kind: 'primary', big: true, onTap: toHome })],
      }),
    );
    let overlay: HTMLElement | null = null;
    if (jumped) {
      confetti(90);
      try {
        overlay = islandArrival({ fromWeek: from, toWeek: to, toName: plan.island, toEmoji: plan.islandEmoji }, () => undefined);
        root.append(overlay);
      } catch {
        overlay = null;
      }
    }
    void speak(app, jumped ? `Con lên thẳng tuần ${to}, ${plan.island}!` : 'Con đang học đúng chặng rồi!');
    return () => {
      overlay?.remove();
      cancelSpeech();
    };
  };
}
