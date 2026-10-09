import { findTune } from '../../music/exercises';
import { completedSessionCount, parentStats } from '../../progress/history';
import type { AppData, Session, Settings } from '../../progress/schema';
import type { App } from '../App';
import { button, confirmDialog, h, toast } from '../components/dom';
import { homeScreen } from './home';
import { onboardingScreen } from './onboarding';
import { parentTip } from '../../lessons/parentTips';
import { tonightSegment, type TonightPractice } from './tonight';
import { quickTipsCard } from './onboarding';
import { practiceScreen } from './practice';
import { songScreen } from './song';
import { compositionToTune } from '../../practice/compose';
import type { Tune } from '../../music/tune';
import '../../styles/parentux.css';
import { whenCorrectBox } from '../components/whenCorrect';

import { installCard } from '../components/installCard';
import { BACKUP_MESSAGE, exportBackup } from '../../progress/backup';
import { parentSongToTune } from '../../practice/parentSongs';
import { prefetchLater } from '../lazy';
import { reminderCard } from '../components/reminderCard';
import { DAY_MS, fmtMs, micTestMod, reportMod, reportScreen, songEditorMod, storageText, weeklyReportMod, type ParentCtx, type ParentUxSettings } from './parentShared';
import { micSetupCard, readinessCard, tonightCard, weeklyReportCard } from './parentTodayCards';
import { detailsCard, latestSessionCards, overviewCard, skillsCard } from './parentProgressCards';
import { advancedSection } from './parentAdvanced';
import { parentSongsCard } from './parentSongsCard';

// Giữ nguyên API cũ
export { fmtDate, parentLabel } from './parentShared';

/**
 * Màn phụ huynh (§8). Trên cùng: "Việc cần làm tối nay" (3 chỗ khó + 1 việc + tiêu chí tuần).
 * Kết quả bố mẹ bấm / trò chơi app chấm / micro chấm vẫn hiển thị TÁCH RIÊNG (§2) nhưng bằng lời thường.
 * Phiên bản, cài đặt, dữ liệu nằm trong mục "Nâng cao" thu gọn.
 * Thẻ: parentTodayCards.ts (tối nay, micro, sẵn sàng) · parentProgressCards.ts (tổng quan, kỹ năng, chi tiết, buổi gần
 * nhất) · parentAdvanced.ts (Nâng cao) · parentSongsCard.ts (bài bố mẹ thêm) · dùng chung: parentShared.ts.
 */
