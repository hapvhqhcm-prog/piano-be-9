/** Phiên bản build (ngày + mã commit), do vite.config.ts chèn vào. */
declare const __APP_VERSION__: string;
/** Số phiên bản package.json (vd "0.21.0"), do vite.config.ts chèn vào. */
declare const __RELEASE_VERSION__: string;
/** true chỉ ở bản build của kiểm thử WebKit (PIANO_TEST_HOOKS=1) — mở móc kiểm thử window.__piano. */
declare const __TEST_HOOKS__: boolean;
