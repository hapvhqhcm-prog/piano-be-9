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
];
