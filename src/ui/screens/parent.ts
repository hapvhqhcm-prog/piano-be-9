import { MAX_WEEK, PHASE1_WEEKS, findLesson, weekPassed, weekPlan } from '../../lessons/lessonEngine';
import { RATING_STARS, isEmptySession } from '../../progress/ProgressStore';
import { CHECKLIST_ITEMS, localDateStr, type AppData, type Session, type Settings } from '../../progress/schema';
import type { App } from '../App';
import { button, h } from '../components/dom';
import { homeScreen } from './home';
import { micTestScreen } from './micTest';
import { APP_VERSION, checkForUpdate, isUpdateReady } from '../../pwa/updater';
import { startScreen } from './start';

const RATING_LABEL = { all: '😄 Đánh được hết', some: '🙂 Còn vấp vài chỗ', hard: '😅 Khó quá' } as const;

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Thứ 2 = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function lessonName(id: string): string {
  const l = findLesson(id);
  return l ? `${l.emoji} ${l.title}` : id;
}

function table(head: string[], rows: (string | number)[][]): HTMLElement {
  if (rows.length === 0) return h('p', { class: 'muted' }, 'Chưa có dữ liệu');
  return h(
    'table',
    { class: 'tbl' },
    h('thead', {}, h('tr', {}, ...head.map((c) => h('th', {}, c)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, String(c)))))),
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

/** Màn phụ huynh (§8). PARENT và APP hiển thị TÁCH RIÊNG (§2). */
export function parentScreen(app: App) {
  return (root: HTMLElement) => {
    const store = app.store;
    const scroller = h('div', { class: 'parent scrollable' });
    root.append(h('div', { class: 'screen' }, scroller));
    let resetStep = 0;
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
          button({ icon: '←', label: 'Về màn của bé', kind: 'primary', onTap: () => app.show(homeScreen(app)) }),
        ),
        message ? h('div', { class: 'banner' }, message) : null,
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
        store.lastSaveError ? h('div', { class: 'banner warn' }, `Lỗi lưu dữ liệu: ${store.lastSaveError}`) : null,

        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Tổng quan'),
          h('p', {}, `Tuần hiện tại: `, h('b', {}, `Tuần ${week} — ${plan.title}`)),
          h('p', {}, `Tiêu chí qua tuần: ${plan.criterion.text} (${plan.criterion.who}) — `, weekPassed(week, d) ? '✅ đã đạt' : '⏳ chưa đạt'),
          h('p', {}, `Số buổi tuần này (từ ${monday}): `, h('b', {}, String(sessionsThisWeek.length)), ` · hoàn thành: ${sessionsThisWeek.filter((s) => s.completed).length}`),
          h('h3', {}, 'Phút luyện / ngày (7 ngày)'),
          table(['Ngày', 'Phút', 'Sao'], days),
        ),

        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Bé đánh trên đàn thật — phụ huynh xác nhận'),
          h('p', { class: 'muted' }, 'PARENT_ASSESSMENT: app KHÔNG nghe đàn. Đây chỉ là nút bố/mẹ đã bấm.'),
          table(
            ['Nốt / việc', '✓ Đúng rồi', '↻ Thử lại'],
            [...pAgg.entries()].map(([k, v]) => [k, v.c, v.r]),
          ),
        ),

        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Trò chơi tai nghe — app tự chấm'),
          h('p', { class: 'muted' }, 'APP_ASSESSMENT: bé chạm phím ảo trên iPad, app biết chính xác phím nào.'),
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
          h('h2', {}, 'Micro nghe đàn thật — app tự chấm'),
          h(
            'p',
            { class: 'muted' },
            'MIC_ASSESSMENT: khi micro bật, app nghe đàn cơ. "Đúng ngay" = không đàn nhầm phím nào trước đó. "Bố mẹ sửa" = micro nghe nhầm, người lớn đã bấm Sửa.',
          ),
          table(
            ['Nốt', 'Hoàn thành', 'Đúng ngay', '%', 'Bố mẹ sửa'],
            [...micAgg.entries()].map(([k, v]) => [k, v.t, v.first, `${Math.round((v.first / v.t) * 100)}%`, v.over]),
          ),
        ),

        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Bé tự đánh giá'),
          table(
            ['Ngày', 'Bài', 'Bé chọn', 'Sao'],
            rated.map((s) => [s.date, lessonName(s.lessonId), RATING_LABEL[s.selfRating!], '★'.repeat(RATING_STARS[s.selfRating!])]),
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
      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Cài đặt'),
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
          h('h3', {}, 'Tuần hiện tại (Phase 1: tuần 1–' + MAX_WEEK + ')'),
          segmented(
            PHASE1_WEEKS.map((w) => ({ value: w.week, label: `Tuần ${w.week}` })),
            week,
            (v) => {
              store.setCurrentWeek(v);
              render();
            },
          ),
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
          h('h3', {}, 'Tay trái — mở ở Phase 3 (tuần 6)'),
          segmented([{ value: 'off', label: 'Chưa kích hoạt' }], 'off', () => undefined, true),
          h('h3', {}, 'Giới hạn mỗi ngày — Phase 3'),
          segmented([{ value: 'none', label: 'Không giới hạn' }], 'none', () => undefined, true),
          h('h3', {}, 'Tên của bé (hiện ở màn chào)'),
          (() => {
            const input = h('input', { class: 'text-in', type: 'text', value: d.learner.name, maxlength: '20' });
            input.addEventListener('change', () => store.setLearnerName(input.value.trim()));
            return input;
          })(),
        ),
      );

      // Dữ liệu
      const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden-file' });
      fileIn.addEventListener('change', async () => {
        const f = fileIn.files?.[0];
        if (!f) return;
        const r = store.importJSON(await f.text());
        say(r.ok ? '✅ Đã nhập dữ liệu.' : `❌ Không nhập được: ${r.error}`);
      });
      const paste = h('textarea', { class: 'text-in paste', placeholder: 'Hoặc dán nội dung JSON vào đây…' });
      const confirmIn = h('input', { class: 'text-in', type: 'text', placeholder: 'Gõ XOA' });

      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Dữ liệu'),
          h('p', { class: 'muted' }, 'Mọi dữ liệu chỉ nằm trên iPad này. Nên xuất JSON định kỳ để sao lưu.'),
          h(
            'div',
            { class: 'row' },
            button({
              icon: '⬇',
              label: 'Xuất JSON',
              onTap: () => {
                const blob = new Blob([store.exportJSON()], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = h('a', { href: url, download: `piano-be-9-${store.today()}.json` });
                document.body.append(a);
                a.click();
                a.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
              },
            }),
            button({
              icon: '📋',
              label: 'Sao chép JSON',
              onTap: async () => {
                try {
                  await navigator.clipboard.writeText(store.exportJSON());
                  say('✅ Đã sao chép JSON.');
                } catch {
                  say('❌ Không sao chép được — hãy dùng "Xuất JSON".');
                }
              },
            }),
            button({ icon: '⬆', label: 'Nhập JSON (file)', onTap: () => fileIn.click() }),
            fileIn,
          ),
          paste,
          button({
            icon: '⬆',
            label: 'Nhập từ chữ đã dán',
            onTap: () => {
              const r = store.importJSON(paste.value);
              say(r.ok ? '✅ Đã nhập dữ liệu.' : `❌ Không nhập được: ${r.error}`);
            },
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
        h('p', { class: 'muted foot' }, 'Piano bé · Phase 1 · không mạng, không quảng cáo, không thu thập dữ liệu.'),
      );
      return sections.filter((x): x is HTMLElement => !!x);
    };

    render();
  };
}
