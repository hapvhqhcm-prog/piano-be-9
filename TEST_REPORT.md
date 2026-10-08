# TEST REPORT — PIANO-BE-9-TUOI v1.2.0 · Phase 1 (1A → 1D)

Ngày: 2026-10-04 · Người kiểm: Claude (lập trình viên) · Người duyệt: OWNER Phan Hà

**Tóm tắt:** Phase 1 đã code xong. 70/70 test tự động PASS, build PASS, đã chạy trọn luồng trong trình
duyệt giả lập iPad (1180×820), và offline đã kiểm trên localhost (tắt server → app vẫn chạy).
**Chưa kiểm trên iPad thật và chưa deploy lên GitHub Pages** → các mục đánh dấu ⏳ cần OWNER làm.

## 1. Definition of Done — Phase 1

| # | Hạng mục | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | iPad Safari landscape, không scroll ngoài ý muốn | ✅ giả lập · ⏳ iPad | Viewport 1180×820: `scrollHeight = innerHeight = 820`; chặn `touchmove` ngoài vùng `.scrollable` |
| 2 | Không double-tap zoom, không chọn chữ | ✅ code · ⏳ iPad | `touch-action: manipulation`, `user-select: none`, chặn `gesturestart`/`dblclick` |
| 3 | AudioContext sau user gesture; nút khởi động lại khi suspended | ✅ | Test `audio.test.ts`: không tạo context trước `unlock()`; lớp phủ "Chạm để bật lại âm thanh" |
| 4 | C3–C5 đúng vị trí phím trắng/đen | ✅ | Test: 25 phím, 15 trắng/10 đen, đúng vị trí đen; ảnh chụp màn Đàn tự do |
| 5 | C4–G4 sáng đúng phím, số ngón RH 1–5 đúng §6 | ✅ | Test `fingering.test.ts` quét mọi bài; trình duyệt: C4 → 1, D4 → 2 |
| 6 | Tay trái chưa kích hoạt | ✅ | Không bài nào dùng LH; cài đặt hiện "Chưa kích hoạt" (khóa) |
| 7 | Oscillator đúng cao độ ±1 Hz | ✅ | 17 nốt so bảng tần số chuẩn; test oscillator `triangle`, A4 = 440 Hz |
| 8 | Nghe lại / Thử lại / Quay lại / Đúng rồi đúng state machine | ✅ | 10 test state machine + chạy thật trong trình duyệt |
| 9 | PARENT_ASSESSMENT lưu đúng, sửa được | ✅ | Nút "Sửa" ở màn kết quả + màn Phụ huynh; test + trình duyệt |
| 10 | APP_ASSESSMENT lưu riêng, chấm đúng | ✅ | `appAssessments` tách khỏi `parentAssessments`; trò chơi tai nghe chạy 10 lượt |
| 11 | Tiến độ còn sau reload; schemaVersion = 1; xuất/nhập/đặt lại | ✅ | Test + trình duyệt (nhập JSON sai bị từ chối, đặt lại 2 bước). Nút tải file chưa bấm thử trên iPad |
| 12 | PWA cài được trên iPad; qua OFFLINE ACCEPTANCE TEST | ⏳ | Đã PASS trên localhost/Chromium (SW cache, tắt server, app + âm thanh + tiến độ vẫn còn). **Cần OWNER test trên iPad từ GitHub Pages** |
| 13 | Không micro, không xin permission | ✅ | Không có `getUserMedia`/`Notification`/`geolocation`/MIDI trong mã |
| 14 | Không request domain ngoài khi offline | ✅ desktop · ⏳ iPad | `performance` resource list: 0 request ra ngoài; SW bỏ qua cross-origin |
| 15 | Không console error nghiêm trọng | ✅ | Không có lỗi từ app khi chạy thử |
| 16 | README.md và LICENSES.md | ✅ | Có |

## 2. Từng bước

- **1A Keyboard + Audio** — ✅ Chạy. Màn "Đàn tự do": chạm phím → phát tiếng + sáng phím + hiện tên/Hz.
- **1B Từng nốt** — ✅ Chạy. Màn §4 + state machine §5, vòng lặp ≈ 3–5 giây/nốt.
- **1C Bài học** — ✅ Chạy. Tuần 1 (B1→B5 + bài thử thách C4 10 lần), tuần 2–3, trò tai nghe, tự đánh giá → sao, lên tuần tự động khi đạt tiêu chí. ⏳ "Bé chơi thử 2 buổi thật".
- **1D Tiến độ + PWA** — ✅ code + localhost. ⏳ Deploy GitHub Pages + OFFLINE ACCEPTANCE TEST trên iPad.

## 3. Lỗi đã tìm & sửa khi test

1. **Offline trắng trang** — server gửi `Vary: Origin`, script module gửi `Origin` → không khớp cache.
   Sửa: `cache.match(..., { ignoreVary: true })`. Đã kiểm lại: PASS.
2. Phiên bản cache không đổi khi chỉ sửa template SW → hash phiên bản nay tính cả template.
3. Trò tai nghe bỏ qua lần chạm khi âm mẫu chưa tắt hẳn (~1,7 s) → nay nhận trả lời sau 0,5 s.
4. `resume()` có thể treo trên iOS → giới hạn chờ 1,5 s để bé không kẹt ở màn Bắt đầu.

## 4. Hạn chế đã biết

Xem README → "Hạn chế đã biết". Quan trọng nhất: **Safari và app ở Màn hình chính dùng bộ nhớ riêng** —
luôn mở app bằng biểu tượng trên Màn hình chính, và sao lưu JSON định kỳ.

## 5. Quyết định triển khai cần OWNER xác nhận (chỗ spec chưa nói rõ)

1. Màn RESULT: "Đúng rồi" → [Quay lại] [Sửa] [Tiếp]; "Thử lại" → [Quay lại] [Sửa] [↻ Thử lại].
   Tự chuyển (nếu bật) chỉ áp dụng sau "Đúng rồi", đếm sau khi âm mẫu xong.
2. Tuần 1 chia thành 3 bài (B1+B2 · B3+B4 · B5) + bài "Thử thách: Đô giữa 10 lần" để đo tiêu chí.
   Nội dung từng nốt trong các bài tuần 1–3 (thứ tự nốt, số lần lặp) là do mình soạn theo §11.
3. Tai nghe: 10 lượt ở cả tuần 2 và 3; chỉ lần chạm đầu được tính; sai → sáng phím đúng và phát lại.
4. Tiêu chí tuần 1: một buổi "Thử thách" có ≥10 "Đúng rồi" cho C4 và 0 "Thử lại".
5. Schema v1 thêm (không đổi trường cũ): `startedAt, endedAt, minutes, completed, checklist` trong mỗi buổi.
6. Màn Phụ huynh có thêm: chọn tuần thủ công (1–3) và tên bé.
7. (Theo yêu cầu OWNER) Chạm phím C4–G4 → số ngón to nảy trên phím; hình bàn tay phải sáng đúng ngón ở màn Từng nốt, Đàn tự do và thẻ "Đếm ngón" (B5). Số ngón vẫn lấy từ §6.

## 6. Hướng dẫn test trên iPad qua LAN (1A–1C)

1. Máy tính: `npm run dev` trong thư mục `piano-be-9`, ghi lại địa chỉ `Network: http://192.168.x.x:5173/`.
2. iPad cùng Wi-Fi → Safari → mở địa chỉ đó → xoay ngang.
3. Bấm **Bắt đầu** → **Đàn tự do** → chạm lần lượt 20 phím: phải đúng cao độ, không zoom khi chạm nhanh 2 lần.
4. Quay lại → **Học tiếp** → làm hết một buổi: Nghe lại / Đúng rồi / Thử lại / Sửa / Quay lại.
5. Giữ nút **Phụ huynh** 2 giây → giải phép cộng → xem kết quả tách 2 phần PARENT / APP.

