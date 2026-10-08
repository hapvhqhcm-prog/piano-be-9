import { LEFT_HAND_WEEK, MAX_WEEK, WEEKS, criterionProgress, findLesson, levelOf, masteredSongs, weekPassed, weekPlan } from '../../lessons/lessonEngine';
import { SONGS } from '../../music/tune';
import { parentTip } from '../../lessons/parentTips';
import { findTune } from '../../music/exercises';
import * as progressStoreModule from '../../progress/ProgressStore';
import { isEmptySession } from '../../progress/ProgressStore';
import { completedSessionCount, parentStats, sessionCount } from '../../progress/history';
import { CHECKLIST_ITEMS, localDateStr, type AppData, type Session, type Settings } from '../../progress/schema';
import type { App, Screen } from '../App';
import { button, confirmDialog, h, toast } from '../components/dom';
import { homeScreen } from './home';
import { APP_VERSION, checkForUpdate, isUpdateReady } from '../../pwa/updater';
import { startScreen } from './start';
import { onboardingScreen } from './onboarding';
import { WHO_TEXT, noteLabelForParent, readiness, tonightPlan, tonightSegment, type HoldSettings, type TonightPractice } from './tonight';
import { quickTipsCard } from './onboarding';
import { practiceScreen } from './practice';
import { songScreen } from './song';
import { compositionToTune } from '../../practice/compose';
import type { Tune } from '../../music/tune';
import '../../styles/parentux.css';
import { whenCorrectBox } from '../components/whenCorrect';
import { cancelSpeech, hasVietnameseVoice, speak } from '../../audio/voice';

import { installCard } from '../components/installCard';
import { BACKUP_MESSAGE, exportBackup } from '../../progress/backup';
import { PRIVACY_NOTE, customTuneTitle, parentSongToTune } from '../../practice/parentSongs';
import { measureCount } from '../../music/tune';
import { playSong } from './library';
import { lazy, lazyScreen, prefetchLater } from '../lazy';

// Màn con ít dùng của Phụ huynh → chunk riêng (nạp ngầm khi màn Phụ huynh đã vẽ xong).
const micTestMod = lazy(() => import('./micTest'));
const songEditorMod = lazy(() => import('./songEditor'));
const reportMod = lazy(() => import('./report'));
const diagnosticsMod = lazy(() => import('./diagnostics'));
type SongEditorArgs = Parameters<typeof import('./songEditor').songEditorScreen>;
type ReportOpts = Parameters<typeof import('./report').reportScreen>[1];
const micTestScreen = (app: App): Screen => lazyScreen(micTestMod, (m) => m.micTestScreen(app));
const songEditorScreen = (app: App, existing: SongEditorArgs[1], hooks: SongEditorArgs[2]): Screen =>
  lazyScreen(songEditorMod, (m) => m.songEditorScreen(app, existing, hooks));
const reportScreen = (app: App, opts: ReportOpts): Screen => lazyScreen(reportMod, (m) => m.reportScreen(app, opts));
/** 🩺 Kiểm tra iPad (âm thanh, giọng đọc, micro, lưu trữ…) → gửi kết quả cho người hỗ trợ */
const diagnosticsScreen = (app: App): Screen => lazyScreen(diagnosticsMod, (m) => m.diagnosticsScreen(app));

/** Settings thêm (cộng dồn, không cần migration) của màn Phụ huynh. */
type ParentUxSettings = Settings &
  HoldSettings & {
    /** Bố mẹ bấm "Để sau" ở thẻ Cài micro → không hiện thẻ đầu trang nữa (vẫn cài được ở Nâng cao) */
    micSetupHidden?: boolean;
    /** Lần cuối hỏi "Sao lưu luôn?" sau khi xem Báo cáo (ms) — hỏi tối đa mỗi tuần một lần */
    backupAskedAt?: number;
  };
const DAY_MS = 86_400_000;

/** "2026-10-06" → "06/10" (bố mẹ đọc ngày kiểu Việt Nam). */
export function fmtDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? `${m[3]}/${m[2]}` : key;
}
function fmtMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const EAR_WORD: Record<string, string> = {
  up: 'Đi lên',
  down: 'Đi xuống',
  same: 'Giữ nguyên',
  step: 'Liền bậc',
  skip: 'Nhảy bậc',
  major: 'Trưởng (vui)',
  minor: 'Thứ (buồn)',
};
/** Mã nốt / việc → lời thường cho bảng của bố mẹ ("F4" → "Fa (F4)", "twins-4" → "Sinh đôi"). */
export function parentLabel(id: string): string {
  if (EAR_WORD[id]) return EAR_WORD[id];
  return noteLabelForParent(id).label.replace(/^Nốt /, '');
}

/** Dung lượng lưu trữ — dùng storageStatus() của ProgressStore nếu có (DATA agent), không có thì bỏ qua. */
function storageText(store: unknown): Promise<string | null> {
  const mod = progressStoreModule as unknown as Record<string, unknown>;
  const s = store as Record<string, unknown>;
  const fn = (typeof s.storageStatus === 'function' ? (s.storageStatus as () => unknown).bind(store) : null) ??
    (typeof mod.storageStatus === 'function' ? () => (mod.storageStatus as (x: unknown) => unknown)(store) : null);
  if (!fn) return Promise.resolve(null);
  const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return Promise.resolve()
    .then(fn)
    .then((r) => {
      if (r == null) return null;
      if (typeof r === 'string') return r;
      const o = r as Record<string, unknown>;
      if (typeof o.text === 'string') return o.text;
      if (typeof o.message === 'string') return o.message;
      const num = (...ks: string[]) => ks.map((k) => o[k]).find((v): v is number => typeof v === 'number');
      const used = num('usedBytes', 'bytes', 'used', 'usage', 'size');
      const quota = num('quotaBytes', 'quota', 'limit', 'max');
      if (used === undefined) return null;
      const pct = num('percent', 'pct') ?? (quota ? Math.round((used / quota) * 100) : undefined);
      return `Bộ nhớ dữ liệu: ${kb(used)}${quota ? ` / ${kb(quota)}` : ''}${pct !== undefined ? ` (${pct}%)` : ''}`;
    })
    .catch(() => null);
}

