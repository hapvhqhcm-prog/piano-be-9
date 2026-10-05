import { LEFT_HAND_WEEK, MAX_WEEK, WEEKS, findLesson, levelOf, masteredSongs, weekPassed, weekPlan } from '../../lessons/lessonEngine';
import { SONGS } from '../../music/tune';
import { parentTip } from '../../lessons/parentTips';
import { findTune } from '../../music/exercises';
import { isEmptySession } from '../../progress/ProgressStore';
import { CHECKLIST_ITEMS, localDateStr, type AppData, type Session, type Settings } from '../../progress/schema';
import type { App } from '../App';
import { button, confirmDialog, h, toast } from '../components/dom';
import { homeScreen } from './home';
import { micTestScreen } from './micTest';
import { APP_VERSION, checkForUpdate, isUpdateReady } from '../../pwa/updater';
import { startScreen } from './start';
import { onboardingScreen } from './onboarding';
import { WHO_TEXT, tonightPlan } from './tonight';
import { whenCorrectBox } from '../components/whenCorrect';
import { cancelSpeech, hasVietnameseVoice, speak } from '../../audio/voice';

import { installCard } from '../components/installCard';
import { BACKUP_MESSAGE, exportBackup } from '../../progress/backup';

const RATING_LABEL = { all: '😄 Dễ — đàn được', some: '🙂 Vừa — còn vấp chút', hard: '😅 Khó — cần tập thêm' } as const;

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Thứ 2 = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function lessonName(id: string): string {
  const l = findLesson(id);
  if (l) return `${l.emoji} ${l.title}`;
  const m = /^w\d+-song-(.+)$/.exec(id);
  if (m) return `🎵 ${findTune(m[1])?.titleVi ?? m[1]} (tự chọn)`;
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

/** "Việc cần làm tối nay": 3 chỗ khó (2 tuần) · 1 việc cụ thể · tiêu chí tuần bằng lời thường + tiến độ. */
function tonightCard(d: Readonly<AppData>, now: Date): HTMLElement {
  const t = tonightPlan(d, now);
  const g = t.goal;
  const pct = Math.min(100, Math.round((g.sessionsThisWeek / 4) * 100));
  return h(
    'section',
    { class: 'card todo-card' },
    h('h2', {}, '📝 Việc cần làm tối nay'),
    h('p', { class: 'todo-action' }, t.action),
    t.struggles.length
      ? h(
          'div',
          {},
          h('h3', {}, 'Chỗ bé hay vấp (2 tuần gần đây)'),
          h(
            'ol',
            { class: 'todo-list' },
            ...t.struggles.map((x, i) => h('li', {}, h('b', {}, String(i + 1)), h('span', {}, `${x.label} — vấp ${x.misses} lần`))),
          ),
        )
      : h('p', { class: 'muted' }, 'Chưa thấy chỗ nào bé vấp nhiều trong 2 tuần gần đây. 👍'),
    h(
      'p',
      { class: 'todo-goal' },
      g.passed ? h('span', { class: 'met' }, '✅ Đã đạt mục tiêu tuần. ') : null,
      g.lessonsLeft > 0 ? `Còn ${g.lessonsLeft} bài; ` : 'Đã học hết bài của tuần; ',
      `mục tiêu tuần ${g.week}: `,
      h('b', {}, g.text),
      ` (${g.who}).`,
    ),
    h('p', { class: 'todo-goal' }, `Tuần này đã học ${g.sessionsThisWeek} buổi — nên 4–5 buổi, nghỉ ngày nào cũng được.`),
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
    const store = app.store;
    const scroller = h('div', { class: 'parent scrollable' });
    root.append(h('div', { class: 'screen' }, scroller));
    let resetStep = 0;
    let message = '';
    /** Mục "Nâng cao" đang mở (giữ trạng thái khi vẽ lại) */
    let advOpen = false;

    const render = () => {
      const top = scroller.scrollTop;
      scroller.replaceChildren(...build(store.get()));
      scroller.scrollTop = top;
    };
    const say = (m: string) => {
      message = m;
      render();
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
        days.push([key, pd?.minutes ?? 0, pd?.stars ? '★'.repeat(Math.min(pd.stars, 9)) : '—']);
      }

      // PARENT_ASSESSMENT — tổng hợp theo nốt
      const pAgg = new Map<string, { c: number; r: number }>();
      d.sessions.forEach((s) =>
        s.parentAssessments.forEach((a) => {
          const e = pAgg.get(a.note) ?? { c: 0, r: 0 };
          if (a.result === 'correct') e.c++;
          else e.r++;
          pAgg.set(a.note, e);
        }),
      );

      // APP_ASSESSMENT — tổng hợp theo nốt + điểm từng lượt chơi
      const aAgg = new Map<string, { c: number; t: number }>();
      const games: (string | number)[][] = [];
      d.sessions.forEach((s) => {
        if (!s.appAssessments.length) return;
        s.appAssessments.forEach((a) => {
          const e = aAgg.get(a.expected) ?? { c: 0, t: 0 };
          e.t++;
          if (a.correct) e.c++;
          aAgg.set(a.expected, e);
        });
        games.push([s.date, lessonName(s.lessonId), `${s.appAssessments.filter((a) => a.correct).length}/${s.appAssessments.length}`]);
      });

      const rated = d.sessions.filter((s) => s.selfRating).slice(-10).reverse();

      // MIC_ASSESSMENT — tổng hợp theo nốt
      const micAgg = new Map<string, { t: number; first: number; over: number }>();
      d.sessions.forEach((s) =>
        s.micAssessments.forEach((a) => {
          const e = micAgg.get(a.expected) ?? { t: 0, first: 0, over: 0 };
          e.t++;
          if (a.firstTry && a.parentOverride !== 'retry') e.first++;
          if (a.parentOverride) e.over++;
          micAgg.set(a.expected, e);
        }),
      );

      const set = (patch: Partial<Settings>) => {
        store.updateSettings(patch);
        render();
      };

      const sections: (HTMLElement | null)[] = [
        h(
          'header',
          { class: 'parent-head' },
          h('h1', {}, '👪 Phụ huynh'),
          h(
            'div',
            { class: 'parent-head-actions' },
            button({ icon: '📖', label: 'Hướng dẫn', onTap: () => app.show(onboardingScreen(app, { onDone: () => app.show(parentScreen(app)) })) }),
            button({ icon: '←', label: 'Về màn của bé', kind: 'primary', onTap: () => app.show(homeScreen(app)) }),
          ),
        ),
        message ? h('div', { class: 'banner' }, message) : null,
        store.recoveredFromBackup
          ? h('div', { class: 'banner' }, '✅ App đã tự khôi phục tiến độ của bé từ bản sao lưu trong máy (do lỗi cũ khi lên tuần 9).')
          : null,
        installCard(),
        tonightCard(d, now),
        h(
          'section',
          { class: 'card tip-card' },
          h('h2', {}, `👪 Tuần ${week}: bố mẹ chú ý`),
          h('p', {}, parentTip(week)),
          whenCorrectBox(),
        ),
        // Nhắc sao lưu: dữ liệu chỉ nằm trên iPad
        d.sessions.length >= 3 && Date.now() - (d.settings.lastBackupAt ?? 0) > 14 * 86_400_000
          ? h(
              'div',
              { class: 'banner warn' },
              d.settings.lastBackupAt
                ? `💾 Đã hơn 2 tuần chưa sao lưu tiến độ — mở mục "Nâng cao" ở cuối trang → "Sao lưu dữ liệu".`
                : `💾 Chưa sao lưu lần nào — mở mục "Nâng cao" ở cuối trang → "Sao lưu dữ liệu".`,
            )
          : null,
        store.lastSaveError ? h('div', { class: 'banner warn' }, `Lỗi lưu dữ liệu: ${store.lastSaveError}`) : null,

        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Tổng quan'),
          h('p', {}, `Tuần hiện tại: `, h('b', {}, `Tuần ${week} — ${plan.title}`)),
          h('p', {}, `Mục tiêu qua tuần: ${plan.criterion.text} (${WHO_TEXT[plan.criterion.who]}) — `, weekPassed(week, d) ? '✅ đã đạt' : '⏳ chưa đạt'),
          h('p', {}, `Số buổi tuần này (từ thứ Hai ${monday}): `, h('b', {}, String(sessionsThisWeek.length)), ` · học xong: ${sessionsThisWeek.filter((s) => s.completed).length}`),
          h('h3', {}, 'Phút luyện / ngày (7 ngày)'),
          table(['Ngày', 'Phút', 'Sao'], days),
        ),

        (() => {
          // Kỹ năng hướng tới "thành thạo"
          const pa = d.sessions.flatMap((x) => x.parentAssessments).filter((a) => /^[A-G]/.test(a.note));
          const mic = d.sessions.flatMap((x) => x.micAssessments);
          const findOk = pa.filter((a) => a.result === 'correct').length + mic.filter((a) => a.firstTry).length;
          const findAll = pa.length + mic.length;
          const app2 = d.sessions.flatMap((x) => x.appAssessments);
          const ear = app2.filter((a) => /^[A-G]/.test(a.expected) || ['up', 'down', 'step', 'skip', 'major', 'minor'].includes(a.expected));
          const tempo = d.sessions.flatMap((x) => x.songRuns).filter((r) => r.mode === 'tempo' && !r.phrase);
          const sight = d.sessions.flatMap((x) => x.songRuns).filter((r) => r.songId.startsWith('sight'));
          const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
          const mastered = masteredSongs(d);
          return h(
            'section',
            { class: 'card' },
            h('h2', {}, '🎯 Tiến tới thành thạo'),
            h('p', {}, `${levelOf(week).name} — ${levelOf(week).goal}`),
            table(
              ['Kỹ năng', 'Kết quả', 'Số lần'],
              [
                ['Tìm đúng nốt trên đàn (bố mẹ / micro)', pct(findOk, findAll), findAll],
                ['Nghe & đọc nốt (trò chơi)', pct(ear.filter((a) => a.correct).length, ear.length), ear.length],
                ['Giữ nhịp cả bài', pct(tempo.filter((r) => r.passed).length, tempo.length), tempo.length],
                ['Đọc nhạc ngẫu nhiên', pct(sight.filter((r) => r.passed).length, sight.length), sight.length],
              ],
            ),
            h('p', {}, `⭐ Bài đã thuộc: `, h('b', {}, `${mastered.length}/${SONGS.length}`)),
            mastered.length
              ? h('p', { class: 'muted' }, mastered.map((id) => findTune(id)?.titleVi ?? id).join(' · '))
              : h('p', { class: 'muted' }, '"Thuộc" = đàn trọn bài theo nhịp từ 60 trở lên và đạt.'),
          );
        })(),

        h(
          'section',
          { class: 'card' },
          h('h2', {}, '👪 Bố mẹ chấm — bé đàn trên đàn thật'),
          h('p', { class: 'muted' }, 'Các lần bố mẹ bấm “Đúng rồi” / “Thử lại” (khi micro tắt, app không nghe đàn).'),
          table(
            ['Nốt / việc', '✓ Đúng rồi', '↻ Thử lại'],
            [...pAgg.entries()].map(([k, v]) => [k, v.c, v.r]),
          ),
        ),

        h(
          'section',
          { class: 'card' },
          h('h2', {}, '📱 Trò chơi tai nghe — app tự chấm'),
          h('p', { class: 'muted' }, 'Bé chạm phím trên iPad nên app biết chính xác bé chọn đúng hay sai.'),
          table(
            ['Nốt app phát', 'Đúng', 'Tổng', '%'],
            [...aAgg.entries()].map(([k, v]) => [k, v.c, v.t, `${Math.round((v.c / v.t) * 100)}%`]),
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
            [...micAgg.entries()].map(([k, v]) => [k, v.t, v.first, `${Math.round((v.first / v.t) * 100)}%`, v.over]),
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
                s.date,
                (findTune(r.songId)?.titleVi ?? r.songId) + (r.phrase ? ` (ô ${r.phrase[0] + 1}–${r.phrase[1]})` : ''),
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
            rated.map((s) => [s.date, lessonName(s.lessonId), RATING_LABEL[s.selfRating!]]),
          ),
        ),
      ];

      if (latest) {
        sections.push(
          h(
            'section',
            { class: 'card' },
            h('h2', {}, 'Checklist quan sát — buổi gần nhất'),
            h('p', { class: 'muted' }, `${latest.date} · ${lessonName(latest.lessonId)}`),
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
                      `${i + 1}. ${a.note}: ${a.result === 'correct' ? '✓ Đúng' : '↻ Thử lại'}`,
                    ),
                  ),
                )
              : h('p', { class: 'muted' }, 'Buổi này chưa có kết quả phụ huynh.'),
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
                  : 'Đang dùng bản mới nhất (nếu vừa deploy, đợi 1–2 phút rồi thử lại).',
              );
            },
          }),
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
            sel.addEventListener('change', () => {
              store.setCurrentWeek(Number(sel.value));
              render();
            });
            return sel;
          })(),
          h('h3', {}, '🎤 Nghe đàn bằng micro'),
          h(
            'p',
            { class: 'muted' },
            'App nghe đàn cơ và tự chấm từng nốt. Xử lý ngay trên iPad, không ghi âm, không gửi đi đâu. Nút "Đúng rồi" của bố mẹ vẫn dùng được. Hãy "Thử micro" trước khi bật.',
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
              (v) => set({ micEnabled: v === 'on' }),
            ),
            button({ icon: '🎤', label: 'Thử micro', onTap: () => app.show(micTestScreen(app)) }),
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
      const doImport = (text: string) => {
        const r = store.importJSON(text);
        say(r.ok ? '✅ Đã nhập dữ liệu.' : `❌ Không nhập được: ${r.error}`);
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
          text: `Thay dữ liệu hiện tại (tuần ${d.progress.currentWeek}, ${d.sessions.length} buổi) bằng dữ liệu nhập (tuần ${wk}, ${ns} buổi)?`,
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
            button({ icon: '⬆', label: 'Nhập JSON (file)', onTap: () => fileIn.click() }),
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
                icon: '🗑',
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
                    icon: '🗑',
                    label: 'Xóa hẳn',
                    kind: 'danger',
                    onTap: () => {
                      if (confirmIn.value.trim().toUpperCase() !== 'XOA') return say('Chưa gõ đúng chữ XOA.');
                      store.resetAll();
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
      sections.push(details);
      return sections.filter((x): x is HTMLElement => !!x);
    };

    render();
  };
}
