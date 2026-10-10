/**
 * (+ 2026-10-10) Số phiên bản phát hành (package.json "version", vd "0.21.0") — khác APP_VERSION (ngày build · mã git).
 * Dùng cho "🆕 Có gì mới" của bố mẹ (settings.lastSeenVersion). vite.config.ts chèn hằng __RELEASE_VERSION__.
 */
export const RELEASE_VERSION: string = typeof __RELEASE_VERSION__ === 'string' ? __RELEASE_VERSION__ : '0.0.0';
