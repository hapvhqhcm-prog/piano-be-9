/**
 * Màn Phụ huynh — các thẻ TIẾN ĐỘ: Tổng quan (tuần, mục tiêu, phút / ngày), 🎯 Kỹ năng của bé, 📋 Chi tiết (bảng theo
 * nốt / lượt chơi), Phiếu quan sát + Sửa kết quả buổi gần nhất.
 */
import { criterionProgress, levelOf, masteredSongs, weekPassed, weekPlan } from '../../lessons/lessonEngine';
import { SONGS } from '../../music/tune';
import { findTune } from '../../music/exercises';
import { isEmptySession } from '../../progress/ProgressStore';
import type { parentStats } from '../../progress/history';
import { CHECKLIST_ITEMS, localDateStr, type AppData, type Session } from '../../progress/schema';
import { h } from '../components/dom';
import { WHO_TEXT } from './tonight';
import { customTuneTitle } from '../../practice/parentSongs';
import { HINT_LABEL, MODE_LABEL, RATING_LABEL, fmtDate, lessonName, mondayOf, parentLabel, table, type ParentCtx } from './parentShared';

type ParentStats = ReturnType<typeof parentStats>;

/** Tổng quan: tuần hiện tại, mục tiêu qua tuần (+ tiến độ theo ngày), số buổi tuần này, phút luyện 7 ngày */
export function overviewCard(d: Readonly<AppData>, now: Date): HTMLElement {
  const monday = localDateStr(mondayOf(now));
  const week = d.progress.currentWeek;
  const plan = weekPlan(week);
  const sessionsThisWeek = d.sessions.filter((s) => s.date >= monday && !isEmptySession(s));

  // 7 ngày gần nhất
  const days: (string | number)[][] = [];
  for (let i = 6; i >= 0; i--) {
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDateStr(x);
    const pd = d.progress.practiceDays[key];
    days.push([fmtDate(key), pd?.minutes ?? 0, pd?.stars ? '★'.repeat(Math.min(pd.stars, 9)) : '—']);
  }

  return h(
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
  );
}

/** 🎯 Kỹ năng của bé (mục tiêu: ≈ hết Faber cấp 1 / đầu cấp 2) */
export function skillsCard(d: Readonly<AppData>, skills: ParentStats['skills']): HTMLElement {
  const week = d.progress.currentWeek;
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
}

/** 📋 Chi tiết: bảng theo nốt / từng lượt chơi — thu gọn (bố mẹ bận chỉ cần các thẻ ở trên) */
export function detailsCard(c: ParentCtx, d: Readonly<AppData>, stats: Pick<ParentStats, 'pAgg' | 'aAgg' | 'micAgg'>): HTMLElement {
  const { pAgg, aAgg, micAgg } = stats;

  // Điểm từng lượt chơi (các buổi còn giữ)
  const games: (string | number)[][] = [];
  d.sessions.forEach((s) => {
    if (!s.appAssessments.length) return;
    games.push([fmtDate(s.date), lessonName(s.lessonId, d), `${s.appAssessments.filter((a) => a.correct).length}/${s.appAssessments.length}`]);
  });

  const rated = d.sessions.filter((s) => s.selfRating).slice(-10).reverse();

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
  det.open = c.ui.detailsOpen;
  det.addEventListener('toggle', () => (c.ui.detailsOpen = det.open));
  return det;
}

/** Phiếu quan sát + "Sửa kết quả" của buổi gần nhất */
export function latestSessionCards(c: ParentCtx, d: Readonly<AppData>, latest: Session): HTMLElement[] {
  const { store } = c;
  return [
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
                c.render();
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
                    c.render();
                  },
                },
                `${i + 1}. ${parentLabel(a.note)}: ${a.result === 'correct' ? '✓ Đúng' : '↻ Thử lại'}`,
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'Buổi này bố mẹ chưa chấm kết quả nào.'),
    ),
  ];
}
