/**
 * CHỤP MÀN HÌNH TỰ ĐỘNG (chỉ để phát triển): mở Edge chạy ngầm ở kích thước iPad, điều khiển qua
 * Chrome DevTools Protocol (không cần cài thêm gói), chạy từng "cảnh" bằng hook DEV `window.__piano`
 * rồi lưu ảnh PNG.
 *
 *   node scripts/shots.mjs [thư-mục-ra] [lọc-tên]
 *
 * Cần dev server đang chạy (npm run dev → http://localhost:5173/piano-be-9/).
 * Danh sách cảnh: scripts/shots.scenes.mjs (mỗi cảnh = tên + đoạn JS async chạy trong trang).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// SHOTS_SCENES=<tệp .mjs> để dùng danh sách cảnh khác (vd cảnh đo đạc tạm thời)
const { SCENES, SIZES } = await import(
  process.env.SHOTS_SCENES ? pathToFileURL(resolve(process.env.SHOTS_SCENES)).href : './shots.scenes.mjs'
);
const OUT = resolve(process.argv[2] ?? 'shots');
const FILTER = process.argv[3] ?? '';
const URL = process.env.SHOTS_URL ?? 'http://localhost:5173/piano-be-9/';
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// SHOTS_PORT: chạy nhiều phiên chụp cùng lúc thì mỗi phiên một cổng
const PORT = Number(process.env.SHOTS_PORT ?? 9333);

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'piano-shots-'));
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  'about:blank',
]);

/**
 * Tắt CẢ CÂY tiến trình: trên Windows proc.kill() chỉ tắt tiến trình gốc, các tiến trình con của Edge chạy ngầm
 * còn sót lại (2026-10-07 dồn tới 58 Edge ngầm ngốn CPU). Cũng chạy khi script bị dừng giữa chừng.
 */
function killTree(p) {
  if (p && p.exitCode === null && p.pid) {
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else p.kill('SIGKILL');
    } catch {
      /* bỏ qua */
    }
  }
  // Edge trên Windows chạy qua tiến trình trung gian rồi tách ra → tắt mọi Edge đang dùng ĐÚNG thư mục hồ sơ tạm này
  if (process.platform === 'win32' && p === edge && typeof profile === 'string') killEdgeProfile(profile);
}
let profileKilled = false;
function killEdgeProfile(dir) {
  if (profileKilled) return;
  profileKilled = true;
  const needle = dir.replace(/'/g, "''");
  try {
    spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${needle}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore' },
    );
  } catch {
    /* bỏ qua */
  }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (killTree(edge), process.exit(130)));
process.on('exit', () => killTree(edge));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch {
      /* Edge chưa sẵn sàng */
    }
    await sleep(200);
  }
  throw new Error('Không kết nối được Edge');
}

const ws = new WebSocket(await pageWs());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

await send('Page.enable');
await send('Runtime.enable');
const results = [];
for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  for (const sc of SCENES) {
    if (FILTER && !sc.name.includes(FILTER)) continue;
    if (sc.sizes && !sc.sizes.includes(size.name)) continue;
    // Mỗi cảnh: tải lại trang với dữ liệu sạch → các cảnh không ảnh hưởng nhau
    await evaluate('try { localStorage.clear() } catch {} ; 1').catch(() => undefined);
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 50; i++) {
      await sleep(150);
      if (await evaluate('!!window.__piano').catch(() => false)) break;
    }
    let note = '';
    try {
      note = String((await evaluate(`(async () => { const app = window.__piano; ${sc.js}\n })()`)) ?? '');
      await sleep(sc.wait ?? 500);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const file = join(OUT, `${size.name}-${sc.name}.png`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      results.push(`✓ ${size.name}-${sc.name}${note ? ' — ' + note : ''}`);
    } catch (e) {
      results.push(`✗ ${size.name}-${sc.name}: ${e.message.split('\n')[0]}`);
    }
  }
}
console.log(results.join('\n'));
ws.close();
killTree(edge);
await sleep(300);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* Edge còn giữ file — bỏ qua */
}
process.exit(0);
