import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Sinh dist/sw.js với danh sách precache đầy đủ (bundle + public/).
 * Không dùng plugin ngoài — giữ ARCHITECTURE LOCK (0 thư viện runtime).
 */
function serviceWorkerPlugin(): Plugin {
  let publicDir = '';
  let root = '';
  return {
    name: 'piano-be-9-sw',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      publicDir = c.publicDir;
      root = c.root;
    },
    generateBundle(_opts, bundle) {
      const hash = createHash('sha256');
      const files = new Set<string>(['./', 'index.html']);
      for (const [name, item] of Object.entries(bundle)) {
        if (name === 'sw.js') continue;
        files.add(name);
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      if (publicDir) {
        for (const full of listFiles(publicDir)) {
          const rel = relative(publicDir, full).split(sep).join('/');
          files.add(rel);
          hash.update(rel);
          hash.update(readFileSync(full));
        }
      }
      const template = readFileSync(join(root, 'src/pwa/sw-template.js'), 'utf8');
      hash.update(template);
      const version = hash.digest('hex').slice(0, 12);
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify([...files], null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** "2026-10-04 · b6662bb" — để phụ huynh biết iPad đang chạy bản nào. */
function appVersion(): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  try {
    return `${date} · ${execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}`;
  } catch {
    return date;
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  // Đường dẫn tương đối: chạy được ở https://<user>.github.io/<repo>/ lẫn LAN.
  base: './',
  build: {
    // iPad cũ (A9/A10 kẹt ở iPadOS 15/16): esbuild hạ cấp CÚ PHÁP (JS + CSS) xuống Safari 14.
    // API mới (at(), findLast, structuredClone, regex lookbehind…) KHÔNG hạ cấp được → `npm run compat` canh.
    target: ['safari14', 'es2020'],
    assetsInlineLimit: 0,
  },
  plugins: [serviceWorkerPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
