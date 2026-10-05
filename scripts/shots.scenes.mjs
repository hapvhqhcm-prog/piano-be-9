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
];