## 7. OFFLINE ACCEPTANCE TEST (bắt buộc, trên iPad thật, từ GitHub Pages)

1. Deploy (README → Deploy) → mở `https://<tài-khoản>.github.io/piano-be-9/` trong Safari khi có Internet.
2. Nút Chia sẻ → **Thêm vào Màn hình chính**.
3. Mở app từ biểu tượng ít nhất một lần, bấm Bắt đầu, đợi ~5 giây (tải cache).
4. Tắt Wi-Fi (và dữ liệu di động nếu có).
5. Vuốt đóng hẳn app.
6. Mở lại từ biểu tượng.
7. Tuần 1–3 vẫn chạy (Phụ huynh → chọn Tuần 2/3 để thử).
8. **Bàn phím vẫn phát tiếng** — nếu không → Phase 1 FAIL.
9. Tiến độ vẫn còn (sao hôm nay, bài đã ✓).
10. (Tùy chọn) Mac + Safari Web Inspector → tab Network: không có request ra domain ngoài.

## 8. Việc đề nghị tiếp theo

1. OWNER: deploy + chạy mục 6 và 7, cho bé chơi thử 2 buổi (bước 1C).
2. OWNER duyệt 3 bài hát (vấn đề quãng A4 ở Frère Jacques và Twinkle — xem phần duyệt bài hát).
3. Trả lời đúng chữ `PHASE 1 PASS` để bắt đầu Phase 2 (tuần 4–5, metronome, Theo nhịp 3 mức, 3 bài hát).

---

## 9. Thay đổi sau Phase 1 — OWNER mở khóa MICRO (2026-10-04)

**Quyết định của OWNER:** cho phép app dùng micro nghe đàn cơ, theo hướng "giống Simply Piano".
Điều này **thay thế** các dòng "không micro / không xin permission" ở §3, §17 và DoD Phase 1.

Đã làm:
- `src/audio/pitchDetect.ts`: nhận cao độ YIN + `NoteTracker` (ổn định ≥3 khung, nhận lần gõ phím mới,
  bỏ qua nốt cũ còn ngân). Test với tín hiệu có họa âm mạnh C3–C5: sai lệch < 15 cents.
- `src/audio/MicListener.ts`: micro → AnalyserNode (không nối ra loa), tắt echo/noise/AGC,
  **bỏ qua khi app đang phát tiếng** (+250 ms) để không tự nghe âm mẫu / phím ảo.
- **MIC_ASSESSMENT** — loại kết quả thứ 3, lưu riêng `session.micAssessments`
  (`expected, firstHeard, firstTry, wrongCount, parentOverride?`). Không trộn với PARENT/APP.
- Màn Từng nốt: micro chỉ nghe ở `WAIT_PARENT` (sau khi mẫu phát xong). Đúng → "App nghe con đàn đúng rồi!"
  → tự sang nốt sau ~1,2 s (tắt được). Sai → nhắc nhẹ "Con vừa đàn Rê — tìm Đô nhé" (không âm tiêu cực).
  Nút "Đúng rồi / Thử lại / Sửa" của bố mẹ vẫn giữ để dự phòng.
- Màn Phụ huynh: bật/tắt micro (**mặc định TẮT**), **Thử micro**, **Chỉnh theo đàn nhà** (đàn C4 ×3 → bù cents),
  bảng kết quả micro riêng.
- Tiêu chí tuần 1: C4 10/10 tính cả micro (phải đúng ngay lần đầu; bố mẹ "Sửa" được ghi đè).

Đã kiểm (trình duyệt, micro giả lập bằng tín hiệu có họa âm): đàn sai → nhắc đúng phím; đàn đúng → tự chuyển,
lưu MIC không đụng PARENT; chỉnh đàn lệch −35 cents đo ra đúng −35.
**Chưa kiểm trên đàn cơ thật** — xem hướng dẫn trong README → "Micro".

Hạn chế đã biết của micro:
- Chỉ nhận **một nốt mỗi lần** (đủ cho giai đoạn một tay). Hợp âm/hai tay chưa hỗ trợ.
- Cần mở bằng **https://** (GitHub Pages). Bản LAN `http://192.168…` không dùng được micro.
- Phòng ồn, TV, người nói to có thể gây nhận nhầm → bố mẹ bấm **Sửa**.
- Khi micro bật, iPad có thể phát âm mẫu nhỏ hơn một chút (chế độ ghi + phát của iOS).
- iPad có thể hỏi lại quyền micro mỗi lần mở app (hành vi của iOS với web app).

---

## 10. Giáo trình v2 trọn tuần 1–8 (OWNER duyệt 2026-10-04)

Quyết định của OWNER: làm trọn giáo trình **v2** trong một lượt (bỏ qua STOP-GATE Phase 2/3), **18 bài hát**
(thêm nốt La = ngón 5 duỗi từ tuần 7), âm thanh **tổng hợp giống piano** (không tải Salamander).

Đã làm:
- 8 tuần (`src/lessons/week1–8.ts`), bản đồ đảo, câu chuyện mỗi tuần, "Con làm thầy", "Ôn nhanh" (gợi nhớ ngắt quãng).
- Trò nghe/đọc v2 (`quiz.ts`): Lên hay xuống? · Bước hay nhảy? · Nốt nào đây? (luôn có mốc Đô) · Đọc nốt.
- Nhại lại (2–3 nốt, micro chấm đúng thứ tự), vỗ nhịp Mức 1 ("Đi / Chạy-chạy / Đi-i / Suỵt").
- Màn bài hát: Từng nốt / Theo nhịp (Mức 2 con trỏ, Mức 3 băng chuyền), đếm vào, gõ nhịp, nhạc đệm, câu, tốc độ, khuông nhạc,
  gợi ý rút dần; micro chấm từng nốt & chấm nhịp (cửa sổ −0,45…+0,55 phách, bù trễ 0,18 s); không micro → bố mẹ đánh giá.
- Tay trái (tuần 6, khóa Fa trên khuông), sân khấu tuần 8 (bé tự chọn 2–3 bài, vỗ tay, huy chương), thư viện bài hát.
- Tiêu chí tuần 4–8 theo §11; lượt chơi lưu ở `session.songRuns` (schema chỉ thêm trường, vẫn v1).
- Cài đặt: nhạc đệm, tay trái (tự bật tuần 6), giới hạn ngày 15/20/30' (mặc định không giới hạn).

Kiểm thử: test tự động (bài hát, nhịp, khuông, trò chơi, kế hoạch buổi, tiêu chí 8 tuần) + chạy giao diện trên trình duyệt
(màn chính & bản đồ, Lên hay xuống?, bài hát Từng nốt có micro giả 16/17, Theo nhịp + bố mẹ chấm, băng chuyền, thẻ khuông tuần 7,
đọc nốt, vỗ nhịp, sân khấu). **Chưa kiểm trên iPad + đàn thật** — đặc biệt chấm nhịp bằng micro cần thử thật để chỉnh độ trễ.

Điểm cần OWNER biết:
- Twinkle, Frère Jacques giờ đúng giai điệu gốc (có La); Frère Jacques vẫn thay Sol trầm bằng Sol cao ở câu cuối (ngoài tầm tay).
- Old MacDonald viết ở giọng Fa (bắt đầu ngón 4) để nằm gọn Đô–La.
- Ngón 5 phụ trách cả Sol và La ("duỗi"), ngón cái luôn ở Đô — đơn giản cho bé, không đổi thế tay.
- Khi micro bật, nhạc đệm tự tắt để micro nghe rõ (tiếng gõ nhịp vẫn có, nằm ngoài dải micro nghe).

