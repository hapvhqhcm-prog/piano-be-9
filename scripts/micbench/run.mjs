// (+ 2026-11-09) Chạy trang so sánh bộ nghe micro (scripts/micbench) trong Edge ngầm, in bảng kết quả.
// Cần dev server: npx vite --port 5173. Chạy: node scripts/micbench/run.mjs [đường-dẫn-trang]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.BENCH_URL ?? `http://localhost:5173/piano-be-9/scripts/micbench/${process.argv[2] ?? 'index.html'}`;
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.BENCH_PORT ?? 9444);
const profile = mkdtempSync(join(tmpdir(), 'piano-bench-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank']);
const kill = () => {
  spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
};
process.on('exit', kill);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch {
    /* chưa sẵn sàng */
  }
  if (!wsUrl) await sleep(200);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.error('[page]', m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.id && pending.has(m.id)) (pending.get(m.id)(m), pending.delete(m.id));
});
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
const t0 = Date.now();
let res = null;
while (!res && Date.now() - t0 < 30 * 60_000) {
  await sleep(2000);
  const r = await send('Runtime.evaluate', { expression: 'window.__bench ?? null', returnByValue: true });
  res = r.result?.result?.value ?? null;
}
if (!res) {
  const r = await send('Runtime.evaluate', { expression: 'document.getElementById("out")?.textContent', returnByValue: true });
  console.log(r.result?.result?.value);
  console.log('HẾT GIỜ');
  process.exit(1);
}
if (res.error) {
  console.log(res.error);
  process.exit(1);
}
console.log('backend', res.backend, JSON.stringify(res.perf));
console.table(res.results);
process.exit(0);
