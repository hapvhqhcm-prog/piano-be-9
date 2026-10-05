/**
 * Các "cảnh" để chụp (scripts/shots.mjs). `js` chạy trong trang (async), có sẵn `app` = window.__piano.
 * Import màn hình bằng đường dẫn nguồn của Vite: await import('/src/ui/screens/xxx.ts').
 * Dữ liệu được xóa trước mỗi cảnh → muốn tuần khác thì app.store.setCurrentWeek(n).
 */
export const SIZES = [
  { name: 'ipad', w: 1080, h: 810 }, // iPad 10.2" ngang
  { name: 'mini', w: 1133, h: 744 }, // iPad mini ngang
];

const hooks = `{ onRun() {}, onDone() {}, onBack() {}, record() {}, onExit() {}, recordMic() {} }`;
const song = (id, opts) => `
  const { findSong } = await import('/src/music/tune.ts');
  const { songScreen } = await import('/src/ui/screens/song.ts');
  app.show(songScreen(app, findSong('${id}'), ${opts}, ${hooks}));`;


/** Dữ liệu mẫu cho Sổ sticker: tuần 12, 6 bài đã thuộc (có dân ca), chuỗi 8 ngày, huy chương cấp 1, trò To/nhỏ. */
const seedStickers = `
  const d = app.store.get(); d.progress.currentWeek = 12;
  const { SONGS } = await import('/src/music/tune.ts');
  const ids = ['ly_cay_da', ...SONGS.slice(0, 5).map((t) => t.id)];
  const base = { parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: [], selfRating: 'all', startedAt: 0, endedAt: 0, minutes: 12, completed: true, checklist: {} };
  for (let i = 0; i < 8; i++) {
    const day = new Date(2026, 8, 1 + i); const date = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
    d.sessions.push({ ...base, id: 'seed' + i, date, lessonId: 'w' + (i < 2 ? 8 : 9) + '-l1',
      songRuns: i === 0 ? ids.map((id) => ({ songId: id, mode: 'tempo', bpm: 64, hints: 'full', total: 20, hits: 19, source: 'parent', passed: true, ts: 0 })) : [],
      parentAssessments: i === 1 ? [{ note: 'medal', result: 'correct', ts: 0 }, ...[0, 1, 2].map((k) => ({ note: 'dyn:loud-soft:' + k, result: 'correct', ts: 0 }))] : [] });
  }`;


/** Màn Từng nốt: chờ tới khi nút có chữ `t` bấm được rồi bấm (âm mẫu / giọng đọc có thể kéo dài). */
const practiceSeg = (targets) => `
  const m = await import('/src/ui/screens/practice.ts');
  const seg = { id: 'x', step: 'B2', title: 'Nhà của Đô', intro: 'Đô ở bên trái hai phím đen', targets: ${targets} };
  app.show(m.practiceScreen(app, seg, { record() {}, recordMic() {}, amendLast() {}, onComplete() {}, onExit() {} }));
  const tap = async (t) => { for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 150));
    const b = [...document.querySelectorAll('.actions button')].find((x) => x.textContent.includes(t) && !x.disabled); if (b) { b.click(); return; } } };`;
const W1 = `(await import('/src/lessons/lessonEngine.ts')).lessonNoteTargets((await import('/src/lessons/lessonEngine.ts')).weekPlan(2).lessons[0]).slice(0, 5)`;

/** Dữ liệu cho màn Phụ huynh: vài buổi gần đây có nốt hay vấp, micro nghe nhầm, bài chưa đạt. */
const seedParent = `
  const d = app.store.get(); d.progress.currentWeek = 3;
  const today = new Date(); const ds = (k) => { const x = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const base = { appAssessments: [], micAssessments: [], songRuns: [], selfRating: 'hard', startedAt: 0, endedAt: 0, minutes: 12, completed: true, checklist: {} };
  const pa = (note, result) => ({ note, result, ts: 0 });
  d.sessions.push({ ...base, id: 'p1', date: ds(1), lessonId: 'w3-l1', parentAssessments: [pa('F4', 'retry'), pa('F4', 'retry'), pa('F4', 'retry'), pa('G4', 'retry'), pa('C4', 'correct')] });
  d.sessions.push({ ...base, id: 'p2', date: ds(2), lessonId: 'w3-l2', selfRating: 'some', parentAssessments: [pa('G4', 'retry')],
    micAssessments: [{ expected: 'E4', firstHeard: 'F4', firstTry: false, wrongCount: 2, ts: 0 }],
    songRuns: [{ songId: 'mary_lamb', mode: 'tempo', bpm: 60, hints: 'full', total: 20, hits: 12, source: 'mic', passed: false, ts: 0 }] });
  app.store.recomputePracticeDays();`;