---

## 11. Cấp 2–3 (tuần 9–24) + luyện tập mỗi ngày (OWNER yêu cầu 2026-10-04: "hoàn thiện đến khi bé thành thạo")

Đã làm:
- **24 tuần, 3 cấp** (`lessons/level2.ts`, `level3.ts`), bản đồ đảo theo cấp, thông báo lên cấp; tiêu chí qua tuần 9–24.
- **Thế tay mới** (`fingering.ts → POSITIONS`, cách bấm sư phạm chuẩn — **cần OWNER duyệt**):
  Đô giữa tay trái (C4=1 B3=2 A3=3 G3=4 F3=5) · thế Sol (RH G4=1…D5=5; LH G2=5…D3=1) ·
  thế Rê (D4=1 E4=2 F♯4=3 G4=4 A4=5) · Đô thứ (Mi♭4=3) · La thứ (A3=1…E4=5) ·
  bài "free" (gam luồn ngón, Silent Night, Minuet, Für Elise, Canon) ghi số ngón từng nốt.
- **49 bài hát** (thêm 31): hai tay luân phiên/cùng lúc, hợp âm I–IV–V, 3/4, chấm dôi, phím đen, cổ điển.
- Khuông kép Sol + Fa, dấu ♯/♭, nốt chấm, hợp âm; bàn phím ảo tự chọn dải (C2–C6) theo bài; Đàn tự do đổi quãng tám.
- Trò mới: "Vui hay buồn?" (trưởng/thứ), đọc nốt khóa Fa; **đọc nhạc ngẫu nhiên** (sinh đoạn mới mỗi lần).
- **Luyện tập mỗi ngày** (từ tuần 9, và tự động sau tuần 24): đọc nhạc + 1 bài đang tập + 1 bài đã thuộc (ôn ngắt quãng).
- "Thuộc bài" = trọn bài theo nhịp ≥ 60 BPM và đạt; ⭐ trong thư viện; màn Phụ huynh có mục **Tiến tới thành thạo**.
- Micro nghe được C2–E6; bài hai tay chấm theo nhóm nốt cùng lúc (micro nghe một nốt mỗi lúc — trúng nốt nào trong nhóm cũng tính).

Kiểm thử: 300+ test tự động (49 bài hợp lệ theo thế tay, đọc nhạc ngẫu nhiên mọi thế, tiêu chí tuần 9–24, luyện tập mỗi ngày,
nhóm nốt hai tay, dấu giáng, dải micro) + giao diện trên trình duyệt (bản đồ Cấp 2, thư viện theo cấp, khuông kép "Chúc mừng sinh nhật",
Minuet 3/4 có ♯ và dải C4–C6, thế Sol + nhại lại, đọc nhạc ngẫu nhiên). **Chưa thử trên iPad + đàn thật.**

Hạn chế đã biết:
- Micro chỉ nghe **một nốt mỗi lúc** → bài hai tay/hợp âm được chấm "dễ" hơn (đúng một nốt trong nhóm là tính); nên để bố mẹ xác nhận.
- Bàn phím ảo hiện tối đa 4 quãng tám (C2–C6); bài cần nhiều hơn chưa có.
- Für Elise, Canon là bản giản lược tay phải / hai tay đơn giản, không phải bản gốc đầy đủ.

---

## 12. Giao diện mới & video minh họa (OWNER yêu cầu 2026-10-04)

- **Video minh họa = hoạt hình thầy đàn mẫu** (`ui/components/demo.ts`): bàn tay vẽ SVG trượt trên bàn phím của màn hình,
  nhấn đúng ngón vào đúng phím, phát tiếng, phụ đề "Fa — ngón 4 (ngón áp út)". Tự sinh cho mọi phần bài học (tự phát ở màn mở đầu,
  nút 🎬 Xem lại), mọi lần nghe mẫu một nốt (tay mờ), và mọi bài hát (🎬 Xem mẫu — hai tay, hợp âm, luồn ngón; con trỏ khuông chạy theo).
  Không dùng file video thật: app vẫn ~60 kB gzip và chạy offline. Đo kiểm: đầu ngón tay trùng tâm phím (lệch 0 px).
- **Bàn tay vẽ lại** (`handArt.ts`): da chuyển màu, móng, nếp đốt, số ngón trên đầu ngón, ngón đang dùng sáng + "nhấn" xuống.
- **Bé Nốt** (nhân vật nốt nhạc biết cười/vẫy tay), **pháo giấy** khi đúng / qua bài, **tranh tư thế ngồi** tô sáng lưng–chân–tay,
  phím đàn có chiều sâu & phát sáng, nút nổi khối, bản đồ đảo trên biển, chuyển màn mượt (`styles/theme.css`).
- Đã kiểm bố cục ở iPad mini (1133×744) và iPad 10,9" (1180×820): không tràn màn hình.

Lưu ý: nếu muốn thêm **video quay thật** (bố mẹ hoặc giáo viên đàn mẫu), có thể làm sau: quay bằng iPad rồi nhập vào app
(lưu trên máy, không tải lên mạng) — cần OWNER đồng ý vì sẽ dùng thêm bộ nhớ iPad.

---

## 13. Tự phản biện (2026-10-04) — xem chi tiết SELF_REVIEW.md

- Cải tiến sư phạm/trải nghiệm: trợ giúp thích ứng (thầy đàn lại khi sai ≥ 2 lần), buổi gọn hơn (khởi động ≤ 6 lượt),
  thang tốc độ 40→72, micro chấm tiếng vỗ tay, độ khắt khe chấm nhịp Dễ/Vừa/Khó, mục tiêu tuần 5 chấm + chuỗi ngày,
  24 mẹo cho bố mẹ, nhắc sao lưu, lời khen đa dạng.
- Rà soát độc lập tìm ra **1 lỗi nghiêm trọng** (mất tiến độ khi lên tuần 9 — đã sửa + tự khôi phục) và 10 lỗi khác (đã sửa).
- 322 test tự động PASS.

## 14. Micro trên đàn cơ thật (OWNER báo 2026-10-04: "test mic chưa hiệu quả")

**Cách đo:** `tests/pianoSim.ts` giả lập đàn cơ trong phòng: họa âm lệch (inharmonicity), 2–3 dây/nốt lệch vài cents,
tiếng búa, tắt dần 2 giai đoạn, vang phòng, chưa nhả phím (legato), tiếng ồn + ù điện, lực bấm khác nhau.
`tests/micBench.test.ts` cho bộ cũ và bộ mới chạy trên cùng tín hiệu, rồi so sánh.

| Kịch bản (điều kiện thật) | Bộ cũ | Bộ mới |
|---|---|---|
| Đàn nhẹ (tiếng tới micro nhỏ) | 6% | **94%** |
| Phòng rất ồn (TV, quạt) | 25% | **94%** |
| Đàn lệch dây −35 cents | 88% | **100%** |
| Đàn nhanh 0,35 s/nốt | 88% | 88% |
| Tay trái trầm / nốt cao / nốt lặp / giai điệu | 100% | 100% |
| **Tổng 14 kịch bản** | **87%** | **97%** |
| Độ trễ nhận nốt (trung vị) | 143 ms | **68 ms** |

**Nguyên nhân đã sửa:**
1. Ngưỡng im lặng cố định 0,01. Khi đàn nhẹ hoặc iPad để xa, tiếng đàn nằm dưới ngưỡng nên cả nốt bị bỏ qua.
   Giờ ngưỡng tự thích nghi theo tiếng ồn nền và có **độ nhạy Thấp / Vừa / Cao** chỉnh được.
