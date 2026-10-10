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

/**
 * <link rel="preload"> cho phông chữ của màn Bắt đầu (tên file có mã băm → chỉ biết lúc build).
 * Phông được CSS nạp muộn (sau khi tải + phân tích CSS và vẽ chữ lần đầu) → iPad cũ hiện chữ hệ thống rồi "nhảy" chữ.
 */
function preloadStartFonts(patterns: RegExp[]): Plugin {
  return {
    name: 'piano-be-9-font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        return patterns.flatMap((re) => {
          const file = files.find((n) => re.test(n));
          if (!file) throw new Error(`preloadStartFonts: không thấy phông ${re}`);
          return [
            {
              tag: 'link',
              // KHÔNG có `crossorigin`: WebKit (Safari/iPad) nạp phông cùng origin không qua CORS → preload có
              // crossorigin bị bỏ phí và tải phông LẦN 2 (đo bằng Playwright WebKit). Chromium thì ngược lại (chỉ
              // tải trùng 2 file trên Edge/Chrome — không phải máy đích).
              attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `./${file}` },
              injectTo: 'head' as const,
            },
          ];
        });
      },
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
    // (+ 2026-10-10) Số phiên bản package.json (vd "0.21.0") — "🆕 Có gì mới" của bố mẹ (src/pwa/release.ts)
    __RELEASE_VERSION__: JSON.stringify((JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version),
    // Chỉ bản build của kiểm thử WebKit (scripts/webkit-smoke.mjs đặt PIANO_TEST_HOOKS=1): mở window.__piano như bản dev.
    // Bản build thường: hằng false → esbuild bỏ hẳn nhánh này.
    __TEST_HOOKS__: JSON.stringify(process.env.PIANO_TEST_HOOKS === '1'),
  },
  // Đường dẫn tương đối: chạy được ở https://<user>.github.io/<repo>/ lẫn LAN.
  base: './',
  build: {
    // iPad cũ (A9/A10 kẹt ở iPadOS 15/16): esbuild hạ cấp CÚ PHÁP (JS + CSS) xuống Safari 14.
    // API mới (at(), findLast, structuredClone, regex lookbehind…) KHÔNG hạ cấp được → `npm run compat` canh.
    target: ['safari14', 'es2020'],
    assetsInlineLimit: 0,
  },
  // ~95 bài hát JSON nằm trong chunk chính (tune.ts glob eager): JSON.parse("…") phân tích nhanh hơn nhiều so với
  // object literal JS trên iPad cũ (đo: compile+evaluate giảm ~30%). import mặc định vẫn y nguyên.
  json: { stringify: true, namedExports: false },
  // Màn Bắt đầu: tiêu đề Baloo 2 800 + chữ thường Nunito 600 (bộ Latin — lớn nhất; bộ tiếng Việt nhỏ, nạp theo CSS)
  plugins: [
    preloadStartFonts([/baloo-2-latin-800-normal-[\w-]+\.woff2$/, /nunito-latin-600-normal-[\w-]+\.woff2$/]),
    serviceWorkerPlugin(),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
