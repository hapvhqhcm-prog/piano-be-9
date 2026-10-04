# Giấy phép & nguồn gốc nội dung

## Mã nguồn

Mã nguồn app do dự án tự viết, dùng riêng cho gia đình (OWNER: Phan Hà).

## Thư viện

- **Runtime: 0 thư viện.** Bundle chỉ chứa mã của dự án.
- Công cụ phát triển (không đóng gói vào app):
  - Vite — MIT
  - Vitest — MIT
  - TypeScript — Apache-2.0

## Âm thanh

- Phase 1–2: âm thanh tổng hợp bằng Web Audio `OscillatorNode` (sóng tam giác + envelope ADSR),
  không dùng file ghi âm nào.
- Phase 3 (chưa làm): dự kiến dùng *Salamander Grand Piano* (Alexander Holm) — **CC-BY 3.0**.
  Khi thêm sẽ ghi attribution đầy đủ tại đây và chỉ đóng gói các sample cần thiết C3–C5 vào app.

## Nhận cao độ qua micro

Thuật toán YIN (A. de Cheveigné & H. Kawahara, J. Acoust. Soc. Am. 111(4), 2002) — tự cài đặt lại
trong `src/audio/pitchDetect.ts`, không dùng thư viện ngoài. Âm thanh micro chỉ được phân tích trong bộ nhớ,
không lưu, không gửi đi.

## Bài hát (`src/data/songs/`)

Tất cả giai điệu thuộc **public domain**. Bản phối 5 ngón là bản tự soạn đơn giản cho app này;
không dùng bản phối, bản thu âm hay file MIDI nào của bên ngoài.

| id | Giai điệu | Tình trạng |
|---|---|---|
| `ode_to_joy_easy` | Ludwig van Beethoven, Giao hưởng số 9 (1824) — chủ đề "Ode to Joy" | Public domain |
| `frere_jacques_easy` | "Frère Jacques", dân ca Pháp (thế kỷ 18) | Public domain |
| `twinkle_easy` | "Ah! vous dirai-je, maman", giai điệu dân gian Pháp (thế kỷ 18) | Public domain |

Chỉ hiển thị tên bài; không dùng lời bài hát có bản quyền.

## Icon

Icon (`public/icons/`) được sinh bằng `scripts/make-icons.mjs` — tự vẽ, không dùng tài nguyên ngoài.
Font: font hệ thống của thiết bị, không tải font ngoài.