export const SCENES = [
  { name: 'start', js: `` },
  { name: 'home-w1', js: `const m = await import('/src/ui/screens/home.ts'); app.show(m.homeScreen(app));` },
  {
    name: 'home-w12',
    js: `app.store.setCurrentWeek(12); const m = await import('/src/ui/screens/home.ts'); app.show(m.homeScreen(app));`,
  },
  {
    name: 'library-w12',
    js: `app.store.setCurrentWeek(12); const m = await import('/src/ui/screens/library.ts'); app.show(m.libraryScreen(app));`,
  },
  {
    name: 'session-w1',
    js: `const e = await import('/src/lessons/lessonEngine.ts'); const s = await import('/src/ui/screens/session.ts');
         s.startSession(app, e.weekPlan(1).lessons[0]);`,
  },
  {
    name: 'session-w5',
    js: `app.store.setCurrentWeek(5); const e = await import('/src/lessons/lessonEngine.ts'); const s = await import('/src/ui/screens/session.ts');
         s.startSession(app, e.weekPlan(5).lessons[0]);`,
  },
  { name: 'song-ode-both', js: song('ode_to_joy_both', `{ mode: 'wait', hints: 'full', free: true }`) },
  { name: 'song-silent-night', js: song('silent_night', `{ mode: 'wait', hints: 'names' }`) },
  { name: 'song-robot', js: song('robot_march', `{ mode: 'tempo', level: 3, hints: 'staff' }`) },
  {
    name: 'dynamics',
    js: `const d = await import('/src/ui/screens/dynamics.ts');
         app.show(d.dynamicsScreen(app, { title: 'To và nhỏ', intro: 'Sư tử gầm TO, chuột kêu NHỎ!', mode: 'loud-soft',
           rounds: [{ pitches: ['C4', 'D4', 'E4'], want: 'f', fingers: [1, 2, 3], hand: 'RH' }], ${hooks.slice(1)}));
         await new Promise((r) => setTimeout(r, 200));
         [...document.querySelectorAll('.actions button')].find((b) => b.textContent.includes('Bắt đầu'))?.click();`,
  },
  {
    name: 'rhythm',
    js: `const r = await import('/src/ui/screens/rhythm.ts');
         app.show(r.rhythmScreen(app, { title: 'Nhịp', intro: 'Vỗ theo nhé', patterns: [['walk', 'run', 'long']], ${hooks.slice(1)}));
         await new Promise((x) => setTimeout(x, 200));
         [...document.querySelectorAll('.actions button')].pop()?.click();`,
  },
  { name: 'freeplay', js: `const m = await import('/src/ui/screens/freePlay.ts'); app.show(m.freePlayScreen(app));` },
  { name: 'parent', js: `const m = await import('/src/ui/screens/parent.ts'); app.show(m.parentScreen(app));` },
  { name: 'mictest', js: `const m = await import('/src/ui/screens/micTest.ts'); app.show(m.micTestScreen(app));` },
  {
    name: 'practice-note',
    js: `const e = await import('/src/lessons/lessonEngine.ts'); const m = await import('/src/ui/screens/practice.ts');
         const seg = { id: 'x', step: 'B2', title: 'Nhà của Đô', intro: 'Đô ở bên trái hai phím đen', targets: e.lessonNoteTargets(e.weekPlan(1).lessons[1]).slice(0, 5) };
         app.show(m.practiceScreen(app, seg, { record() {}, recordMic() {}, amendLast() {}, onComplete() {}, onExit() {} }));
         const click = async (t) => { await new Promise((r) => setTimeout(r, 250)); [...document.querySelectorAll('.actions button')].find((b) => b.textContent.includes(t))?.click(); };
         await click('Tiếp'); await click('Bắt đầu'); await new Promise((r) => setTimeout(r, 900));`,
  },
  {
    name: 'practice-intro',
    js: `const e = await import('/src/lessons/lessonEngine.ts'); const m = await import('/src/ui/screens/practice.ts');
         const seg = { id: 'x', step: 'B2', title: 'Nhà của Đô', intro: 'Đô ở bên trái hai phím đen', targets: e.lessonNoteTargets(e.weekPlan(1).lessons[1]).slice(0, 5) };
         app.show(m.practiceScreen(app, seg, { record() {}, recordMic() {}, amendLast() {}, onComplete() {}, onExit() {} }));`,
  },
  {
    name: 'quiz-updown',
    js: `const m = await import('/src/ui/screens/ear.ts');
         app.show(m.quizScreen(app, { title: 'Lên hay xuống?', intro: 'Nghe 2 nốt rồi chọn', quiz: { variant: 'updown', pool: ['C4','D4','E4','F4','G4'], rounds: 5 }, onAnswer() {}, onDone() {}, onBack() {} }));
         await new Promise((r) => setTimeout(r, 250)); [...document.querySelectorAll('.actions button')].pop()?.click(); await new Promise((r) => setTimeout(r, 400));`,
  },
  {
    name: 'quiz-read',
    js: `const m = await import('/src/ui/screens/ear.ts');
         app.show(m.quizScreen(app, { title: 'Đọc nốt', intro: 'Nhìn nốt rồi chạm phím', quiz: { variant: 'read', pool: ['C4','D4','E4','F4','G4'], rounds: 5 }, onAnswer() {}, onDone() {}, onBack() {} }));
         await new Promise((r) => setTimeout(r, 250)); [...document.querySelectorAll('.actions button')].pop()?.click(); await new Promise((r) => setTimeout(r, 400));`,
  },
  {
    name: 'rating',
    js: `const m = await import('/src/ui/screens/rating.ts'); app.show(m.ratingScreen(app, { onRate() {}, onDone() {}, onBack() {} }));`,
  },
  {
    name: 'rating-stars',
    js: `const m = await import('/src/ui/screens/rating.ts'); app.show(m.ratingScreen(app, { onRate() {}, onDone() {}, onBack() {} }));
         await new Promise((r) => setTimeout(r, 200)); document.querySelector('.rating-options button')?.click(); await new Promise((r) => setTimeout(r, 2500));`,
  },
  {
    name: 'teach',
    js: `const m = await import('/src/ui/screens/teach.ts'); app.show(m.teachScreen(app, { emoji: '🏠', text: 'Chỉ cho bố mẹ: Đô ở đâu trên đàn?', onDone() {}, onSkip() {}, onBack() {} }));`,
  },
  {
    name: 'session-end',
    js: `const m = await import('/src/ui/screens/sessionEnd.ts'); app.show(m.sessionEndScreen(app, { banner: '🏅 Con đã qua Đảo Phím Đen! Chặng tiếp: 🏠 Nhà Đô.', onReplay() {}, onHome() {} }));
         await new Promise((r) => setTimeout(r, 3000));`,
  },
  {
    name: 'stage',
    js: `app.store.setCurrentWeek(8); const m = await import('/src/ui/screens/stage.ts'); app.show(m.stageScreen(app, { level: 1, onRun() {}, onMedal() {}, onDone() {}, onBack() {} }));`,
  },
  { name: 'gate', js: `const m = await import('/src/ui/screens/parentGate.ts'); app.show(m.parentGateScreen(app));` },
  {
    name: 'song-opts',
    js: `${song('ode_to_joy_both', `{ mode: 'tempo', hints: 'full', free: true }`).trim()}
         await new Promise((r) => setTimeout(r, 200)); document.querySelector('.opts-toggle')?.click(); await new Promise((r) => setTimeout(r, 300));`,
  },
  { name: 'song-session', js: song('mary_lamb', `{ mode: 'wait', hints: 'full', intro: 'Bài mới tuần này!' }`) },
  {
    name: 'dialog',
    js: `const m = await import('/src/ui/screens/parent.ts'); app.show(m.parentScreen(app));
         const d = await import('/src/ui/components/dom.ts');
         d.confirmDialog({ title: 'Thay dữ liệu?', text: 'Thay dữ liệu hiện tại (tuần 3, 12 buổi) bằng dữ liệu nhập (tuần 5, 20 buổi)?', okIcon: '⬆', okLabel: 'Thay dữ liệu', danger: true, onOk() {} });`,
  },
  {
    name: 'home-goalmet',
    js: `const s = app.store; s.setCurrentWeek(2); const m = await import('/src/ui/screens/home.ts'); app.show(m.homeScreen(app, '🏅 Con đã qua Đảo Phím Đen! Chặng tiếp: 🏠 Nhà Đô.'));`,
  },
  {
    name: 'onboarding-1',
    js: `const o = await import('/src/ui/screens/onboarding.ts'); app.show(o.onboardingScreen(app, { onDone() {} }));`,
  },
  ...[2, 3, 4].map((n) => ({
    name: `onboarding-${n}`,
    js: `const o = await import('/src/ui/screens/onboarding.ts'); app.show(o.onboardingScreen(app, { onDone() {} }));
         for (let k = 1; k < ${n}; k++) { await new Promise((r) => setTimeout(r, 120)); [...document.querySelectorAll('.actions button')].pop()?.click(); }`,
  })),
  {
    name: 'stickers-empty',
    js: `const m = await import('/src/ui/screens/stickers.ts'); app.show(m.stickersScreen(app));`,
  },
  {
    name: 'stickers',
    js: `${seedStickers} const m = await import('/src/ui/screens/stickers.ts'); app.show(m.stickersScreen(app));`,
  },
  {
    name: 'stickers-scrolled',
    js: `${seedStickers} const m = await import('/src/ui/screens/stickers.ts'); app.show(m.stickersScreen(app));
         await new Promise((r) => setTimeout(r, 200)); document.querySelector('.sticker-wrap').scrollTop = 9999;`,
  },
  {
    name: 'home-stickers',
    js: `${seedStickers} const m = await import('/src/ui/screens/home.ts'); app.show(m.homeScreen(app));`,
  },
  {
    name: 'session-end-sticker',
    js: `const st = await import('/src/lessons/stickers.ts');
         ${seedStickers}
         const before = st.earnedStickerIds(app.store.get()).filter((id) => !['island-11', 'week-1'].includes(id));
         const m = await import('/src/ui/screens/sessionEnd.ts');
         app.show(m.sessionEndScreen(app, { banner: '🏅 Con đã qua Đảo Phím Đen! Chặng tiếp: 🏠 Nhà Đô.', stickersBefore: before, onReplay() {}, onHome() {} }));
         await new Promise((r) => setTimeout(r, 3000));`,
  },
  {
    name: 'session-end-sticker1',
    js: `const st = await import('/src/lessons/stickers.ts'); app.store.setCurrentWeek(2); const before = st.earnedStickerIds(app.store.get());
         app.store.setCurrentWeek(3);
         const m = await import('/src/ui/screens/sessionEnd.ts');
         app.show(m.sessionEndScreen(app, { stickersBefore: before, onReplay() {}, onHome() {} }));
         await new Promise((r) => setTimeout(r, 3000));`,
  },
  {
    name: 'practice-correct',
    js: `${practiceSeg(W1)} await tap('Tiếp'); await tap('Bắt đầu'); await tap('Đúng rồi'); await new Promise((r) => setTimeout(r, 300));`,
  },
  {
    name: 'practice-skip',
    js: `${practiceSeg(W1)} await tap('Tiếp'); await tap('Bắt đầu');
         const sel = async (q) => { for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 150)); const b = document.querySelector(q); if (b && !b.disabled) { b.click(); return; } } };
         for (let k = 0; k < 3; k++) { await sel('.actions .btn-retry'); if (k < 2) await sel('.actions .btn-primary'); }
         await new Promise((r) => setTimeout(r, 400));`,
  },
  {
    name: 'practice-lh',
    js: `app.store.setCurrentWeek(6); ${practiceSeg(`[{ noteId: 'C3', title: 'Đô / C', subtitle: 'Đô trầm — tay trái', keys: ['C3'], finger: 5, hand: 'LH', sample: ['C3'] }, { noteId: 'G3', title: 'Sol / G', keys: ['G3'], finger: 1, hand: 'LH', sample: ['G3'] }]`)}
         await tap('Tiếp'); await tap('Bắt đầu'); await new Promise((r) => setTimeout(r, 900));`,
  },
  {
    name: 'parent-todo',
    js: `${seedParent} const m = await import('/src/ui/screens/parent.ts'); app.show(m.parentScreen(app));`,
  },
  {
    name: 'parent-adv',
    js: `${seedParent} const m = await import('/src/ui/screens/parent.ts'); app.show(m.parentScreen(app));
         await new Promise((r) => setTimeout(r, 200)); const det = document.querySelector('details.adv'); det.open = true; det.scrollIntoView();`,
  },
  {
    name: 'home-weekstar',
    js: `const d = app.store.get(); const t = new Date(); const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
         const ds = mon.getFullYear() + '-' + String(mon.getMonth() + 1).padStart(2, '0') + '-' + String(mon.getDate()).padStart(2, '0');
         for (let i = 0; i < 4; i++) d.sessions.push({ id: 'h' + i, date: ds, lessonId: 'w1-l1', parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: [], selfRating: 'all', startedAt: 0, endedAt: 0, minutes: 12, completed: true, checklist: {} });
         app.store.recomputePracticeDays(); const m = await import('/src/ui/screens/home.ts'); app.show(m.homeScreen(app));`,
  },
];
