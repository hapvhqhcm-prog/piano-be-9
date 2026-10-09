# Giấy phép & nguồn gốc nội dung

## Mã nguồn

Mã nguồn app do dự án tự viết, dùng riêng cho gia đình (OWNER: Phan Hà).

## Thư viện

- **Runtime: 0 thư viện.** Bundle chỉ chứa mã của dự án.
- Công cụ phát triển (không đóng gói vào app):
  - Vite — MIT
  - Vitest — MIT
  - TypeScript — Apache-2.0
  - @fontsource/baloo-2, @fontsource/nunito — chỉ để lấy file phông (OFL-1.1, xem mục Phông chữ)

## Phông chữ (đóng gói trong app, chạy offline)

- **Baloo 2** (Ek Type) — độ đậm 700, 800 — tiêu đề & nút.
- **Nunito** (Vernon Adams, Cyreal, Jacques Le Bailly) — độ đậm 600, 800 — chữ thường.
- Giấy phép: **SIL Open Font License 1.1** (OFL-1.1) — https://openfontlicense.org. Được dùng, nhúng và phân phối
  kèm phần mềm miễn phí; không bán riêng file phông.
- Nguồn: gói npm `@fontsource/baloo-2` và `@fontsource/nunito` (v5.3.0, chỉ là devDependency). App chỉ nạp
  8 file woff2 (tập ký tự Latin + Tiếng Việt) qua `src/styles/fonts.css`; Vite đưa vào `dist/assets/` và service
  worker precache cùng bundle — không tải gì từ mạng.

## Âm thanh

- Âm thanh **tổng hợp** bằng Web Audio `OscillatorNode` (3 họa âm + tắt dần giống piano, tiếng gõ nhịp,
  tiếng vỗ tay bằng nhiễu) — không dùng file ghi âm nào.
- OWNER chọn **không** dùng bộ mẫu Salamander (2026-10-04) → không có tài nguyên âm thanh bên ngoài.

## Nhận cao độ qua micro

Thuật toán YIN (A. de Cheveigné & H. Kawahara, J. Acoust. Soc. Am. 111(4), 2002) — tự cài đặt lại
trong `src/audio/pitchDetect.ts`, không dùng thư viện ngoài. Âm thanh micro chỉ được phân tích trong bộ nhớ,
không lưu, không gửi đi. "Nghe lại con đàn" (`src/audio/recorder.ts`) dùng `MediaRecorder` có sẵn của trình duyệt,
giữ bản ghi tạm trong bộ nhớ — không thư viện ngoài, không gửi đi. "🎧 Album của con" (2026-10-08) giữ bản hay nhất
của mỗi bài trong IndexedDB của chính iPad (`src/progress/albumStore.ts`), không gửi đi.

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

### Thư viện bổ sung 2026-10-09 (OWNER duyệt "Thêm bài hát" — chỉ để trong Thư viện)

| id | Giai điệu | Tình trạng |
|---|---|---|
| `ducklings_swim`, `ducklings_both` | "Alle meine Entchen" — dân ca Đức (thế kỷ 19) | Public domain |
| `morning_mood` | Edvard Grieg (†1907), "Morgenstemning" — Peer Gynt (1875); 6/8 ghi thành 3/4 cho Cấp 2 | Public domain |
| `mountain_king` | Edvard Grieg (†1907), "I Dovregubbens hall" — Peer Gynt (1875); chủ đề 4 ô | Public domain |
| `swan_lake` | P. I. Tchaikovsky (†1893), "Hồ thiên nga" (1876) — chủ đề | Public domain |
| `yankee_doodle` | "Yankee Doodle" — dân ca Mỹ (thế kỷ 18), đoạn đầu | Public domain |
| `merry_christmas` | "We Wish You a Merry Christmas" — dân ca Anh (West Country) | Public domain |
| `auld_lang_syne` | "Auld Lang Syne" — dân ca Scotland (lời R. Burns 1788 — không dùng lời) | Public domain |
| `sakura` | "Sakura Sakura" — dân ca Nhật Bản (thời Edo) | Public domain |
| `goldfish_swim`, `ants_march`, `tick_tock_clock`, `morning_sun`, `playground_slide`, `busy_bee`, `dolphin_jump`, `little_turtle`, `woodpecker`, `steamboat`, `squirrel_nuts`, `fireworks`, `spring_comes`, `shooting_star`, `lion_dance` | Dự án tự sáng tác (thế 5 ngón, mỗi bài chỉ dùng kỹ năng đã học tới tuần của bài) | Tự soạn |

Mọi giai điệu nước ngoài ở trên đều đã hết bảo hộ cả ở Việt Nam (đời tác giả + 50 năm) lẫn ở Mỹ; chỉ dùng giai điệu,
bản phối 5 ngón tự soạn, không dùng lời.

**Dân ca Việt Nam — quy tắc nguồn:** mỗi bài phải khớp từng nốt với ≥ 2 bản ký âm độc lập (ghi tên nguồn ở đây và
trong chú thích `scripts/gen-songs.py`; đối chiếu tự động ở `tests/folk-songs.test.ts`). Đợt 2026-10-09 **không thêm**
dân ca Việt Nam nào: các bài đề xuất (Lý kéo chài, Lý dĩa bánh bò, Qua cầu gió bay, Hoa thơm bướm lượn, Ru con Nam Bộ,
Ngồi tựa mạn thuyền) chưa tìm được hai bản ký âm đọc được để đối chiếu từng nốt; Lý ngựa ô, Bèo dạt mây trôi, Cò lả,
Lý con sáo, Trống cơm, Inh lả ơi đã có sẵn trong kho. Bài nghi vấn tác quyền giai điệu (Kumbaya, Arirang bản 1926,
Scarborough Fair bản phổ biến) cũng không thêm. Bài thiếu nhi còn bản quyền chỉ được nhập qua "📝 Bố mẹ thêm bài".

Bài tập nhịp tuần 4 (`src/music/exercises.ts`), bè đệm (tự sinh từ giai điệu) và các đoạn đọc nhạc ngẫu nhiên
(`src/music/sightread.ts`) do app tự sinh.

Chỉ hiển thị tên bài; không dùng lời bài hát có bản quyền.

## Icon

Icon (`public/icons/`) được sinh bằng `scripts/make-icons.mjs` — tự vẽ, không dùng tài nguyên ngoài.
Font: font hệ thống của thiết bị, không tải font ngoài.
