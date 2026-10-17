import { findTune } from '../../music/exercises';
import { parentStats } from '../../progress/history';
import type { AppData, Settings } from '../../progress/schema';
import type { App } from '../App';
import { button, h, toast } from '../components/dom';
import { homeScreen } from './home';
import { tonightSegment, type TonightPractice } from './tonight';
import { practiceScreen } from './practice';
import { songScreen } from './song';
import { compositionToTune } from '../../practice/compose';
import type { Tune } from '../../music/tune';
import '../../styles/parentux.css';

import { BACKUP_MESSAGE, backupFresh, backupOverdue, daysSinceBackup, exportBackup } from '../../progress/backup';
import { parentSongToTune } from '../../practice/parentSongs';
import { prefetchLater } from '../lazy';
import {
  healthCheckScreen,
  micTestMod,
  micTestScreen,
  reportMod,
  reportScreen,
  songEditorMod,
  weeklyReportMod,
  weeklyReportScreen,
  type ParentCtx,
  type ParentUxSettings,
} from './parentShared';
import { detailsCard, latestSessionCards, overviewCard, skillsCard } from './parentProgressCards';
import { advancedSection } from './parentAdvanced';
import { focusGuideAnchor, guideButton, handGuideScreen, parentGuideMod, parentGuideScreen, syncWhatsNew, takeGuideHint, whatsNewCard } from './parentHelp';
import { PARENT_ANCHORS, type GuideAnchor } from './parentGuideData';
import { parentReviewScreen } from './parentReview';
import { cleanReviewAudio } from '../selfStudy';
import { gradable, reminders } from '../../progress/reviewQueue';
import { weeklyReportDue } from '../../progress/weeklyReportDue';
import { loadMicLog } from '../../audio/micLogStore';
import { healthNow } from '../healthEnv';
import { tickToday, todayCard } from './parentToday';
import { setupSection, tipsCard, weekCard } from './parentWeek';

// Giữ nguyên API cũ
export { fmtDate, parentLabel } from './parentShared';

/**
 * Màn phụ huynh (§8). (2026-10-17, OWNER duyệt — gọn còn ~2 màn hình):
 *   đầu màn (← Về màn của bé · ⋯ Báo cáo / Hướng dẫn / Xem tay) → ✅ Hôm nay bố mẹ cần (≤ 3 việc) → 🗓️ Tuần N (mục tiêu +
 *   "Vì sao?" + giữ tuần) → 💡 3 điều cần nhớ (thu gọn sau lần đầu mỗi tuần) → 🧩 Thiết lập một lần (thu gọn) → ⚙️ Nâng cao.
 * Bảng tiến độ (Tổng quan, Kỹ năng, Chi tiết, Phiếu quan sát, Sửa kết quả) nằm trong "📊 Báo cáo" (cuối trang báo cáo).
 * Sao lưu: MỘT quy tắc — mỗi tuần cùng báo cáo tuần; quá 30 ngày → băng nổi bật ở đây (progress/backup.ts backupOverdue).
 * Thẻ: parentToday.ts · parentWeek.ts · parentAdvanced.ts · parentProgressCards.ts · parentHelp.ts · dùng chung: parentShared.ts.
 */
