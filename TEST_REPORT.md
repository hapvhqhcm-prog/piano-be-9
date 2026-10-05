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
