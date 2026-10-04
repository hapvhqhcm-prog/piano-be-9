// Deploy lên GitHub Pages (nhánh gh-pages): npm run deploy
// Yêu cầu: thư mục này là git repo có remote "origin" trỏ tới repo GitHub của bạn.
// Sau lần đầu: GitHub → Settings → Pages → Source: "Deploy from a branch" → gh-pages / (root).
import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

const run = (cmd, opts = {}) => {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...opts });
};
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

let origin;
try {
  origin = out('git remote get-url origin');
} catch {
  console.error('Chưa có remote "origin". Xem README → mục Deploy.');
  process.exit(1);
}

run('npm test');
run('npm run build');

writeFileSync('dist/.nojekyll', '');
if (existsSync('dist/.git')) rmSync('dist/.git', { recursive: true, force: true });
const stamp = new Date().toISOString();
run('git init -q', { cwd: 'dist' });
run('git checkout -q -b gh-pages', { cwd: 'dist' });
run('git add -A', { cwd: 'dist' });
run(`git commit -q -m "deploy ${stamp}"`, { cwd: 'dist' });
run(`git push -f "${origin}" gh-pages`, { cwd: 'dist' });
rmSync('dist/.git', { recursive: true, force: true });
console.log('\nĐã đẩy lên nhánh gh-pages. Đợi 1–2 phút rồi mở trang GitHub Pages.');