2. Tiếng ồn phòng phủ tới 24 kHz. Giờ có **lọc thông thấp 1,8 kHz** trước khi phân tích.
3. YIN bỏ cả khung khi không đạt ngưỡng 0,15, mà trong phòng ồn thì thường không đạt.
   Giờ YIN **nới ngưỡng theo cực tiểu toàn cục**, vẫn lấy điểm đầu tiên để tránh nhầm quãng 8.
4. Bắt "gõ phím" bằng cách so với khung ngay trước, nên nốt lặp và đàn nhanh bị nuốt.
   Giờ so với mức thấp nhất của 3 khung gần đây.
5. **Bé nhại lại ngay khi app vừa đàn mẫu xong** thì lần gõ bị bỏ (micro còn chờ tiếng app tắt), và nốt không bao giờ được nhận.
   Giờ lần gõ trong lúc tiếng app đang tắt dần được nhớ lại. Có test riêng cho cả hai chiều:
   tiếng của chính app thì vẫn không bị tính.
6. Bước phân tích 40 ms giảm còn 25 ms.

**Màn "Thử micro" thành trình chẩn đoán:**
- thanh âm lượng có vạch ngưỡng, giúp bố mẹ thấy tiếng đàn có vượt vạch không;
- chọn độ nhạy ngay tại màn hình;
- **Kiểm tra 5 nốt** (Đô → Sol): báo đúng/sai/không nghe cho từng nốt, kèm lời khuyên cụ thể
  (tăng độ nhạy, dời iPad, chỉnh theo đàn nhà, bớt ồn);
- **Sao chép nhật ký** (JSON: mức tiếng, ngưỡng, ồn nền, độ rõ của từng nốt) để gửi người hỗ trợ chỉnh tiếp.

**Giới hạn còn lại:** đây vẫn là giả lập. Số liệu thật phụ thuộc iPad, đàn và phòng; nhật ký từ màn chẩn đoán là cách để chỉnh tiếp.
Micro vẫn chỉ nghe được **một nốt mỗi lúc**.

## 15. Giáo trình v4 (OWNER đồng ý 2026-10-05): sắc thái, ngắt/liền, tuần 20 mới, bớt bài lặp

- **Định dạng bài v4:** `dyn` (p/mf/f), `stac` (ngắt tiếng), `slur` (luyến).
  Khuông nhạc vẽ đủ ký hiệu, app đàn mẫu đúng to/nhỏ và ngắt/liền. Màn bài hát có chú giải ngắn.
- **Trò chơi mới "dynamics":**
  - 🦁 TO / 🐭 NHỎ: tuần 5. Micro so với tiếng "vừa" của chính bé, phải to hơn hoặc nhỏ hơn ×1,5.
  - 🐇 NGẮT / 🐢 LIỀN: tuần 10. Micro đo lượng tiếng còn lại 0,25 s sau khi gõ phím.
  - Không có micro thì bố mẹ chấm. Micro trượt 2 lần thì có nút "Bố mẹ: qua".
  - Đo trên giả lập đàn cơ (tests/expression.test.ts): phân biệt đúng ở mọi tổ hợp đã thử.
  - Giới hạn: khi các nốt cách nhau trên ~0,6 s, chỉ phân biệt chắc chắn được ngắt và liền với nhau, không tách được "liền" với "nhả phím muộn".
- **Ngón Sol–La = 4-5 từ tuần 7.** Tuần 1–6 giữ nguyên Sol = ngón 5.
- **Tuần 20 mới "Tháp Nốt Cao" (Đô5–Sol5).** Giáo trình thành 25 tuần, Cấp 3 = tuần 17–25.
  Dữ liệu cũ được chuyển tự động một lần (`curriculumRev`): tuần ≥ 20 → +1, mã bài `w20-`…`w24-` → `w21-`…`w25-`. Có test chạy hai lần không đổi gì thêm.
- **Bài hát:** 51 bài.
  - Thêm 4 bài sáng tác: Rô-bốt đi đều, Siêu nhân bay, Ninja rón rén, Thuyền trôi.
  - Bớt bản trùng: Ode to Joy, Mary.
  - **Chưa thêm dân ca Việt Nam:** chưa xác minh chắc chắn giai điệu và tiết tấu. Cần bản nhạc tin cậy từ OWNER.
- 460 test qua.

## 16. Dân ca Việt Nam + sửa lỗi sau rà soát v0.4 (2026-10-05)

**6 bài dân ca** (chỉ giai điệu truyền thống, không dùng lời mới có bản quyền).
Mỗi bài đối chiếu ≥ 2 nguồn ký âm độc lập; nốt và tiết tấu được kiểm lại bằng máy so với bản ký âm.

| Bài | Tin cậy | Tuần | Thế tay |
|---|---|---|---|
| Lý cây đa (câu đầu) — quan họ Bắc Ninh | vừa | 2 | Đô (Đô–Rê–Mi) |
| Inh lả ơi — dân ca Thái | cao | 7 | thế Đô nhích lên (Sol–La 4-5) |
| Xòe hoa — dân ca Thái | cao | 8 | ngũ cung Đô Rê Fa Sol La |
| Bắc kim thang — dân ca Nam Bộ | cao | 14 (nốt chấm dôi; thay bản trùng "Cầu London — chấm dôi") | ngũ cung |
| Lý ngựa ô (12 ô đầu) — dân ca Nam Bộ | vừa | 18 | bàn tay mở Rê–Đô (khoảng 7) |
| Lý cây bông — dân ca Nam Bộ | vừa | 23 | hai tay luân phiên |

**Đã loại:**
- Trống cơm: bản phổ biến ghi tác giả Y Vân (còn bản quyền); bản dân ca thì các nguồn không khớp.
- Cò lả: hai nguồn lệch nhau.
- Ru con: chỉ có một nguồn.

**Ghi chú:** bài 2/4 được ghi thành 4/4 với trường độ gấp đôi (app chưa vẽ nốt móc kép), nên nghe chậm hơn bản gốc.

**Sửa lỗi sau rà soát v0.4:**
- Tay trái nay theo sắc thái chung của bài.
- Hiệu chỉnh "tiếng vừa" không còn lưu mức 0.
- Xem thầy đàn mẫu không còn xóa đếm lần trượt, nên luôn tới được "Bố mẹ: qua".
- Bé đang ở tuần 20 cũ được học tuần chuẩn bị mới trước Minuet.
- Bài có nội dung mới dùng mã mới.
- Từ chối dữ liệu của bản giáo trình mới hơn.
- Chú giải sắc thái chỉ ghi ký hiệu bài có dùng (thêm "mf = vừa").
- Dấu luyến sang trang không đè số chỉ nhịp.

## 17. Giao diện mới + sửa nhịp độ giáo trình (2026-10-05)

**Giao diện** (soát bằng ảnh chụp tự động mọi màn ở 2 cỡ iPad — `node scripts/shots.mjs <thư-mục>`):
- **Bộ quy chuẩn giao diện:** màu tím–vàng nắng–xanh bạc hà–cam san hô; nền trời → cát; bóng đổ 3 mức; một họ nút thống nhất.
- **Phông chữ** Baloo 2 + Nunito có đủ dấu tiếng Việt, đóng gói sẵn để chạy offline (giấy phép OFL).
- **Màn chính:** bản đồ biển với 25 hòn đảo vẽ riêng nối bằng đường đi; bên trái thẻ câu chuyện + mục tiêu + "Học tiếp", bên phải danh sách bài.
- **Hình vẽ mới:** linh vật, màn bắt đầu (linh vật + đàn piano), tư thế (cậu bé ngồi đàn, kính lúp "tay tròn"), hoa giấy hình nốt nhạc.
- **Màn bài hát:** tùy chọn phụ gom vào "⚙️ Tuỳ chọn".
- **Các màn khác:** bàn phím có hộp đàn và dải nỉ đỏ; ngón cái trong hình bàn tay không còn bị che.
- **Màn Phụ huynh:** nhập dữ liệu có bước xác nhận.

