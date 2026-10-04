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