const RATING_LABEL = { all: '😄 Dễ — đàn được', some: '🙂 Vừa — còn vấp chút', hard: '😅 Khó — cần tập thêm' } as const;

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Thứ 2 = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function lessonName(id: string, d?: Readonly<AppData>): string {
  const l = findLesson(id);
  if (l) return `${l.emoji} ${l.title}`;
  const m = /^w\d+-song-(.+)$/.exec(id);
  if (m) return `🎵 ${findTune(m[1])?.titleVi ?? (d && customTuneTitle(m[1], d)) ?? m[1]} (tự chọn)`;
  if (/^w\d+-daily$/.test(id)) return '🔁 Luyện tập mỗi ngày';
  return id;
}

const MODE_LABEL = { wait: 'Từng nốt', tempo: 'Theo nhịp' } as const;
const HINT_LABEL = { full: 'phím sáng', names: 'tên nốt', staff: 'chỉ khuông' } as const;

function table(head: string[], rows: (string | number)[][]): HTMLElement {
  if (rows.length === 0) return h('p', { class: 'muted' }, 'Chưa có dữ liệu');
  // Bảng rộng: bọc trong khung cuộn ngang (.scrollable chỉ cho cuộn dọc)
  return h(
    'div',
    { class: 'tbl-wrap' },
    h(
      'table',
      { class: 'tbl' },
      h('thead', {}, h('tr', {}, ...head.map((c) => h('th', {}, c)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, String(c)))))),
    ),
  );
}

function segmented<T extends string | number>(
  options: Array<{ value: T; label: string }>,
  current: T,
  onPick: (v: T) => void,
  disabled = false,
): HTMLElement {
  return h(
    'div',
    { class: 'seg' },
    ...options.map((o) => {
      const b = h('button', { class: `seg-btn${o.value === current ? ' on' : ''}`, type: 'button' }, o.label);
      b.disabled = disabled;
      b.addEventListener('click', () => onPick(o.value));
      return b;
    }),
  );
}

/**
 * "Việc cần làm tối nay" (đầu trang): 1 việc cụ thể + "▶ Làm ngay (5')" + 3 chỗ khó + tiêu chí tuần.
 * Nghỉ ≥ 5 ngày → lời "Mừng con quay lại" (ôn nhẹ), chỗ khó cũ hơn 7 ngày bị bỏ.
 */
function tonightCard(d: Readonly<AppData>, now: Date, onPractice: (p: TonightPractice) => void): HTMLElement {
  const t = tonightPlan(d, now);
  const g = t.goal;
  // v5.1: mục tiêu chăm chỉ tính theo NGÀY (hai buổi cùng ngày = một ngày)
  const days = g.daysThisWeek;
  const pct = Math.min(100, Math.round((days / 4) * 100));
  return h(
    'section',
    { class: `card todo-card${t.welcomeBack ? ' welcome' : ''}` },
    h('h2', {}, t.welcomeBack ? `👋 Mừng bé quay lại (nghỉ ${t.daysAway} ngày)` : '📝 Việc cần làm tối nay'),
    h('p', { class: 'todo-action' }, t.action),
    t.practice
      ? h(
          'div',
          { class: 'todo-go' },
          button({ icon: '▶', label: t.welcomeBack ? "Ôn nhẹ ngay (5')" : "Làm ngay (5')", kind: 'good', onTap: () => onPractice(t.practice!) }),
          h('span', { class: 'muted' }, 'Làm trước khi bấm “Học tiếp”.'),
        )
      : null,
    t.struggles.length
      ? h(
          'div',
          {},
          h('h3', {}, t.welcomeBack ? 'Chỗ bé hay vấp (7 ngày gần đây)' : 'Chỗ bé hay vấp (2 tuần gần đây)'),
          h(
            'ol',
            { class: 'todo-list' },
            ...t.struggles.map((x, i) => h('li', {}, h('b', {}, String(i + 1)), h('span', {}, `${x.label} — vấp ${x.misses} lần`))),
          ),
        )
      : h('p', { class: 'muted' }, t.welcomeBack ? 'Sau kỳ nghỉ, app bỏ qua các chỗ khó cũ — bắt đầu lại nhẹ nhàng. 👍' : 'Chưa thấy chỗ nào bé vấp nhiều trong 2 tuần gần đây. 👍'),
    h(
      'p',
      { class: 'todo-goal' },
      g.passed ? h('span', { class: 'met' }, '✅ Đã đạt mục tiêu tuần. ') : null,
      g.lessonsLeft > 0 ? `Còn ${g.lessonsLeft} bài; ` : 'Đã học hết bài của tuần; ',
      `mục tiêu tuần ${g.week}: `,
      h('b', {}, g.text),
      ` (${g.who}).`,
    ),
    h('p', { class: 'todo-goal' }, `Tuần này đã học ${days} ngày — nên 4–5 ngày, nghỉ ngày nào cũng được.`),
    h('div', { class: 'todo-meter', 'aria-hidden': 'true' }, h('i', { style: { width: `${pct}%` } })),
  );
}