export function parentScreen(app: App) {
  return (root: HTMLElement) => {
    prefetchLater([reportMod, weeklyReportMod, songEditorMod, micTestMod]);
    const store = app.store;
    const scroller = h('div', { class: 'parent scrollable' });
    root.append(h('div', { class: 'screen' }, scroller));
    let message = '';
    const ux = () => store.settings as Readonly<ParentUxSettings>;
    const setUx = (patch: Partial<ParentUxSettings>) => store.updateSettings(patch as Partial<Settings>);

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
      ux,
      // resetStep: bước "Đặt lại dữ liệu"; advOpen: mục "Nâng cao" đang mở; detailsOpen: mục "Chi tiết" đang mở
      ui: { resetStep: 0, advOpen: false, detailsOpen: false },
    };

    const backup = () => void exportBackup(store).then((r) => say(BACKUP_MESSAGE[r]));

    /** 📊 Báo cáo → khi quay lại: chưa sao lưu tuần này thì hỏi (tối đa mỗi tuần một lần). */
    const openReport = () =>
      app.show(
        reportScreen(app, {
          onBack: () => {
            app.show(parentScreen(app));
            const now = Date.now();
            const s = ux();
            if (now - (s.lastBackupAt ?? 0) > 7 * DAY_MS && now - (s.backupAskedAt ?? 0) > 7 * DAY_MS) {
              setUx({ backupAskedAt: now });
              confirmDialog({
                title: '💾 Sao lưu luôn?',
                text: s.lastBackupAt
                  ? `Lần sao lưu gần nhất: ${fmtMs(s.lastBackupAt)}. Sao lưu mỗi tuần để không mất tiến độ của bé nếu iPad bị xóa dữ liệu.`
                  : 'Chưa sao lưu lần nào. Tiến độ của bé chỉ nằm trên iPad này — sao lưu mỗi tuần (Lưu vào Tệp) cho chắc.',
                okIcon: '💾',
                okLabel: 'Sao lưu ngay',
                onOk: () => void exportBackup(store).then((r) => toast(BACKUP_MESSAGE[r], 3200)),
              });
            }
          },
        }),
      );

    /** "▶ Làm ngay (5')": luyện riêng chỗ khó rồi về màn của bé để bấm "Học tiếp". */
    const runPractice = (p: TonightPractice) => {
      const week = store.get().progress.currentWeek;
      const finish = (sessionId: string, done: boolean) => {
        app.mic.stop();
        const cur = store.get().sessions.find((x) => x.id === sessionId);
        if (cur && (cur.parentAssessments.length || cur.micAssessments.length || cur.songRuns.length)) store.finishSession(sessionId);
        else store.discardSessionIfEmpty(sessionId);
        if (done) {
          app.show(homeScreen(app));
          toast('✅ Xong phần ôn — giờ bấm “Học tiếp” nhé!', 3200);
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
      const latest: Session | null = store.latestSession();

      // Bảng tổng hợp theo nốt (PARENT / APP / MIC) + "Kỹ năng của con" — TỪ ĐẦU, kể cả các buổi đã gộp vào lịch sử
      const stats = parentStats(d);

      // 💾 Sao lưu: dòng trạng thái dưới tiêu đề (cảnh báo khi > 14 ngày / chưa lần nào mà đã học vài buổi)
      const lastBackup = d.settings.lastBackupAt ?? 0;
      const backupStale = lastBackup ? Date.now() - lastBackup > 14 * DAY_MS : completedSessionCount(d) >= 3;
      const storageSpan = h('span', {});
      void storageText(store).then((t) => (storageSpan.textContent = t ? ` · ${t}` : ''));
      const backupLine = h(
        'p',
        { class: `backup-line${backupStale ? ' warn' : ''}` },
        lastBackup
          ? `💾 Đã sao lưu ngày ${fmtMs(lastBackup)}${backupStale ? ' — đã hơn 2 tuần, bấm “💾 Sao lưu” để giữ tiến độ của bé' : ''}`
          : `💾 Chưa sao lưu lần nào${backupStale ? ' — bấm “💾 Sao lưu” (Lưu vào Tệp) để không mất tiến độ' : ''}`,
        storageSpan,
      );

      const weekly = weeklyReportCard(c, d, now, () => app.show(parentScreen(app)));
      const weeklyDue = weekly.classList.contains('due');
      const sections: (HTMLElement | null)[] = [
        h(
          'header',
          { class: 'parent-head' },
          h('h1', {}, '👪 Phụ huynh'),
          h(
            'div',
            { class: 'parent-head-actions' },
            button({ icon: '📊', label: 'Báo cáo', onTap: openReport }),
            (() => {
              const b = button({ icon: '💾', label: 'Sao lưu', onTap: backup });
              b.classList.add('backup-btn');
              if (backupStale) b.classList.add('warn');
              return b;
            })(),
            button({ icon: '📖', label: 'Hướng dẫn', onTap: () => app.show(onboardingScreen(app, { onDone: () => app.show(parentScreen(app)) })) }),
            button({ icon: '←', label: 'Về màn của bé', kind: 'primary', onTap: () => app.show(homeScreen(app)) }),
          ),
        ),
        backupLine,
        message ? h('div', { class: 'banner' }, message) : null,
        store.recoveredFromMirror
          ? h('div', { class: 'banner' }, '✅ Dữ liệu chính bị trống / hỏng — app đã tự khôi phục tiến độ của bé từ bản sao thứ hai trong máy.')
          : store.recoveredFromBackup
            ? h('div', { class: 'banner' }, '✅ App đã tự khôi phục tiến độ của bé từ bản sao lưu trong máy (do lỗi cũ khi lên tuần 9).')
            : null,
        store.lastSaveError ? h('div', { class: 'banner warn' }, `Lỗi lưu dữ liệu: ${store.lastSaveError}`) : null,
        // (+ 2026-10-09) 📊 Báo cáo tuần: tuần vừa hết chưa xem → thẻ ở đầu màn; không thì nằm cạnh phần tiến độ
        weeklyDue ? weekly : null,
        micSetupCard(c, d),
        tonightCard(d, now, runPractice),
        readinessCard(c, d, now),
        h(
          'section',
          { class: 'card tip-card' },
          h('h2', {}, `👪 Tuần ${week}: bố mẹ chú ý`),
          h('p', {}, parentTip(week)),
          whenCorrectBox(),
        ),
        quickTipsCard(),
        // Chưa thêm vào Màn hình chính → iPad có thể xóa tiến độ: giữ ở phần đầu (an toàn dữ liệu)
        installCard(),
        weeklyDue ? null : weekly,
        overviewCard(d, now),
        skillsCard(d, stats.skills),
        detailsCard(c, d, stats),
      ];

      if (latest) sections.push(...latestSessionCards(c, d, latest));

      const details = advancedSection(c, d);
      // (2026-10-09) Nhóm "thiết lập một lần" ở cuối (trước Nâng cao): ⏰ giờ tập · bài bố mẹ thêm —
      // phần đầu màn dành cho việc hằng ngày (tối nay, sẵn sàng sang tuần, mẹo tuần) và tiến độ
      sections.push(
        // (+ 2026-10-08) ⏰ Đặt giờ tập — lời nhắc .ics lặp hằng tuần trong Lịch của iPad
        reminderCard(app),
        parentSongsCard(c, () => app.show(parentScreen(app))),
        details,
      );
      return sections.filter((x): x is HTMLElement => !!x);
    };

    render();
  };
}
