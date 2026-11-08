// (+ 2026-11-08) Cảnh chụp: thêm bài ở màn Bài hát + tab "Hai tay: hợp âm". Chạy:
// SHOTS_SCENES=scripts/shots.chords.mjs node scripts/shots.mjs shots-chords
export { SIZES } from './shots.scenes.mjs';

const seed = `
  const { parseSolfege } = await import('/src/music/solfege.ts');
  const { buildParentSong } = await import('/src/practice/parentSongs.ts');
  const r = parseSolfege('Đô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-', 4);
  app.store.addParentSong(buildParentSong(r.notes, { id: 'p1', title: 'Ngôi sao nhỏ hai tay', createdAt: 2, timeSignature: '4/4', bpm: 72, chords: 'C | F C | F C | G C', chordStyle: 'block', text: 'Đô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-' }));
  app.store.addParentSong(buildParentSong(r.notes, { id: 'p2', title: 'Bài một tay', createdAt: 1, timeSignature: '4/4', bpm: 72 }));`;

export const SCENES = [
  { name: 'lib-empty', wait: 600, js: `const m = await import('/src/ui/screens/library.ts'); app.show(m.libraryScreen(app));` },
  { name: 'lib-songs', wait: 600, js: `${seed} const m = await import('/src/ui/screens/library.ts'); app.show(m.libraryScreen(app));` },
  {
    name: 'editor-chords',
    wait: 1200,
    js: `${seed} const m = await import('/src/ui/screens/songEditor.ts');
      app.show(m.songEditorScreen(app, app.store.findParentSong('p1'), { onDone() {} }));
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('[data-test=chord-tab]').click();`,
  },
  {
    name: 'editor-auto',
    wait: 1200,
    js: `${seed} const m = await import('/src/ui/screens/songEditor.ts');
      app.show(m.songEditorScreen(app, app.store.findParentSong('p2'), { onDone() {} }));
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('[data-test=chord-tab]').click();
      await new Promise((r) => setTimeout(r, 300));
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('App tự chọn')).click();`,
  },
  {
    name: 'song-both',
    wait: 1500,
    js: `${seed} const { parentSongToTune } = await import('/src/practice/parentSongs.ts'); const l = await import('/src/ui/screens/library.ts');
      l.playSong(app, parentSongToTune(app.store.findParentSong('p1')));`,
  },
];