export function parentScreen(app: App, opts: { focus?: GuideAnchor } = {}) {
  return (root: HTMLElement) => {
    prefetchLater([reportMod, weeklyReportMod, songEditorMod, micTestMod, parentGuideMod]);
    const store = app.store;
    // (+ 2026-10-10) 🆕 Có gì mới (cài mới → ghi luôn bản hiện tại, không hiện) · 📖 Hướng dẫn làm nổi MỘT lần
    syncWhatsNew(store);
    const guideHint = takeGuideHint(store);
    const whatsNewUi = { open: true };
    const back = () => app.show(parentScreen(app));
    const openGuide = () => app.show(parentGuideScreen(app));
    const scroller = h('div', { class: 'parent scrollable' });
    root.append(h('div', { class: 'screen' }, scroller));
    let message = '';

    const render = () => {
      const top = scroller.scrollTop;
      scroller.replaceChildren(...build(store.get()));
      scroller.scrollTop = top;
    };
    const say = (m: string) => {
      message = m;
      render();
    };
    const c: ParentCtx = {
      app,
      store,
      render,
      say,
      set: (patch) => {
        store.updateSettings(patch as Partial<Settings>);
        render();
      },
      ux: () => store.settings as Readonly<ParentUxSettings>,
      // resetStep: bước "Đặt lại dữ liệu"; advOpen: mục "Nâng cao" đang mở; …
      ui: { resetStep: 0, advOpen: !!opts.focus && PARENT_ANCHORS[opts.focus], detailsOpen: false, setupOpen: false, supportOpen: false },
    };

    const backup = () => void exportBackup(store).then((r) => say(BACKUP_MESSAGE[r]));

    /** 📊 Báo cáo — cuối trang có các bảng tiến độ chi tiết (trước đây chiếm 3 màn hình ở đây). */
    const openReport = () => app.show(reportScreen(app, { onBack: back, extra: () => progressDetails(c) }));

    /** "▶ Làm ngay (5')": luyện riêng chỗ khó rồi về màn của bé để bấm "Học tiếp". */
    const runPractice = (p: TonightPractice) => {
      const week = store.get().progress.currentWeek;
      const finish = (sessionId: string, done: boolean) => {
        app.mic.stop();
        const cur = store.get().sessions.find((x) => x.id === sessionId);
        if (cur && (cur.parentAssessments.length || cur.micAssessments.length || cur.songRuns.length)) store.finishSession(sessionId);
        else store.discardSessionIfEmpty(sessionId);
        if (done) {
          tickToday('tonight');
          app.show(homeScreen(app));
          toast('✅ Xong phần ôn — giờ bấm nút ▶ to nhé!', 3200);
        } else app.show(parentScreen(app));
      };
      if (p.kind === 'notes') {
        const seg = tonightSegment(p.noteIds);
        if (!seg.targets.length) return toast('Chưa tìm được bài tập cho chỗ này');
        const session = store.startSession(`w${week}-parent-now`); // không tính trứng bất ngờ (buổi phụ của bố mẹ)
        app.show(
          practiceScreen(app, seg, {
            record: (t, result) => store.addParentAssessment(session.id, t.noteId, result),
            recordMic: (t, info) =>
              store.addMicAssessment(session.id, { expected: t.keys.join('+'), firstHeard: info.firstHeard, wrongCount: info.wrongCount }),
            amendLast: (result, source) =>
              source === 'mic' ? store.overrideLastMic(session.id, result) : store.amendLastParentAssessment(session.id, result),
            onComplete: () => finish(session.id, true),
            onExit: () => finish(session.id, false),
          }),
        );
        return;
      }
      const ps = store.findParentSong(p.songId);
      const comp = store.findComposition(p.songId);
      const tune: Tune | undefined = findTune(p.songId) ?? (ps ? parentSongToTune(ps) : comp ? compositionToTune(comp) : undefined);
      if (!tune) return toast('Không tìm thấy bài này');
      // Câu khó: câu của lượt CHƯA ĐẠT gần nhất mà bé tập riêng một câu → mở thẳng "🔁 Lặp 3 lần đúng" câu đó
      const hardRun = store
        .get()
        .sessions.flatMap((s) => s.songRuns)
        .filter((r) => r.songId === tune.id && r.phrase && !r.passed)
        .pop();
      const hardPhrase = hardRun?.phrase ?? null;
      // Lượt vấp là lượt TÁCH TAY → lặp đúng tay đó (hai tay sẽ khó hơn cái bé đang vấp)
      const hardHand = hardRun?.hand;
      const session = store.startSession(`w${week}-song-${tune.id}`);
      app.show(
        songScreen(
          app,
          tune,
          hardPhrase
            ? { mode: 'wait', hints: 'full', free: true, phrase: hardPhrase, loop: true, ...(hardHand ? { hand: hardHand } : {}) }
            : { mode: 'wait', hints: 'full', free: true, intro: 'Tập chậm từng nốt. Chỗ hay vấp: chọn câu đó, bấm “Lặp câu” cho tới khi đúng 3 lần liền.' },
          { onRun: (run) => store.addSongRun(session.id, run), onDone: () => finish(session.id, true), onBack: () => finish(session.id, false) },
        ),
      );
    };

    const build = (d: Readonly<AppData>): HTMLElement[] => {
      const now = new Date();
      const week = d.progress.currentWeek;
      const health = healthNow(d, now.getTime());
      const overdue = backupOverdue(d, now.getTime());
      const pending = gradable(d).length + reminders(d).length;

      // ⋯ Thêm: Báo cáo tuần · Báo cáo · Hướng dẫn · Xem tay (bố mẹ bận chỉ cần "Hôm nay" + "Về màn của bé")
      const menu = h(
        'details',
        { class: 'parent-menu' },
        h(
          'summary',
          { 'aria-label': 'Thêm: Báo cáo tuần, Báo cáo, Hướng dẫn, Xem tay' },
          '⋯ Thêm',
          guideHint ? h('span', { class: 'guide-hint-tag', 'aria-hidden': 'true' }, 'Mới') : null,
        ),
        h(
          'div',
          { class: 'parent-menu-list' },
          button({ icon: '🗓️', label: 'Báo cáo tuần', onTap: () => app.show(weeklyReportScreen(app, { onBack: back })) }),
          button({ icon: '📊', label: 'Báo cáo', onTap: openReport }),
          guideButton(openGuide, guideHint),
          // (+ 2026-10-15) 👀 Bố mẹ xem tay con: phiếu 3 ý có hình + tranh Tư thế tay
          button({ icon: '👀', label: 'Xem tay', onTap: () => app.show(handGuideScreen(app, { parent: true, onBack: back })) }),
        ),
      );

      const sections: (HTMLElement | null)[] = [
        h(
          'header',
          { class: 'parent-head' },
          h('h1', {}, '👪 Phụ huynh'),
          h('div', { class: 'parent-head-actions' }, menu, button({ icon: '←', label: 'Về màn của bé', kind: 'primary', onTap: () => app.show(homeScreen(app)) })),
        ),
        message ? h('div', { class: 'banner' }, message) : null,
        store.recoveredFromMirror
          ? h('div', { class: 'banner' }, '✅ Dữ liệu chính bị trống / hỏng — app đã tự khôi phục tiến độ của bé từ bản sao thứ hai trong máy.')
          : store.recoveredFromBackup
            ? h('div', { class: 'banner' }, '✅ App đã tự khôi phục tiến độ của bé từ bản sao lưu trong máy (do lỗi cũ khi lên tuần 9).')
            : null,
        store.lastSaveError ? h('div', { class: 'banner warn' }, `Lỗi lưu dữ liệu: ${store.lastSaveError}`) : null,
        // 💾 MỘT quy tắc sao lưu: quá 30 ngày → băng nổi bật (màn này đã qua cổng phụ huynh)
        overdue
          ? h(
              'div',
              { class: 'banner warn backup-overdue', role: 'alert' },
              h(
                'p',
                {},
                (d.settings.lastBackupAt ?? 0) > 0 ? `⚠️ Đã ${daysSinceBackup(d, now.getTime())} ngày chưa sao lưu. ` : '⚠️ Chưa sao lưu lần nào. ',
                'Tiến độ của bé chỉ nằm trên iPad này — ',
                h('b', {}, 'xóa biểu tượng app = mất hết dữ liệu'),
                '.',
              ),
              button({ icon: '💾', label: 'Sao lưu ngay', kind: 'primary', onTap: backup }),
            )
          : null,
        // 🩺 Điều cần chú ý (cũng là "⚠️" trên nút Phụ huynh ở màn của bé) — trừ sao lưu (đã có băng trên)
        ((flags) =>
          flags.length
            ? h(
                'section',
                { class: 'card health-flags' },
                h('h2', {}, '⚠️ Cần bố mẹ xem'),
                h('ul', {}, ...flags.map((f) => h('li', {}, f.text))),
                button({ icon: '🩺', label: 'Kiểm tra sức khỏe app (~3 phút)', onTap: () => app.show(healthCheckScreen(app)) }),
              )
            : null)(health.flags.filter((f) => f.id !== 'backup')),
        // (+ 2026-10-10) 🆕 Có gì mới — chỉ bản có việc cho bố mẹ (changelog parentAction)
        whatsNewCard(c, d, whatsNewUi, openGuide),
        todayCard(
          d,
          now,
          {
            pending,
            reminders: reminders(d).length,
            weeklyDue: weeklyReportDue(d, now),
            backupNeeded: !backupFresh(d, now.getTime()) && (daysSinceBackup(d, now.getTime()) ?? 0) >= 7,
            micNever: !d.settings.micEnabled && !c.ux().micSetupHidden && !loadMicLog(),
            healthDue: health.due,
            lastBackupAt: d.settings.lastBackupAt ?? 0,
            healthReasons: health.reasons,
          },
          {
            review: () => app.show(parentReviewScreen(app, back)),
            practice: runPractice,
            weekly: () => app.show(weeklyReportScreen(app, { onBack: back })),
            backup,
            mic: () => app.show(micTestScreen(app)),
            micLater: () => c.set({ micSetupHidden: true }),
            health: () => app.show(healthCheckScreen(app)),
            render,
          },
        ),
        weekCard(c, d, now),
        tipsCard(week),
        setupSection(c, d, back),
        advancedSection(c, d),
      ];
      return sections.filter((x): x is HTMLElement => !!x);
    };

    render();
    void cleanReviewAudio(app);
    if (opts.focus) focusGuideAnchor(scroller, opts.focus);
  };
}