**Nhịp độ giáo trình** (rà soát toàn bộ bằng giả lập: 25 tuần xong trong ~47 buổi, bỏ qua 34 bài):
- **Sang tuần mới** chỉ khi đạt tiêu chí VÀ học hết các bài của tuần. Màn chính báo "Còn N bài nữa là qua đảo".
- **Hết giờ giữa bài:** lần sau học tiếp phần còn lại, không lặp lại từ đầu mãi.
- **Khởi động:**
  - Bài đầu tuần dùng khởi động của tuần trước, để không hỏi điều chưa dạy.
  - Tuần chấm điểm bằng khởi động thì buổi đầu học bài trước rồi mới khởi động.
  - Bài đã có quiz cùng kiểu thì bỏ khởi động.
  - Tuần 17 đọc nốt hợp âm khóa Fa thay vì "vui/buồn" (tuần 19 mới dạy).
- **Luyện tập mỗi ngày:** ưu tiên bài gần trình độ; thỉnh thoảng có trò tai nghe hoặc to/nhỏ; lời "Con làm thầy" đổi theo ngày.
- 521 test qua (thêm tests/pacing.test.ts).

## 18. Tiếng đàn mới, ký hiệu nhạc chuẩn, hướng dẫn bố mẹ, sổ sticker (2026-10-05)

- **Tiếng đàn tổng hợp mới** (OWNER nghe so sánh, chọn bản mới):
  - âm sắc theo búa gõ, 2 "dây" lệch nhẹ, tiếng búa;
  - độ sáng giảm dần theo thời gian, tắt dần 2 giai đoạn, vang phòng nhẹ;
  - bass nghe rõ trên loa iPad;
  - micro vẫn bỏ qua tiếng app (cộng thêm 150 ms cho đuôi vang);
  - từ nốt thứ 8 trở đi giảm bớt thành phần để đỡ tốn CPU.
- **Ký hiệu nhạc:**
  - thêm nốt móc kép, móc đơn chấm, gạch nối nốt móc theo phách (gồm gạch nối một phần), dấu lặng đủ loại;
  - khoảng cách nốt theo trường độ;
  - hỗ trợ nhịp 2/4 trọn vẹn: đếm vào 2 ô, chấm nhịp ghép nốt gần nhất trước.
- **6 bài dân ca** về đúng nhịp 2/4 gốc, đối chiếu từng nốt với bản ký âm.
  - Bài có nốt móc kép khởi đầu ở tốc độ 40; muốn "thuộc" vẫn phải đạt 60.
  - Lý ngựa ô chia cho hai tay (không tay nào mở quá quãng 4).
- **Hướng dẫn nhanh cho bố mẹ:** 4 thẻ, hiện ở lần đầu (cài mới), mở lại ở Phụ huynh → 📖.
- **Sổ sticker:** 41 sticker suy ra từ dữ liệu có sẵn (đảo, huy chương, số bài thuộc, chuỗi ngày, dân ca, đàn chuẩn qua micro, trò to/nhỏ – ngắt/liền). Kết thúc buổi học báo sticker mới.
- 639 test qua.

## 19. Phản biện của 3 chuyên gia + cải tiến an toàn (2026-10-05)

Ba chuyên gia đánh giá độc lập: sư phạm piano thiếu nhi, khoa học học tập/trải nghiệm trẻ em, kỹ sư âm thanh/iPad.

**Kỹ thuật**
- **Chống mất dữ liệu:**
  - xin lưu trữ bền vững;
  - thẻ hướng dẫn "Thêm vào Màn hình chính";
  - sao lưu qua bảng Chia sẻ của iPad (chỉ ghi "đã sao lưu" khi thành công);
  - tự cất 3 bản dữ liệu cũ trước khi nhập/xóa.
- **Micro:**
  - tự phục hồi sau cuộc gọi, Siri hay khóa màn hình (tắt tiếng track, ngắt AudioContext, bộ canh im lặng);
  - giảm tần số lấy mẫu ×2 nên nhẹ CPU gấp 3;
  - tiếng tích đổi sang 5 kHz kèm lọc bậc 4, không còn che micro đúng phách;
  - mức ồn nền không còn "trôi" khi nốt ngân dài;
  - ước lúc gõ phím sai số 0–4 ms.
  - Đo trên giả lập: 99% (trước 97%); đàn nhanh 100%; 44,1 kHz 100%.
- **Cập nhật app** chỉ áp dụng ở điểm an toàn, không đổi phiên bản giữa bài.

**Trải nghiệm**
- **Giọng đọc tiếng Việt** (vi-VN của iPad), có nút 🔊 nghe lại; micro tạm bỏ qua khi app đang nói.
- **Tự chấm** "Dễ/Vừa/Khó" đều được 3 sao (không phạt sự trung thực).
- **Khen cụ thể** ("Đúng Đô — ngón 1!"); hoa giấy chỉ khi xong đoạn hoặc 3 lần đúng liên tiếp.
- **Bỏ chuỗi ngày 🔥** khỏi màn của bé, thay bằng "🌟 Tuần chăm chỉ" (≥ 4 buổi/tuần).
- **Phụ huynh:**
  - thẻ "📝 Việc cần làm tối nay" (3 chỗ bé hay vấp + một việc cụ thể + mục tiêu tuần);
  - bỏ thuật ngữ khó; phần kỹ thuật gom vào "Nâng cao";
  - giải thích "Khi nào bấm Đúng rồi?".
- **Màu tay an toàn cho người mù màu:** tay phải xanh dương, tay trái cam, kèm chữ P/T.
- **Khi micro không nghe thấy 8 giây:** nhắc bé đàn to hơn. Vấp 3 lần thì có nút "Bỏ qua — mai ôn lại".

**Sư phạm (an toàn, không đổi cấu trúc)**
- **Sửa lỗi Ôn nhanh:** từ tuần 9 trước đây chỉ ôn tìm phím tuần 1–6.
- **Ôn có trọng số** theo lỗi gần đây và thời gian chưa gặp.
- **Ôn bài cũ trong buổi:** 1 câu của bài 2–4 tuần trước, không tính vào hoàn thành bài.
- **Bài "phai"** (đã thuộc nhưng 21 ngày chưa đàn): mờ ⭐ và được ưu tiên ôn.
- **Tập tách tay** (phải/trái/hai tay) cho bài hai tay; lượt một tay không tính tiêu chí tuần hay "thuộc bài".
- **Lặp câu** đến khi "3 lần đúng liên tiếp".
- **Nhắc hát tên nốt** theo thầy trước bài mới; "Đếm to theo nhé!" khi đếm vào; trò vỗ nhịp xen kẽ đọc âm tiết và đếm số.
- 698 test qua.

## 20. Giáo trình v5 — 30 tuần (OWNER duyệt 2026-10-05 theo phản biện chuyên gia sư phạm)

- **30 tuần:** 3 cấp × 10 tuần, thêm 5 tuần củng cố/chuẩn bị (5, 9, 13, 18, 22) và 14 bài sáng tác mới; tổng 70 bài.
  - Minuet và Für Elise dời về tuần 28–29.
  - Mục tiêu ghi trung thực: "≈ hoàn thành Faber cấp 1 / đầu cấp 2".