/**
 * Màn phụ huynh (§8). Trên cùng: "Việc cần làm tối nay" (3 chỗ khó + 1 việc + tiêu chí tuần).
 * Kết quả bố mẹ bấm / trò chơi app chấm / micro chấm vẫn hiển thị TÁCH RIÊNG (§2) nhưng bằng lời thường.
 * Phiên bản, cài đặt, dữ liệu nằm trong mục "Nâng cao" thu gọn.
 */
export function parentScreen(app: App) {
  return (root: HTMLElement) => {
    prefetchLater([reportMod, songEditorMod, micTestMod]);
    const store = app.store;
    const scroller = h('div', { class: 'parent scrollable' });
    root.append(h('div', { class: 'screen' }, scroller));
    let resetStep = 0;
    let message = '';
    /** Mục "Nâng cao" đang mở (giữ trạng thái khi vẽ lại) */
    let advOpen = false;
    /** Mục "Chi tiết" (bảng theo nốt / lượt chơi) đang mở */
    let detailsOpen = false;
    const ux = () => store.settings as Readonly<ParentUxSettings>;
    const setUx = (patch: Partial<ParentUxSettings>) => store.updateSettings(patch as Partial<Settings>);

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

    const render = () => {
      const top = scroller.scrollTop;
      scroller.replaceChildren(...build(store.get()));
      scroller.scrollTop = top;
    };
    const say = (m: string) => {
      message = m;
      render();
    };

    /** "📝 Bài bố mẹ thêm" (2026-10-06): thêm / sửa / xóa bài bố mẹ tự nhập — chỉ lưu trên iPad này. */
    const parentSongsCard = (): HTMLElement => {
      const openEditor = (id: string | null) =>
        app.show(songEditorScreen(app, id ? store.findParentSong(id) ?? null : null, { onDone: () => app.show(parentScreen(app)) }));
      const list = [...store.parentSongs()].sort((a, b) => b.createdAt - a.createdAt);
      return h(
        'section',
        { class: 'card' },
        h('h2', {}, '📝 Bài bố mẹ thêm'),
        h(
          'p',
          { class: 'muted' },
          'Con thích bài nào mà app chưa có (cả bài thiếu nhi mới)? Bố mẹ gõ nốt Đô Rê Mi hoặc chạm phím — app tự ghi số ngón, bé tập như bài thường. ',
          h('b', {}, PRIVACY_NOTE),
        ),
        button({ icon: '📝', label: 'Thêm bài hát', kind: 'primary', onTap: () => openEditor(null) }),
        list.length
          ? h(
              'ul',
              { class: 'psong-list' },
              ...list.map((c) => {
                const t = parentSongToTune(c);
                return h(
                  'li',
                  { class: 'psong-item' },
                  h('span', { class: 'psong-name' }, c.title, h('span', { class: 'psong-meta' }, `${measureCount(t)} ô nhịp · nhịp ${c.timeSignature} · tốc độ ${c.bpm}`)),
                  button({ icon: '▶', label: 'Chơi thử', kind: 'mint', onTap: () => playSong(app, t) }),
                  button({ icon: '✏️', label: 'Sửa', onTap: () => openEditor(c.id) }),
                  button({
                    icon: '🗑️',
                    label: 'Xóa',
                    kind: 'danger',
                    onTap: () =>
                      confirmDialog({
                        title: `Xóa “${c.title}”?`,
                        text: 'Bài sẽ biến mất khỏi Thư viện (các lượt bé đã chơi vẫn giữ trong lịch sử). Sao lưu dữ liệu trước nếu muốn giữ.',
                        okLabel: 'Xóa bài',
                        okIcon: '🗑️',
                        danger: true,
                        onOk: () => {
                          store.deleteParentSong(c.id);
                          say(`Đã xóa bài “${c.title}”.`);
                        },
                      }),
                  }),
                );
              }),
            )
          : null,
      );
    };

    const build = (d: Readonly<AppData>): HTMLElement[] => {
      const now = new Date();
      const monday = localDateStr(mondayOf(now));
      const week = d.progress.currentWeek;
      const plan = weekPlan(week);
      const sessionsThisWeek = d.sessions.filter((s) => s.date >= monday && !isEmptySession(s));
      const latest: Session | null = store.latestSession();

      // 7 ngày gần nhất
      const days: (string | number)[][] = [];
      for (let i = 6; i >= 0; i--) {
        const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = localDateStr(x);
        const pd = d.progress.practiceDays[key];
        days.push([fmtDate(key), pd?.minutes ?? 0, pd?.stars ? '★'.repeat(Math.min(pd.stars, 9)) : '—']);
      }

      // Bảng tổng hợp theo nốt (PARENT / APP / MIC) + "Kỹ năng của con" — TỪ ĐẦU, kể cả các buổi đã gộp vào lịch sử
      const { pAgg, aAgg, micAgg, skills } = parentStats(d);

      // Điểm từng lượt chơi (các buổi còn giữ)
      const games: (string | number)[][] = [];
      d.sessions.forEach((s) => {
        if (!s.appAssessments.length) return;
        games.push([fmtDate(s.date), lessonName(s.lessonId, d), `${s.appAssessments.filter((a) => a.correct).length}/${s.appAssessments.length}`]);
      });

      const rated = d.sessions.filter((s) => s.selfRating).slice(-10).reverse();


      const set = (patch: Partial<ParentUxSettings>) => {
        store.updateSettings(patch as Partial<Settings>);
        render();
      };

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

      /** 🎤 Cài micro (3 bước) — thẻ nổi bật khi micro đang tắt */
      const micSetupCard = (): HTMLElement | null => {
        if (d.settings.micEnabled || ux().micSetupHidden) return null;
        return h(
          'section',
          { class: 'card mic-setup-card' },
          h('h2', {}, '🎤 Cài micro (3 bước)'),
          h('p', { class: 'muted' }, 'Micro giúp app tự nghe đàn và chấm từng nốt — bố mẹ đỡ phải bấm. Không bắt buộc; xử lý ngay trên iPad, không gửi đi đâu.'),
          h(
            'ol',
            { class: 'mic-steps' },
            h('li', {}, h('b', {}, '1'), 'Cho phép micro'),
            h('li', {}, h('b', {}, '2'), 'Kiểm tra 5 nốt'),
            h('li', {}, h('b', {}, '3'), 'Dùng micro cho các buổi học'),
          ),
          h(
            'div',
            { class: 'row' },
            button({ icon: '🎤', label: 'Bắt đầu cài micro', kind: 'primary', onTap: () => app.show(micTestScreen(app)) }),
            button({ label: 'Để sau', onTap: () => set({ micSetupHidden: true }) }),
            button({ icon: '🩺', label: 'Kiểm tra iPad', onTap: () => app.show(diagnosticsScreen(app)) }),
          ),
        );
      };

      /** 🟢🟡🔴 Sẵn sàng sang tuần mới? + "Ở lại tuần này thêm" + cảnh báo ≥ 14 ngày ở một tuần */
      const readinessCard = (data: Readonly<AppData>, at: Date): HTMLElement => {
        const r = readiness(data, at);
        return h(
          'section',
          { class: `card ready-card ${r.level}` },
          h('p', { class: 'ready-title' }, r.title),
          h('ul', {}, ...r.reasons.map((x) => h('li', {}, x))),
          r.stuck
            ? h(
                'div',
                { class: 'banner warn' },
                `⚠️ Bé đã ở tuần ${week} được ${r.daysOnWeek} ngày. Bình thường thôi nếu bé bận/ốm — nhưng nếu tuần nào cũng thấy khó, hãy tập chậm lại, ôn bài cũ và hỏi người hỗ trợ.`,
              )
            : null,
          h(
            'div',
            { class: 'hold-row' },
            h('span', {}, '⏸ Ở lại tuần này thêm:'),
            segmented(
              [
                { value: 'off', label: 'Không — tự sang tuần mới' },
                { value: 'on', label: `Có — giữ ở tuần ${week}` },
              ],
              r.held ? 'on' : 'off',
              (v) => set({ holdWeek: v === 'on' ? week : null }),
            ),
          ),
          r.held ? h('p', { class: 'muted' }, `App sẽ KHÔNG tự sang tuần mới khi bé đạt mục tiêu — bố mẹ chọn “Không” khi bé sẵn sàng.`) : null,
        );
      };

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
        store.recoveredFromBackup
          ? h('div', { class: 'banner' }, '✅ App đã tự khôi phục tiến độ của bé từ bản sao lưu trong máy (do lỗi cũ khi lên tuần 9).')
          : null,
        store.lastSaveError ? h('div', { class: 'banner warn' }, `Lỗi lưu dữ liệu: ${store.lastSaveError}`) : null,
        micSetupCard(),
        tonightCard(d, now, runPractice),
        readinessCard(d, now),
        h(
          'section',
          { class: 'card tip-card' },
          h('h2', {}, `👪 Tuần ${week}: bố mẹ chú ý`),
          h('p', {}, parentTip(week)),
          whenCorrectBox(),
        ),
        quickTipsCard(),
        installCard(),

        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Tổng quan'),
          h('p', {}, `Tuần hiện tại: `, h('b', {}, `Tuần ${week} — ${plan.title}`)),
          (() => {
            // v5.1: lời tiêu chí ĐẦY ĐỦ (màn của bé chỉ hiện lời ngắn) + tiến độ theo ngày nếu tiêu chí tính theo ngày
            const cp = criterionProgress(week, d);
            return h(
              'p',
              {},
              `Mục tiêu qua tuần: ${plan.criterion.text} (${WHO_TEXT[plan.criterion.who]}) — `,
              weekPassed(week, d) ? '✅ đã đạt' : '⏳ chưa đạt',
              cp && cp.needDays > 0 ? ` · ${Math.min(cp.days, cp.needDays)}/${cp.needDays} ngày` : '',
              plan.kidGoal ? h('span', { class: 'muted' }, ` · Bé thấy: “${plan.kidGoal}”`) : null,
            );
          })(),
          h('p', {}, `Số buổi tuần này (từ thứ Hai ${fmtDate(monday)}): `, h('b', {}, String(sessionsThisWeek.length)), ` · học xong: ${sessionsThisWeek.filter((s) => s.completed).length}`),
          h('h3', {}, 'Phút luyện / ngày (7 ngày)'),
          table(['Ngày', 'Phút', 'Sao'], days),
        ),

        (() => {
          // Kỹ năng của con (mục tiêu: ≈ hết Faber cấp 1 / đầu cấp 2)
          const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
          const mastered = masteredSongs(d);
          return h(
            'section',
            { class: 'card' },
            h('h2', {}, '🎯 Kỹ năng của bé'),
            h('p', {}, `${levelOf(week).name} — ${levelOf(week).goal}`),
            table(
              ['Kỹ năng', 'Kết quả', 'Số lần'],
              [
                ['Tìm đúng nốt trên đàn (bố mẹ / micro)', pct(skills.find.ok, skills.find.all), skills.find.all],
                ['Nghe & đọc nốt (trò chơi)', pct(skills.ear.ok, skills.ear.all), skills.ear.all],
                ['Giữ nhịp cả bài', pct(skills.tempo.ok, skills.tempo.all), skills.tempo.all],
                ['Đọc nhạc ngẫu nhiên', pct(skills.sight.ok, skills.sight.all), skills.sight.all],
              ],
            ),
            h('p', {}, `⭐ Bài đã thuộc: `, h('b', {}, `${mastered.length}/${SONGS.length}`)),
            mastered.length
              ? h('p', { class: 'muted' }, mastered.map((id) => findTune(id)?.titleVi ?? id).join(' · '))
              : h('p', { class: 'muted' }, '"Thuộc" = đàn trọn bài theo nhịp, tốc độ từ 60 trở lên, và đạt.'),
          );
        })(),

        (() => {
          // Bảng theo nốt / từng lượt chơi — thu gọn trong "Chi tiết" (bố mẹ bận chỉ cần các thẻ ở trên)
          const det = h(
            'details',
            { class: 'parent-details' },
            h('summary', {}, '📋 Chi tiết: từng nốt, từng lượt chơi'),
          h(
            'section',
            { class: 'card' },
            h('h2', {}, '👪 Bố mẹ chấm — bé đàn trên đàn thật'),
            h('p', { class: 'muted' }, 'Các lần bố mẹ bấm “Đúng rồi” / “Thử lại” (khi micro tắt, app không nghe đàn).'),
            table(
              ['Nốt / việc', '✓ Đúng rồi', '↻ Thử lại'],
              [...pAgg.entries()].map(([k, v]) => [parentLabel(k), v.c, v.r]),
            ),
          ),

          h(
            'section',
            { class: 'card' },
            h('h2', {}, '📱 Trò chơi tai nghe — app tự chấm'),
            h('p', { class: 'muted' }, 'Bé chạm phím trên iPad nên app biết chính xác bé chọn đúng hay sai.'),
            table(
              ['Nốt app phát', 'Đúng', 'Tổng', '%'],
              [...aAgg.entries()].map(([k, v]) => [parentLabel(k), v.c, v.t, `${Math.round((v.c / v.t) * 100)}%`]),
            ),
            h('h3', {}, 'Từng lượt chơi'),
            table(['Ngày', 'Buổi', 'Điểm'], games.slice(-10).reverse()),
          ),

          h(
            'section',
            { class: 'card' },
            h('h2', {}, '🎤 Micro nghe đàn thật — app tự chấm'),
            h(
              'p',
              { class: 'muted' },
              '"Đúng ngay" = không đàn nhầm phím nào trước đó. "Bố mẹ sửa" = micro nghe nhầm, người lớn đã bấm Sửa.',
            ),
            table(
              ['Nốt', 'Hoàn thành', 'Đúng ngay', '%', 'Bố mẹ sửa'],
              [...micAgg.entries()].map(([k, v]) => [parentLabel(k), v.t, v.first, `${Math.round((v.first / v.t) * 100)}%`, v.over]),
            ),
          ),

          h(
            'section',
            { class: 'card' },
            h('h2', {}, 'Bài hát & nhịp — các lượt chơi'),
            h('p', { class: 'muted' }, '"Ai chấm": 🎤 micro tự chấm từng nốt, 👪 bố mẹ đánh giá cả lượt.'),
            table(
              ['Ngày', 'Bài', 'Chế độ', 'Gợi ý', 'Nhịp', 'Kết quả', 'Ai chấm'],
              d.sessions
                .flatMap((s) => s.songRuns.map((r) => ({ s, r })))
                .slice(-12)
                .reverse()
                .map(({ s, r }) => [
                  fmtDate(s.date),
                  (findTune(r.songId)?.titleVi ?? customTuneTitle(r.songId, d) ?? r.songId) + (r.phrase ? ` (ô ${r.phrase[0] + 1}–${r.phrase[1]})` : ''),
                  MODE_LABEL[r.mode] + (r.level ? ` M${r.level}` : ''),
                  HINT_LABEL[r.hints],
                  r.mode === 'tempo' ? r.bpm : '—',
                  `${r.passed ? '✅' : '⏳'} ${r.source === 'mic' ? `${r.hits}/${r.total}` : ''}`,
                  r.source === 'mic' ? '🎤' : '👪',
                ]),
            ),
          ),

          h(
            'section',
            { class: 'card' },
            h('h2', {}, 'Bé kể: hôm nay thấy thế nào?'),
            h('p', { class: 'muted' }, 'Câu nào bé cũng được 3 sao (thưởng vì học xong buổi) — để bé dám nói thật. “Khó” nhiều buổi liền = nên tập chậm lại.'),
            table(
              ['Ngày', 'Bài', 'Bé chọn'],
              rated.map((s) => [fmtDate(s.date), lessonName(s.lessonId, d), RATING_LABEL[s.selfRating!]]),
            ),
          ),
          );
          det.open = detailsOpen;
          det.addEventListener('toggle', () => (detailsOpen = det.open));
          return det;
        })(),
      ];

      if (latest) {
        sections.push(
          h(
            'section',
            { class: 'card' },
            h('h2', {}, 'Phiếu quan sát — buổi gần nhất'),
            h('p', { class: 'muted' }, `${fmtDate(latest.date)} · ${lessonName(latest.lessonId, d)}`),
            h(
              'div',
              { class: 'checklist' },
              ...CHECKLIST_ITEMS.map((it) => {
                const on = !!latest.checklist[it.key];
                return h(
                  'button',
                  {
                    class: `check${on ? ' on' : ''}`,
                    type: 'button',
                    onClick: () => {
                      store.setChecklist(latest.id, it.key, !on);
                      render();
                    },
                  },
                  on ? '☑ ' : '☐ ',
                  it.label,
                );
              }),
            ),
          ),
          h(
            'section',
            { class: 'card' },
            h('h2', {}, 'Sửa kết quả buổi gần nhất'),
            h('p', { class: 'muted' }, 'Chạm vào một kết quả để đổi Đúng ↔ Thử lại.'),
            latest.parentAssessments.length
              ? h(
                  'div',
                  { class: 'edit-list' },
                  ...latest.parentAssessments.map((a, i) =>
                    h(
                      'button',
                      {
                        class: `edit-item ${a.result}`,
                        type: 'button',
                        onClick: () => {
                          store.setParentAssessment(latest.id, i, a.result === 'correct' ? 'retry' : 'correct');
                          render();
                        },
                      },
                      `${i + 1}. ${parentLabel(a.note)}: ${a.result === 'correct' ? '✓ Đúng' : '↻ Thử lại'}`,
                    ),
                  ),
                )
              : h('p', { class: 'muted' }, 'Buổi này bố mẹ chưa chấm kết quả nào.'),
          ),
        );
      }

      const s = d.settings;
      /** Mục "Nâng cao" (thu gọn): phiên bản, cài đặt, dữ liệu */
      const adv: HTMLElement[] = [];
      adv.push(
        h(
          'section',
          { class: 'card version-card' },
          h('p', {}, 'Phiên bản đang chạy: ', h('b', {}, APP_VERSION)),
          button({
            icon: '🔄',
            label: 'Kiểm tra bản mới',
            onTap: async () => {
              if (!navigator.onLine) return say('iPad đang không có mạng — bật Wi‑Fi rồi thử lại.');
              say('Đang kiểm tra…');
              await checkForUpdate(true);
              await new Promise((r) => setTimeout(r, 5000));
              say(
                isUpdateReady()
                  ? '✅ Đã tải bản mới. Bấm "Về màn của bé" — app sẽ tự khởi động lại bằng bản mới.'
                  : 'Đang dùng bản mới nhất (nếu vừa có bản cập nhật, đợi 1–2 phút rồi thử lại).',
              );
            },
          }),
          button({ icon: '🩺', label: 'Kiểm tra iPad (gửi người hỗ trợ)', onTap: () => app.show(diagnosticsScreen(app)) }),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Cài đặt'),
          h('h3', {}, '🔊 Giọng đọc hướng dẫn'),
          h('p', { class: 'muted' }, 'App đọc to câu hướng dẫn cho bé (bé đọc chậm). Cần giọng tiếng Việt trên iPad: Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt.'),
          h(
            'div',
            { class: 'row' },
            segmented(
              [
                { value: 'on', label: 'Bật' },
                { value: 'off', label: 'Tắt' },
              ],
              s.voice === false ? 'off' : 'on',
              (v) => {
                if (v === 'off') cancelSpeech();
                set({ voice: v === 'on' });
              },
            ),
            button({
              icon: '🔊',
              label: 'Nghe thử',
              onTap: () =>
                hasVietnameseVoice()
                  ? void speak(app, 'Chào con! Mình cùng học đàn nhé.')
                  : toast('iPad chưa có giọng đọc tiếng Việt'),
            }),
          ),
          h('h3', {}, 'Độ dài buổi'),
          segmented(
            [10, 15, 20].map((m) => ({ value: m as 10 | 15 | 20, label: `${m} phút` })),
            s.sessionMinutes,
            (v) => set({ sessionMinutes: v }),
          ),
          h('h3', {}, 'Tự chuyển nốt sau khi bấm "Đúng rồi"'),
          segmented(
            [
              { value: 'off', label: 'Tắt' },
              { value: 'on', label: 'Bật' },
            ],
            s.autoAdvance ? 'on' : 'off',
            (v) => set({ autoAdvance: v === 'on' }),
          ),
          s.autoAdvance
            ? segmented(
                [2, 4, 6, 8, 10].map((n) => ({ value: n, label: `${n} giây` })),
                s.autoAdvanceDelaySec,
                (v) => set({ autoAdvanceDelaySec: v }),
              )
            : null,
          h('h3', {}, `Tuần hiện tại (1–${MAX_WEEK}) — chỉ đổi khi cần`),
          (() => {
            const sel = h('select', { class: 'text-in' }) as HTMLSelectElement;
            for (const w of WEEKS) {
              const o = h('option', { value: String(w.week) }, `${levelOf(w.week).name} · Tuần ${w.week} · ${w.islandEmoji} ${w.island}`);
              if (w.week === week) o.setAttribute('selected', '');
              sel.append(o);
            }
            // Đổi tuần phải xác nhận (chạm nhầm ô chọn = bé nhảy cóc / học lại cả tuần)
            sel.addEventListener('change', () => {
              const to = Number(sel.value);
              sel.value = String(week);
              if (to === week) return;
              confirmDialog({
                title: `Chuyển bé sang tuần ${to}?`,
                text:
                  to > week
                    ? `Bé sẽ bỏ qua bài của tuần ${week}${to > week + 1 ? `–${to - 1}` : ''}. Chỉ nên làm khi bé đã biết những bài đó. Kết quả cũ vẫn giữ.`
                    : `Bé quay lại học tuần ${to}. Kết quả cũ vẫn giữ; app tự sang tuần mới khi bé đạt mục tiêu.`,
                okLabel: `Sang tuần ${to}`,
                onOk: () => {
                  store.setCurrentWeek(to);
                  // "Ở lại tuần" gắn với tuần cũ — bỏ đi để sau này bé không bị giữ im lặng khi tới lại tuần đó
                  if (store.settings.holdWeek != null) store.updateSettings({ holdWeek: null });
                  say(`Đã chuyển sang tuần ${to}.`);
                },
              });
            });
            return sel;
          })(),
          h('h3', {}, '🎤 Nghe đàn bằng micro'),
          h(
            'p',
            { class: 'muted' },
            'App nghe đàn cơ và tự chấm từng nốt. Xử lý ngay trên iPad, không gửi đi đâu; chỉ ghi TẠM khi bé đàn để "🎧 Nghe lại" (rời màn là xóa). Nút "Đúng rồi" của bố mẹ vẫn dùng được. Bật bằng "Cài micro (3 bước)".',
          ),
          h(
            'p',
            { class: 'muted' },
            '🎧 "Nghe lại con đàn": khi micro bật, app giữ TẠM tiếng đàn của lượt vừa chơi để bé bấm nghe lại và tự nhận xét. Bản ghi chỉ nằm trong bộ nhớ — không lưu vào máy, không gửi đi; chơi lượt mới hoặc rời màn là xóa. Micro tắt thì không ghi gì.',
          ),
          h(
            'div',
            { class: 'row' },
            segmented(
              [
                { value: 'off', label: 'Tắt' },
                { value: 'on', label: 'Bật' },
              ],
              s.micEnabled ? 'on' : 'off',
              (v) => (v === 'on' && !s.micEnabled ? app.show(micTestScreen(app)) : set({ micEnabled: v === 'on' })),
            ),
            button({ icon: '🎤', label: s.micEnabled ? 'Thử / chỉnh micro' : 'Cài micro (3 bước)', onTap: () => app.show(micTestScreen(app)) }),
          ),
          s.micEnabled
            ? h(
                'div',
                {},
                h('h3', {}, 'Micro nghe đúng → tự sang nốt sau'),
                segmented(
                  [
                    { value: 'on', label: 'Bật' },
                    { value: 'off', label: 'Tắt' },
                  ],
                  s.micAutoNext ? 'on' : 'off',
                  (v) => set({ micAutoNext: v === 'on' }),
                ),
              )
            : null,
          h('h3', {}, 'Micro chấm nhịp: mức độ'),
          h('p', { class: 'muted' }, 'Dễ = cho phép sớm/muộn nhiều hơn (nên dùng lúc đầu). Khó = gần như chính xác tuyệt đối.'),
          segmented(
            [
              { value: 'easy' as const, label: 'Dễ' },
              { value: 'normal' as const, label: 'Vừa' },
              { value: 'strict' as const, label: 'Khó' },
            ],
            s.timing ?? 'easy',
            (v) => set({ timing: v }),
          ),
          h('h3', {}, 'Nhạc đệm khi đàn theo nhịp ("bố mẹ đàn cùng")'),
          h('p', { class: 'muted' }, 'Khi micro đang bật, nhạc đệm tự tắt để micro nghe rõ tiếng đàn của bé.'),
          segmented(
            [
              { value: 'on', label: 'Bật' },
              { value: 'off', label: 'Tắt' },
            ],
            s.accompaniment ? 'on' : 'off',
            (v) => set({ accompaniment: v === 'on' }),
          ),
          h('h3', {}, `Tay trái — tự bật từ tuần ${LEFT_HAND_WEEK}`),
          segmented(
            [
              { value: 'auto', label: `Tự động (tuần ${LEFT_HAND_WEEK})` },
              { value: 'on', label: 'Bật ngay' },
            ],
            s.leftHandEnabled ? 'on' : 'auto',
            (v) => set({ leftHandEnabled: v === 'on' }),
          ),
          h('h3', {}, 'Giới hạn mỗi ngày (mặc định không giới hạn)'),
          segmented(
            [
              { value: 'none' as const, label: 'Không giới hạn' },
              { value: 15 as const, label: '15 phút' },
              { value: 20 as const, label: '20 phút' },
              { value: 30 as const, label: '30 phút' },
            ],
            s.dailyLimit,
            (v) => set({ dailyLimit: v }),
          ),
          h('h3', {}, 'Tên của bé (hiện ở màn chào)'),
          (() => {
            const input = h('input', { class: 'text-in', type: 'text', value: d.learner.name, maxlength: '20' });
            input.addEventListener('change', () => store.setLearnerName(input.value.trim()));
            return input;
          })(),
        ),
      );

      // Dữ liệu — nhập JSON phải xác nhận trước (thay TOÀN BỘ dữ liệu hiện tại; bản cũ vẫn được lưu dự phòng)
      const doImport = (text: string, force = false) => {
        const r = store.importJSON(text, { force });
        if (r.ok) return say('✅ Đã nhập dữ liệu.');
        // Không cất được bản dự phòng (bộ nhớ đầy) → hỏi lại trước khi ghi đè mà KHÔNG có bản dự phòng
        if ('archiveFailed' in r && r.archiveFailed) {
          return confirmDialog({
            title: 'Không cất được bản dự phòng',
            text: 'Bộ nhớ iPad gần đầy nên không cất được bản dự phòng dữ liệu hiện tại. Nên bấm "💾 Sao lưu" trước. Vẫn nhập và thay dữ liệu?',
            okIcon: '⬆',
            okLabel: 'Vẫn nhập',
            onOk: () => doImport(text, true),
          });
        }
        say(`❌ Không nhập được: ${r.error}`);
      };
      const confirmImport = (text: string) => {
        let incoming: { progress?: { currentWeek?: unknown }; sessions?: unknown } | null = null;
        try {
          incoming = JSON.parse(text);
        } catch {
          return doImport(text); // không phải JSON → importJSON báo lỗi rõ ràng
        }
        const wk = typeof incoming?.progress?.currentWeek === 'number' ? incoming.progress.currentWeek : '?';
        const ns = Array.isArray(incoming?.sessions) ? incoming.sessions.length : '?';
        confirmDialog({
          title: 'Thay dữ liệu?',
          text: `Thay dữ liệu hiện tại (tuần ${d.progress.currentWeek}, ${sessionCount(d)} buổi) bằng dữ liệu nhập (tuần ${wk}, ${ns} buổi)?`,
          okIcon: '⬆',
          okLabel: 'Thay dữ liệu',
          danger: true,
          onOk: () => doImport(text),
        });
      };
      const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden-file' });
      fileIn.addEventListener('change', async () => {
        const f = fileIn.files?.[0];
        if (!f) return;
        const text = await f.text();
        fileIn.value = ''; // chọn lại cùng file vẫn chạy
        confirmImport(text);
      });
      const paste = h('textarea', { class: 'text-in paste', placeholder: 'Hoặc dán nội dung JSON vào đây…' });
      const confirmIn = h('input', { class: 'text-in', type: 'text', placeholder: 'Gõ XOA' });

      adv.push(
        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Dữ liệu'),
          h(
            'p',
            { class: 'muted' },
            'Lưu trữ bền vững: ',
            h('b', {}, app.storagePersisted === true ? 'có' : app.storagePersisted === false ? 'không' : 'chưa rõ'),
            app.storagePersisted === false ? ' — nên thêm app vào Màn hình chính và sao lưu thường xuyên.' : '',
          ),
          h('p', { class: 'muted' }, 'Mọi dữ liệu chỉ nằm trên iPad này. Nên bấm “Sao lưu dữ liệu” mỗi tuần (lưu vào Tệp / Ghi chú).'),
          h(
            'div',
            { class: 'row' },
            button({
              icon: '💾',
              label: 'Sao lưu dữ liệu',
              kind: 'primary',
              onTap: () => void exportBackup(store).then((r) => say(BACKUP_MESSAGE[r])),
            }),
            button({ icon: '⬆', label: 'Nhập từ tệp JSON', onTap: () => fileIn.click() }),
            fileIn,
          ),
          paste,
          button({
            icon: '⬆',
            label: 'Nhập từ chữ đã dán',
            onTap: () => confirmImport(paste.value),
          }),
          h('h3', {}, 'Đặt lại toàn bộ dữ liệu'),
          resetStep === 0
            ? button({
                icon: '🗑️',
                label: 'Đặt lại toàn bộ dữ liệu…',
                kind: 'danger',
                onTap: () => {
                  resetStep = 1;
                  render();
                },
              })
            : h(
                'div',
                { class: 'reset-box' },
                h('p', {}, 'Bước 2/2: Mọi tiến độ và kết quả sẽ bị xóa. Gõ chữ ', h('b', {}, 'XOA'), ' rồi bấm Xóa hẳn.'),
                confirmIn,
                h(
                  'div',
                  { class: 'row' },
                  button({
                    label: 'Hủy',
                    onTap: () => {
                      resetStep = 0;
                      render();
                    },
                  }),
                  button({
                    icon: '🗑️',
                    label: 'Xóa hẳn',
                    kind: 'danger',
                    onTap: () => {
                      if (confirmIn.value.trim().toUpperCase() !== 'XOA') return say('Chưa gõ đúng chữ XOA.');
                      const r = store.resetAll();
                      if (!r.ok && 'archiveFailed' in r && r.archiveFailed) {
                        // Bộ nhớ đầy: không cất được bản dự phòng → hỏi lần nữa trước khi xóa hẳn
                        return confirmDialog({
                          title: 'Không cất được bản dự phòng',
                          text: 'Bộ nhớ iPad gần đầy nên KHÔNG cất được bản dự phòng. Xóa rồi sẽ không lấy lại được. Vẫn xóa hẳn?',
                          okIcon: '🗑️',
                          okLabel: 'Vẫn xóa',
                          onOk: () => {
                            store.resetAll({ force: true });
                            app.show(startScreen(app));
                          },
                        });
                      }
                      app.show(startScreen(app));
                    },
                  }),
                ),
              ),
        ),
        h('p', { class: 'muted foot' }, 'Piano bé · không mạng, không quảng cáo, không thu thập dữ liệu.'),
      );
      const details = h('details', { class: 'adv' }, h('summary', {}, '⚙️ Nâng cao: cài đặt · dữ liệu · phiên bản'), ...adv);
      details.open = advOpen;
      details.addEventListener('toggle', () => (advOpen = details.open));
      sections.push(parentSongsCard(), details);
      return sections.filter((x): x is HTMLElement => !!x);
    };

    render();
  };
}
