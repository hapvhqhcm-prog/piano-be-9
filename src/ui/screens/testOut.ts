/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") ⚡ THI VƯỢT TUẦN — màn (nạp trễ từ màn chính → 📋 Xem các bài).
 * Bé tự bấm, không cần bố mẹ. Giới thiệu → các bước thi (skipRunner — màn sẵn có, micro chấm hoặc bé tự xác nhận) → chấm
 * (lessons/testOut.gradeTestOut) → ĐẠT: ghi 'testedOut', sang tuần sau, cảnh cập bến đảo mới + pháo giấy;
 * CHƯA ĐẠT: lời nhắn nhẹ nhàng + những gì cần tập, mai thi lại.
 */
import { MAX_WEEK, weekPlan } from '../../lessons/lessonEngine';
import { applyTestOutPass, gradeTestOut, noteTestOutFail, testOutLessonId, testOutPlan, testOutStatus } from '../../lessons/testOut';
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

export function testOutScreen(app: App): Screen {
  return (root) => {
    const store = app.store;
    const st = testOutStatus(store.get(), store.today());
    const week = st.week;
    const plan = testOutPlan(week);
    const wp = weekPlan(week);
    const home = () => app.show(homeScreen(app));
    if (st.why !== 'ok' || !plan.steps.length) {
      root.append(
        skipCard({
          tag: `⚡ Thi vượt tuần ${week}`,
          mood: 'happy',
          title: st.why === 'cooldown' ? 'Hôm nay con thi rồi — mai mình thi lại nhé!' : 'Tuần này chưa thi vượt được',
          lead: st.why === 'cooldown' ? 'Hôm nay tập thêm bài của tuần cho thật chắc tay.' : undefined,
          actions: [button({ icon: '🏠', label: 'Về màn chính', kind: 'primary', onTap: home })],
        }),
      );
      return;
    }
    const steps = plan.steps.map((s) => `${s.kind === 'song' ? '🎵' : s.kind === 'quiz' ? '👂' : s.kind === 'sight' ? '🎼' : s.kind === 'stage' ? '🎤' : '✋'} ${s.label}`);
    const begin = () => {
      const session = store.startSession(testOutLessonId(week));
      const sid = session.id;
      runSteps({
        app,
        sessionId: sid,
        steps: plan.steps,
        tag: (k) => `⚡ Thi vượt tuần ${week} · ${k + 1}/${plan.steps.length}`,
        onAbort: () => {
          const cur = store.get().sessions.find((x) => x.id === sid);
          if (cur && (cur.songRuns.length || cur.appAssessments.length || cur.parentAssessments.length)) store.finishSession(sid);
          else store.discardSessionIfEmpty(sid);
          home();
        },
        onFinish: ({ selfOk, concept }) => {
          const cur = store.get().sessions.find((x) => x.id === sid);
          const grade = cur ? gradeTestOut(plan, cur, selfOk, concept) : { passed: false, missing: [] as string[] };
          store.finishSession(sid);
          const now = Date.now();
          const today = store.today();
          if (grade.passed) {
            store.applySkipChange((d) => void applyTestOutPass(d, week, now, today));
            app.show(passScreen(app, week));
          } else {
            store.applySkipChange((d) => noteTestOutFail(d, week, today));
            app.show(failScreen(app, week, grade.missing));
          }
        },
      });
    };
    root.append(
      skipCard({
        tag: `⚡ Thi vượt tuần ${week}`,
        mood: 'point',
        art: islandArt(week),
        title: plan.perform ? `Biểu diễn để vượt qua ${wp.island}!` : `Con thấy dễ? Thi vượt ${wp.island}!`,
        lead: 'Làm được hết những việc này trong MỘT buổi là con sang đảo mới ngay. Chưa được cũng không sao — mai thi lại.',
        list: steps,
        onBack: home,
        actions: [button({ icon: '⚡', label: 'Bắt đầu thi', kind: 'primary', big: true, onTap: begin })],
      }),
    );
    void speak(app, `Thi vượt ${wp.island}! Làm được hết trong một buổi là con sang đảo mới ngay.`);
    return () => cancelSpeech();
  };
}

/** Đạt: cảnh cập bến (≤ 3 giây, chạm để bỏ qua) rồi thẻ mừng. (export cho ảnh chụp DEV) */
export function passScreen(app: App, week: number): Screen {
  return (root) => {
    const to = Math.min(MAX_WEEK, week + 1);
    const next = weekPlan(to);
    const card = skipCard({
      tag: '⚡ Thi vượt tuần',
      mood: 'cheer',
      art: islandArt(to),
      title: `🏅 Con đã vượt qua ${weekPlan(week).island}!`,
      lead: `Chặng mới: ${next.islandEmoji} ${next.island}. Giỏi quá!`,
      extraClass: 'skip-pass',
      actions: [button({ icon: '▶', label: 'Về màn chính học bài mới', kind: 'primary', big: true, onTap: () => app.show(homeScreen(app)) })],
    });
    root.append(card);
    confetti(90);
    let overlay: HTMLElement | null = null;
    try {
      overlay = islandArrival({ fromWeek: week, toWeek: to, toName: next.island, toEmoji: next.islandEmoji }, () => undefined);
      root.append(overlay);
    } catch {
      overlay = null;
    }
    void speak(app, `Con đã vượt qua ${weekPlan(week).island}! Chặng mới: ${next.island}.`);
    return () => {
      overlay?.remove();
      cancelSpeech();
    };
  };
}

/** Chưa đạt: nhẹ nhàng, nêu điều cần tập, mai thi lại. (export cho ảnh chụp DEV) */
export function failScreen(app: App, week: number, missing: readonly string[]): Screen {
  return (root) => {
    root.append(
      skipCard({
        tag: `⚡ Thi vượt tuần ${week}`,
        mood: 'encourage',
        title: 'Gần được rồi! 💪',
        lead: 'Con tập thêm mấy chỗ này nhé — mai mình thi lại:',
        list: missing.length ? missing : ['Bài của tuần này'],
        actions: [button({ icon: '🏠', label: 'Về màn chính', kind: 'primary', big: true, onTap: () => app.show(homeScreen(app)) })],
      }),
    );
    void speak(app, 'Gần được rồi! Con tập thêm một chút, mai mình thi lại nhé.');
    return () => cancelSpeech();
  };
}