- **Nhịp đúng thứ tự:**
  - móc đơn ở tuần 4; nhịp 2/4 ở tuần 9;
  - móc kép, móc đơn chấm + móc kép, nghịch phách, dấu nối ở tuần 18, trước mọi bài dùng chúng;
  - Lý cây đa dời từ tuần 2 sang tuần 18;
  - trò vỗ nhịp đếm "1 – 2" cho mẫu 2/4 và chậm lại (48) với mẫu móc kép.
- **Đọc nhạc theo quãng và nốt mốc:**
  - trò "giống / bước / nhảy, lên / xuống" (tới quãng 5 ở cấp sau);
  - nốt mốc khóa Sol và khóa Fa; tuần "Cầu Vạch Phụ" về dòng kẻ phụ và khuông đôi;
  - đọc nhạc ngẫu nhiên bắt đầu ở nốt bất kỳ, có quãng 4–5.
- **Khởi động kỹ thuật 1 phút** (thả cánh tay, xoay cổ tay, gõ ngón, 5 ngón p/f, luồn ngón cái, tay tròn) có hình động và giọng đọc.
- **Sáng tạo:**
  - ứng tấu phím đen trên nền ngũ cung;
  - đối đáp hỏi–đáp (kết về Đô);
  - sáng tác 4 ô nhịp, lưu vào "🎼 Bài của con" trong Thư viện.
- **Bài kiểm tra tuần chặt hơn:**
  - phải đạt ở 2 ngày khác nhau;
  - không có micro thì bố mẹ chấm phiếu 3 ý (đúng nốt · đều nhịp · đúng ngón & dáng tay);
  - tuần 2 bỏ tự chấm;
  - tuần 1 cho phép sai 1 lần.
- **Chuyển dữ liệu tự động** (curriculumRev 3) theo bảng tuần cũ → mới. Lượt bố mẹ chấm trước 06/10/2026 vẫn được tính.
- **Bản đồ đảo:** ảnh gắn lại theo tuần mới, thêm 5 đảo cho 5 tuần mới.
- 853 test qua.

## 21. Kiểm thử toàn bộ v5 + hợp âm thật + đo độ trễ + mượt trên iPad cũ (2026-10-05)

- **LỖI NGHIÊM TRỌNG đã sửa:** với quy tắc "đạt ở 2 ngày", nút "Học tiếp" ở 15/30 tuần cứ mời mãi bài cuối tuần, trong khi bài cần cho tiêu chí là bài khác. Bé chỉ bấm "Học tiếp" thì kẹt.
  - Giờ app giả lập "buổi học hoàn hảo" để tìm bài giúp đạt tiêu chí (`criterionLesson`).
  - Test mới `learnPath`: bé chỉ bấm "Học tiếp" đi hết 30 tuần. Trên mã cũ, test này phát hiện kẹt ở tuần 4.
- **Micro nhận HỢP ÂM thật:** kiểm từng nốt mong đợi (phổ + mẫu họa âm + NNLS, có nốt "mồi" để loại nhầm).
  - Giả lập: đủ nốt được nhận 100%; đàn 1 nốt thay hợp âm bị loại 100%; sai nốt trầm bị loại 100%; quên nốt trên được phát hiện 86%.
  - Bé quên nốt thì app nhắc "Con quên nốt Mi". Không chắc chắn thì dùng cách cũ.
- **Đo độ trễ** loa → micro (Thử micro → ⏱️): 6 tiếng "ping", lấy trung vị, dùng để chấm nhịp. Trên 120 ms thì nhắc có thể đang dùng tai nghe Bluetooth.
- **Phiên âm thanh iOS:** giữ "play-and-record" suốt khi micro được bật, không đổi qua lại (tránh tụt âm lượng hay rè).
- **Mượt trên iPad cũ** (máy làm chậm 6 lần):
  - khuông chạy 11 → 63 khung/giây;
  - đàn mẫu trên khuông chạy 20 → 60;
  - con trỏ 52 → 62;
  - hết các tác vụ dài.
- **Sửa nhỏ:**
  - Luyện tập mỗi ngày bắt đầu từ Cấp 2 (tuần 11);
  - bỏ chữ "thành thạo" quá đà;
  - Thư viện ghi tên nhạc sĩ / "Bài sáng tác cho bé" thay vì tên tiếng Anh;
  - ngày sáng tác dạng "📅 5 thg 10";
  - chữ P/T không còn bị phím đen che;
  - khởi động 5 ngón không chạy đè đồng hồ.

## 22. v5.1 — chuyên gia chấm lại + OWNER duyệt (2026-10-06)

Chuyên gia chấm lại bản 0.9.1: sư phạm **B** (trước C+/B−), trải nghiệm **B/B+**. OWNER duyệt 4 đề xuất, đồng thời báo: "iPad đã nghe được nhưng chưa tốt lắm".

- **Buổi học gọn:**
  - tối đa 7 màn, ước tính ≤ 12 phút;
  - "Con làm thầy" gộp với tự chấm;
  - khởi động kỹ thuật 30 giây ở mọi buổi (trong bước tư thế, xoay vòng);
  - bỏ khởi động tai khi bài có ≥ 3 bài hát;
  - lượt khuông chạy dời sang bài sau.
- **Tách tay có sẵn trong bài** (phải → trái → hai tay) ở 6 bài hai tay. Đàn xong cả bài có nút "🔁 Lặp câu khó" mở câu sai nhiều nhất.
- **31 tuần:** tuần 18 tách thành "Móc kép & Tập-tễnh" và tuần 19 mới "Phố Xích Lô" (nghịch phách & dây nối). Dữ liệu chuyển tự động (curriculumRev 4).
- **Tiêu chí:**
  - Silent Night, Minuet, Für Elise phải đàn theo nhịp ≥ 50;
  - tuần chấm bằng app cũng phải đạt ở 2 ngày;
  - tuần dòng kẻ phụ và nốt cao cần thêm một lượt đọc nhạc trên phím;
  - mục tiêu tuần có lời cho bé, kèm chấm ●○ số ngày đã đạt;
  - phiếu chấm ở chế độ "từng nốt" chỉ 2 ý (không hỏi "đều nhịp").
- **"Tuần chăm chỉ"** tính theo số NGÀY tập (≥ 4), không theo số buổi.
- **🎧 Nghe lại con đàn:** ghi tạm trong bộ nhớ khi micro bật, rời màn là xóa. Lời hứa quyền riêng tư đã cập nhật.
- **Micro:**
  - tự chỉnh độ nhạy sau "Kiểm tra 5 nốt";
  - đếm độ chính xác thật khi bố mẹ chấm đúng/sai;
  - nhật ký v2 ghi bộ lọc iOS thực tế, top-3 nốt ứng viên, độ trễ, khoảng trống khung;
  - không còn yêu cầu iOS bật voice isolation;
  - thích nghi phòng nhanh hơn lúc micro khởi động.
  - Bench 99%, kể cả kịch bản AGC/khởi động.
- 934 test qua; robot e2e qua kịch bản A, B, C.

## 23. Thêm bài Việt Nam + "Bố mẹ thêm bài" (2026-10-06)

**Nguyên tắc bản quyền:** app công khai trên mạng nên chỉ đưa vào giai điệu không còn bản quyền (luật SHTT Việt Nam: đời tác giả + 50 năm). Bài phải có ≥ 2 nguồn ký âm độc lập khớp nhau; máy đối chiếu từng nốt; chỉ dùng giai điệu, không dùng lời.