/**
 * 📋 Bảng tiến độ cho trang "📊 Báo cáo" (trước đây ở màn Phụ huynh): Tổng quan, Kỹ năng, Chi tiết (thu gọn), Phiếu quan
 * sát + Sửa kết quả buổi gần nhất. Vẽ lại tại chỗ khi bố mẹ chạm (không rời trang báo cáo).
 */
export function progressDetails(parent: ParentCtx): HTMLElement {
  const box = h('div', { class: 'progress-details' });
  const ui = { resetStep: 0, advOpen: false, detailsOpen: false, setupOpen: false, supportOpen: false };
  const c: ParentCtx = {
    ...parent,
    ui,
    render: () => draw(),
    say: (m) => toast(m),
    set: (patch) => {
      parent.store.updateSettings(patch as Partial<Settings>);
      draw();
    },
  };
  const draw = () => {
    const d = parent.store.get();
    const now = new Date();
    const latest = parent.store.latestSession();
    const stats = parentStats(d);
    box.replaceChildren(
      h('h2', { class: 'progress-details-title' }, '📋 Số liệu chi tiết (cho bố mẹ)'),
      overviewCard(d, now),
      skillsCard(d, stats.skills),
      detailsCard(c, d, stats),
      ...(latest ? latestSessionCards(c, d, latest) : []),
    );
  };
  draw();
  return box;
}
