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

- Âm thanh **tổng hợp** bằng Web Audio `OscillatorNode` (3 họa âm + tắt dần giống piano, tiếng gõ nhịp,
  tiếng vỗ tay bằng nhiễu) — không dùng file ghi âm nào.
- OWNER chọn **không** dùng bộ mẫu Salamander (2026-10-04) → không có tài nguyên âm thanh bên ngoài.

## Nhận cao độ qua micro

Thuật toán YIN (A. de Cheveigné & H. Kawahara, J. Acoust. Soc. Am. 111(4), 2002) — tự cài đặt lại
trong `src/audio/pitchDetect.ts`, không dùng thư viện ngoài. Âm thanh micro chỉ được phân tích trong bộ nhớ,
không lưu, không gửi đi.

## Bài hát (`src/data/songs/`)

Tất cả giai điệu thuộc **public domain**. Bản phối 5 ngón là bản tự soạn đơn giản cho app này;
không dùng bản phối, bản thu âm hay file MIDI nào của bên ngoài.

| id | Giai điệu | Tình trạng |
|---|---|---|
| `hot_cross_buns / _lh` | "Hot Cross Buns" — dân ca Anh | Public domain |
| `mary_lamb / _lh` | "Mary Had a Little Lamb" — dân ca Mỹ (thế kỷ 19) | Public domain |
| `au_clair / _lh` | "Au clair de la lune" — dân ca Pháp (thế kỷ 18) | Public domain |
| `go_tell_aunt_rhody` | "Go Tell Aunt Rhody" — dân ca Mỹ | Public domain |
| `lightly_row` | "Lightly Row" (Hänschen klein) — dân ca Đức | Public domain |
| `ode_to_joy_easy` | Ludwig van Beethoven, Giao hưởng số 9 (1824) | Public domain |
| `jingle_bells` | James Lord Pierpont (1857) | Public domain |
| `saints` | "When the Saints Go Marching In" — spiritual (traditional) | Public domain |
| `largo_new_world` | Antonín Dvořák, Giao hưởng "Thế giới mới" (1893) — chỉ giai điệu, không dùng lời | Public domain |
| `frere_jacques_easy` | "Frère Jacques" — dân ca Pháp (thế kỷ 18) | Public domain |
| `london_bridge` | "London Bridge Is Falling Down" — dân ca Anh | Public domain |
| `twinkle_easy` | "Ah! vous dirai-je, maman" — dân ca Pháp (thế kỷ 18) | Public domain |
| `this_old_man` | "This Old Man" — dân ca Anh | Public domain |
| `old_macdonald` | "Old MacDonald Had a Farm" — dân ca Mỹ | Public domain |
| `oh_susanna` | Stephen Foster (1848) | Public domain |

| `*_mc_lh`, `*_both`, `*_g`, `*_d`, `*_minor`, `*_original`, `*_chords` | Các bản phối khác (thế tay, hai tay, giọng thứ…) của những giai điệu trên | Public domain |
| `birthday_both` | Mildred & Patty Hill, "Good Morning to All" (1893) — chỉ giai điệu | Public domain |
| `twinkle_run`, `london_bridge_dotted` | Biến tấu nhịp tự soạn trên giai điệu dân gian | Public domain |
| `joy_to_the_world` | Lowell Mason (1839), theo G. F. Handel | Public domain |
| `silent_night` | Franz Xaver Gruber (1818) | Public domain |
| `minuet_g` | Christian Petzold (khoảng 1725), Minuet Sol trưởng BWV Anh. 114 | Public domain |
| `fur_elise` | Ludwig van Beethoven (1810) | Public domain |
| `canon` | Johann Pachelbel (khoảng 1680) — chủ đề giản lược | Public domain |
| `question_answer`, `waltz_cat`, `waltz_rain`, `scale_c_rh/lh` | Dự án tự sáng tác / bài tập gam truyền thống | Tự soạn |

Bài tập nhịp tuần 4 (`src/music/exercises.ts`), bè đệm (tự sinh từ giai điệu) và các đoạn đọc nhạc ngẫu nhiên
(`src/music/sightread.ts`) do app tự sinh.

Chỉ hiển thị tên bài; không dùng lời bài hát có bản quyền.

## Icon

Icon (`public/icons/`) được sinh bằng `scripts/make-icons.mjs` — tự vẽ, không dùng tài nguyên ngoài.
Font: font hệ thống của thiết bị, không tải font ngoài.