**13 bài mới (tổng 82):**
- **Dân ca:**
  - Gà gáy (Cống) — tuần 10
  - Lý cây xanh — tuần 11
  - Ngày mùa vui (giai điệu Thái) — tuần 13
  - Lý con sáo Gò Công — tuần 17
  - Cò lả — tuần 18
  - Mưa rơi (Xá) — tuần 18
  - Trống cơm — tuần 20
  - Bèo dạt mây trôi — tuần 24
  - Người ơi người ở đừng về (đoạn có nhịp) — tuần 27
  - Lý ngựa ô bản đầy đủ (39 ô, bài học riêng w24-ngua)
- **Nhạc sĩ Việt Nam xưa** (đã hết bảo hộ; ghi tên tác giả, giữ tên bài, ghi rõ "bản giản lược"):
  - Xuân và tuổi trẻ (La Hối, mất 1945) — tuần 17
  - Đêm thu, Con thuyền không bến (Đặng Thế Phong, mất 1942) — tuần 25–26
- **Không đưa vào:**
  - Đi cấy, Qua cầu gió bay, Cây trúc xinh, Ru con, Lý kéo chài, Ru em (thiếu nguồn độc lập);
  - Giọt mưa thu, các bài của Hoàng Việt (có thể còn bảo hộ ở nước ngoài);
  - Quốc ca (chưa có văn bản chính thức cho dùng tự do).

**"📝 Bố mẹ thêm bài"** (Phụ huynh): bố mẹ tự nhập bất kỳ bài nào, chỉ lưu trên iPad (dùng riêng trong gia đình).
- Gõ "Đô Rê Mi" (`-` kéo dài, `/` móc đơn, `'` `,` lên/xuống quãng 8, `|` vạch nhịp) hoặc chạm phím.
- Khuông hiện ngay, máy tự đánh ngón; học đủ mọi chế độ.

**Thư viện:**
- bộ lọc "🇻🇳 Bài Việt Nam" (dân ca, nhạc sĩ xưa, bài quen hát lời Việt, bài bố mẹ thêm);
- tên Việt "Sao nhỏ lấp lánh", "Leng keng";
- sửa nhãn dân ca nước ngoài.

**Kiểm tra:** 1156 test; robot e2e qua cả 5 kịch bản.

## 24. Báo cáo tiến bộ, 13 bài sáng tác mới, soát mã (2026-10-06)

- **📊 Báo cáo tiến bộ** (Phụ huynh → 📊 Báo cáo):
  - nội dung: hành trình qua các đảo, số ngày tập 8 tuần (biểu đồ, vạch mục tiêu 4 ngày), bài đã thuộc (🇻🇳 chỉ cho bài Việt Nam thật), kỹ năng đọc nốt / tai nghe / vỗ nhịp có so sánh 2 tuần trước, hai tay, tốc độ, sắc thái, sáng tác, điểm mạnh và bước tiếp theo;
  - **📤 Chia sẻ** thành ảnh PNG (qua bảng Chia sẻ của iPad) hoặc **🖨️ In** khổ A4.
- **13 bài sáng tác mới** (tổng 95), lấp chỗ thiếu: tuần nào cũng ≥ 2 bài; thêm bài tay trái, giọng thứ, ngũ cung Việt Nam, bài chuẩn bị Minuet / Für Elise.
- **Soát mã:**
  - tách màn bài hát thành 4 module;
  - bỏ 6 export thừa;
  - sửa 2 lỗi: lời kể chuyện ở màn chính có thể đọc đè sang màn sau; huy chương cấp 3 ghi sai "30 tuần".
- 1242 test; robot e2e qua 5 kịch bản.

## 25. Rà soát 3 góc nhìn (bé · bố mẹ · độ bền) — 2026-10-06

**Độ bền dữ liệu (nghiêm trọng, đã sửa).** Giả lập 1–2 năm dùng cho thấy dữ liệu vượt giới hạn ~5 MB của Safari sau khoảng 1,3–1,5 năm; app lỗi im lặng nên mất tiến độ.
- **Gộp gọn:** buổi cũ hơn 56 ngày được gộp vào bản tóm tắt `history`. 2 năm: 1,05 triệu → ~170 nghìn ký tự. Kiểm thử thuộc tính trên 2 năm ngẫu nhiên: sticker, báo cáo, bài thuộc, lịch ôn, tiêu chí không đổi.
- **Khi đầy:** tự gộp rồi thử lại; vẫn đầy thì báo chặn ở màn chính "Nhờ bố mẹ sao lưu".
- **Bản dự phòng:** chỉ giữ 1, đã gộp gọn. Xóa hoặc nhập khi không cất được dự phòng thì phải xác nhận lần nữa.
- **Ghi dữ liệu:** gom lại (~400 ms), nhanh hơn ~10 lần. Sticker đã nhận không mất khi hạ tuần.
- **Dữ liệu từ bản mới hơn:** báo rõ thay vì xóa.
- **Sau tuần 31:** bài "phai" sau 45 ngày.

**Bố mẹ:**
- Cài micro 3 bước, có nút "✅ Dùng micro cho các buổi học" (trước đây "Bật micro" không bật cho buổi học).
- "Việc cần làm tối nay" lên đầu, có "▶ Làm ngay"; sau ≥ 5 ngày nghỉ hiện "Mừng con quay lại".
- Trạng thái 🟢/🟡/🔴, nút "⏸ Ở lại tuần này thêm", cảnh báo 14 ngày; đổi tuần phải xác nhận.
- Phiếu chấm có hướng dẫn từng ý.
- Bảng dùng tên nốt tiếng Việt, ngày dd/mm.
- Nút 💾 Sao lưu ở đầu màn.
- Cách gõ bài dễ dãi hơn: "Đô-Rê-Mi"; chặn dấu phẩy ngăn cách; thêm dấu nối "~".
- Câu gợi ý bố mẹ nói với con; thẻ nhắc nhanh 5 bước; câu hỏi vào màn Phụ huynh khó hơn.

**Bé:**
- Tuần 1 được đàn thật ở khoảng màn 4 (trước ~27).
- Đàn đúng tự sang nốt.
- Trò tai nghe tối đa 6 lượt (tiêu chí ≥ 5/6, ở 2 ngày).
- Tách tay chỉ trên câu khó nhất.
- Lời mở đầu và lời khen đa dạng; linh vật phản ứng; "robot nạp năng lượng" khi 5 nốt đúng liên tiếp.
- Sao cuối buổi theo độ chính xác.
- Sticker "Chào mừng" và tóm tắt buổi; quả trứng bí ẩn.
- Cảnh chèo thuyền tới đảo mới; đảo chưa mở hiện "?".
- Thư viện có hình từng bài, chia "đang tập / đã thuộc / sắp mở"; sân khấu gọn.
- Màn bài hát bớt rối.
- Đàn tự do có trò "Đàn theo thầy".

**Kiểm tra:** 1293 test; robot e2e qua 5 kịch bản.

## 26. Safari (WebKit) + iPad đời cũ + soát lỗi sau đợt ghép lớn (2026-10-06)

- **Tương thích iPadOS 15.0+:**
  - **Lỗi thật đã sửa:** trên iPadOS < 16.4, màn bài hát hỏng khi lời giới thiệu > 60 ký tự (regex lookbehind trong `shortIntro`).
  - `build.target` = Safari 14.
  - `npm run compat`: kiểm tra cú pháp bản build (phải giống khi hạ xuống Safari 15), API không hạ được, API cần kiểm tra trước khi dùng, CSS rủi ro.
