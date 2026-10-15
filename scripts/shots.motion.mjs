/**
 * (2026-10-15) Cảnh chụp cho "Nhân vật & bản đồ sinh động hơn": bản đồ (tuần 4 bé thật, tuần 12, tuần 31; chấm đường đi
 * đang chạy / đã xong; thẻ đảo), bảng trạng thái Bé Nốt, các khung cảnh cập bến (thuyền / máy bay).
 *
 *   SHOTS_SCENES=scripts/shots.motion.mjs node scripts/shots.mjs <thư-mục-ra> [lọc]
 */
import { SIZES } from './shots.scenes.mjs';
export { SIZES };

const w4child = `const fx = await import('/tests/fixtures/week4Child.ts'); app.store.importJSON(JSON.stringify(fx.fixtureWeek4Child(new Date())), { force: true }); app.store.recoveredFromMirror = false;
  app.store.updateSettings({ cosmetics: { outfit: 'cap', seen: ['outfit:cap', 'timbre:musicbox', 'backing:march'] } });`;
/** Bản đồ ở tuần `w`; `seen` = tuần lần trước bé thấy (null = lần đầu → không chạy chấm). */
const home = (setup, seen) => `${setup}
  try { ${seen === null ? `localStorage.removeItem('piano-be-9:map-seen')` : `localStorage.setItem('piano-be-9:map-seen', '${seen}')`} } catch {}
  (await import('/src/ui/celebrationQueue.ts')).celebrations.mark();
  const m = await import('/src/ui/screens/home.ts'); app.show(m.homeScreen(app));`;
const week = (w) => `app.store.setCurrentWeek(${w});`;
const tapIsland = (idx) => `await new Promise((r) => setTimeout(r, 400)); document.querySelectorAll('.island-tap')[${idx}].click();`;

const sheet = `
  const { mascot, MOODS, MOOD_LABEL } = await import('/src/ui/components/mascot.ts');
  const wrap = document.createElement('div');
  wrap.setAttribute('style', 'position:fixed;inset:0;z-index:99;background:#fff8ee;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:10px;font:600 16px Nunito,sans-serif;color:#3d3466;align-content:start');
  const cell = (el, label, cls = '') => { const c = document.createElement('div'); c.className = cls; c.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;gap:0'); c.append(el, label); wrap.append(c); };
  for (const m of MOODS) cell(mascot(m, 140, null), m + ' · ' + MOOD_LABEL[m]);
  cell(mascot('happy', 140, 'crown'), 'happy + vương miện');
  // "Đang nói": lớp bn-speaking (voice.ts gắn lên <html>) — ở đây gắn riêng từng ô để so sánh
  for (const m of ['happy', 'clap', 'point', 'encourage', 'dance', 'think']) cell(mascot(m, 140, null), m + ' · đang nói', 'bn-speaking');
  document.body.append(wrap);
  await new Promise((r) => setTimeout(r, 700));`;

const arrival = (from, to) => `
  const { islandArrival } = await import('/src/ui/components/arrival.ts');
  const e = await import('/src/lessons/lessonEngine.ts'); const p = e.weekPlan(${to});
  app.show((root) => { root.append(islandArrival({ fromWeek: ${from}, toWeek: ${to}, toName: p.island, toEmoji: p.islandEmoji }, () => {})); });`;

export const SCENES = [
  { name: 'map-w4fx', wait: 900, js: home(w4child, null) },
  { name: 'map-w4fx-trail-mid', wait: 1000, js: home(w4child, 3) },
  { name: 'map-w4fx-trail-done', wait: 2600, js: home(w4child, 3) },
  { name: 'map-w12', wait: 2600, js: home(week(12), 11) },
  { name: 'map-w12-card', wait: 700, js: home(week(12), 12) + tapIsland(0) },
  { name: 'map-w12-card-locked', wait: 700, js: home(week(12), 12) + tapIsland(6) },
  { name: 'map-w31', wait: 2600, js: home(week(31), 28) },
  { name: 'map-w31-card', wait: 700, js: home(week(31), 31) + tapIsland(9) },
  { name: 'mascot-sheet', wait: 100, js: sheet },
  ...[200, 900, 1500, 2300].map((t) => ({ name: `arrival-boat-${t}`, wait: t, js: arrival(4, 5) })),
  ...[200, 900, 2300].map((t) => ({ name: `arrival-plane-${t}`, wait: t, js: arrival(10, 11) })),
];