- **Chạy trên nhân WebKit thật** (`npm run webkit`, Playwright WebKit trên Windows):
  - 5 kịch bản qua, 0 lỗi; phông tiếng Việt hiển thị đúng; service worker chạy offline được.
  - Sửa: ô chọn tuần dùng phông có chân; bong bóng "Con làm thầy" rớt chữ.
  - **Chưa kiểm được trên bản WebKit này:** âm thanh, giọng đọc, micro, bảng Chia sẻ — cần iPad thật.
- **Soát lỗi sau đợt ghép:**
  - sticker bất ngờ thay đổi sau khi gộp dữ liệu không theo thứ tự ngày → nay tính lại theo thời gian từ bản tóm tắt nhỏ của mỗi buổi;
  - "Làm ngay" không tiêu trứng và lặp đúng tay bé vấp;
  - sao ở Thư viện còn sau khi gộp;
  - đổi tuần thì bỏ "Ở lại tuần";
  - trạng thái "sẵn sàng" không còn mâu thuẫn khi đang giữ tuần.
- **Màn bắt đầu:** không kẹt nếu âm thanh không mở được.
- 1294 test; e2e A, C, D, E qua.

## 27. Biên tập tiếng Việt + mở app nhanh hơn trên iPad cũ (2026-10-07)

- **Biên tập ~160 câu chữ / 32 file**, theo một quy ước chung:
  - xưng "con" khi nói với bé, "bé" khi nói với bố mẹ;
  - "app" khi chấm, "thầy" khi đàn mẫu;
  - thuật ngữ thống nhất ("dấu nối", "nốt trắng chấm dôi", "tốc độ" thay BPM);
  - câu đọc bằng giọng máy không còn ký hiệu, mã nốt (C4) hay dấu "/";
  - giọng máy đọc "nhịp 2/4" là "nhịp hai bốn", "5/6" là "5 trên 6".
- **Mở app nhanh hơn:**
  - mã tải lúc đầu 191 → 88 KB (gzip); thời gian dịch mã khi mở ~1/4 (máy làm chậm ×20);
  - các màn ít dùng (Phụ huynh, Báo cáo, Soạn bài, Thử micro, Thư viện, Sticker, Ngẫu hứng, Sân khấu) chỉ tải khi cần và được tải sẵn ở nền;
  - dữ liệu bài hát dạng `JSON.parse` (nhanh hơn);
  - phông chữ màn bắt đầu được tải trước;
  - offline vẫn mở được mọi màn.
- **Kiểm tra:** 1295 test; compat iPadOS 15+; e2e A, C, D, E; WebKit P, A, C, B, D.

## 28. "🩺 Kiểm tra iPad" — gửi thông tin máy thật cho người hỗ trợ (2026-10-07)

Phụ huynh → Nâng cao (hoặc thẻ Cài micro) → 🩺 Kiểm tra iPad. Bảy mục ✅/⚠️/❌, mỗi mục có cách khắc phục:
- **Thiết bị:** phiên bản iPadOS (đọc được cả UA "giả Mac" của iPadOS), mở từ Màn hình chính chưa, phiên bản app, màn hình.
- **Âm thanh:** 🔊 Phát thử, bố mẹ trả lời "Nghe rõ / Không".
- **Giọng đọc:** có giọng tiếng Việt không; 🗣️ Nghe thử; hướng dẫn cài giọng "Linh" 5 bước.
- **Micro:** quyền, cài đặt, kết quả "Kiểm tra 5 nốt" gần nhất.
- **Lưu trữ:** dung lượng, lưu bền, ngày sao lưu.
- **Offline:** service worker, bộ nhớ đệm.
- **Hiệu năng:** đo nhanh.

Ô "Góp ý của bố mẹ" và nút **📤 Gửi kết quả** (Chia sẻ, sao chép hoặc ô chữ để chọn) gom báo cáo tiếng Việt kèm phụ lục kỹ thuật và nhật ký micro gần nhất. Không kèm tên bé, trừ khi bố mẹ đánh dấu.

1322 test; build; compat iPadOS 15+; e2e C.

## 29. Thêm nội dung học: 🎮 Trò chơi + 🏆 Thử thách tuần (OWNER chọn 2026-10-07)

- **🎮 Trò chơi** (nút ở thanh dưới màn chính), độ khó theo tuần giáo trình, lưu kỷ lục (`AppData.games`):
  - **⚡ Đọc nốt nhanh:** 60 giây; khóa Fa từ tuần 11, dòng kẻ phụ / nốt cao từ tuần 23; trước tuần 8 đọc tên nốt; micro bật thì đàn trên đàn thật.
  - **🥁 Đố nhịp:** 8 lượt, chỉ dùng hình nhịp đã học, 3 thẻ luôn nghe khác nhau, lượt cuối 2 ô nhịp.
  - **🎵 Nghe đoán bài:** 6 lượt, câu đầu của bài đã mở hoặc đã chơi, 3 tên bài khác hẳn nhau.
- **🏆 Thử thách tuần:** mỗi tuần (thứ Hai – Chủ nhật) một thử thách theo tuần giáo trình.
  - Các thử thách: 📅 Bốn ngày chăm · 🐇 Nhanh hơn (+ 1 nấc tốc độ) · 🎯 Không sai nốt · 🔁 Ôn 3 bài cũ · 🇻🇳 Bài quê hương · 👂 Tai thính · 🎮 Phá kỷ lục.
  - Màn chính hiện dòng tiến độ; bảng chi tiết có "▶ Làm ngay"; cuối buổi ăn mừng khi xong.
  - Sổ sticker có mục "🏆 Thử thách": cúp từng tuần và chuỗi tuần liền. Vẫn giữ nguyên sau khi gộp dữ liệu.
- Buổi học được tải sẵn sớm hơn (300 ms sau khi màn chính hiện).
- 1359 test; compat iPadOS 15+; e2e A–E qua.

## 30. Micro nhạy hơn với tiếng đàn nhẹ (iPad thật, 2026-10-08)
- Phụ huynh báo: "phải đánh thật to mới nghe được (ví dụ nốt đô)". Chẩn đoán từ iPad thật: iPadOS 26.6, 48 kHz, chưa từng chạy Kiểm tra 5 nốt.
- Nguyên nhân chính: ngưỡng tối thiểu cố định 0.0008 (≈ −62 dBFS) áp cho mọi mức độ nhạy. Tiếng đàn nhẹ thu được trên iPad (mic thô, đã tắt xử lý giọng) chỉ khoảng −60…−66 dBFS nên bị chặn, và chọn "Vừa" hay "Cao" đều không đổi gì.
- Đã sửa:
  - Ngưỡng tối thiểu theo từng mức độ nhạy. Hệ số đổi từ 5/3/2 thành 5/2.2/1.6.
  - Thêm cách nhận nốt mới theo cao độ, không cần tiếng to dần lên.
  - Không còn báo nhầm nốt Đô2 khi đánh nhẹ lúc nốt trước còn ngân.
  - Không còn báo trùng một nốt khi tiếng đàn lơ lửng sát ngưỡng.
  - Khi app tự đo tiếng ồn phòng lúc mở micro, tiếng ồn đột ngột không làm việc đo dừng sớm.
  - Trong buổi học, app tự tăng độ nhạy từng nấc khi thấy nhiều nốt nhẹ bị hụt.
  - Màn "Cài micro" nhắc chạy Kiểm tra 5 nốt.
- Bench: 14 kịch bản "NHẸ" mới, gồm cả giả lập bộ lọc ồn của iOS. Tổng từ 74% lên khoảng 99%. 21 kịch bản cũ đạt 100%. 0 nốt ma ở phòng im lặng, quạt hoặc tiếng nói. Độ trễ giữ nguyên, trung vị 68 ms. Hợp âm 160/160.
- 1384 test; compat iPadOS 15+; e2e nhanh qua.
