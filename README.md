# Piano bé — PIANO-BE-9-TUOI (3 cấp · 31 tuần · luyện tập mỗi ngày)

**Bản đang chạy:** https://hapvhqhcm-prog.github.io/piano-be-9/

App "thầy giáo hướng dẫn" chạy trên iPad (Safari), đặt trên giá nhạc của đàn piano cơ:
chỉ phím, chỉ ngón, phát âm mẫu. Khi bật micro, app **nghe đàn cơ và tự chấm** từng nốt; khi tắt, bố mẹ bấm "Đúng rồi / Thử lại".

- Vite + TypeScript + Vanilla DOM + Web Audio (OscillatorNode) + PWA + localStorage
- **0 thư viện runtime.** Không backend, không đăng nhập, không analytics, không CDN.
- **Micro (tùy chọn, mặc định tắt):** app nghe đàn cơ và tự chấm từng nốt — xử lý ngay trên iPad,
  không gửi đi đâu. Đây là quyền duy nhất app xin (OWNER mở khóa ngày 2026-10-04).
- **🎧 Nghe lại con đàn (OWNER duyệt 2026-10-06):** khi micro đang bật, app ghi **tạm** lượt đàn (tối đa 60 giây)
  để bé nghe lại. Bản ghi chỉ nằm trong bộ nhớ (Blob), **không lưu xuống máy, không gửi đi**; lượt mới, rời màn
  hay tắt app là xóa. Micro tắt thì không bao giờ ghi.
- Offline-first: sau lần mở đầu tiên từ GitHub Pages, app chạy hoàn toàn không cần mạng.

## Có gì trong app

- **3 cấp, 31 tuần** (giáo trình v5/v5.1, OWNER duyệt 2026-10-05 và 2026-10-06), sau đó **Luyện tập mỗi ngày** không có điểm dừng.
  **Mục tiêu cuối nói thật: ≈ hoàn thành Faber cấp 1 / đầu cấp 2** (không phải "thành thạo" theo nghĩa nhạc viện).
  - **Cấp 1 · Làm quen** (1–10): bàn phím, thế Đô hai tay, nhịp Đi / Chạy-chạy (tuần 4) / 2/4 (tuần 9), đọc nốt khóa Sol theo
    NỐT MỐC & QUÃNG, to/nhỏ (f/p), nốt La (Sol–La ngón 4–5), ngẫu hứng phím đen, Hỏi – Đáp; tuần củng cố 5; hòa nhạc tuần 10.
  - **Cấp 2 · Hai tay** (11–21): Đô giữa tay trái & khóa Fa (nốt mốc), hai tay luân phiên → cùng lúc, củng cố hai tay (tuần 13),
    thế Sol, nhịp 3/4, phím đen (Fa♯, Mi♭), chấm dôi, MÓC KÉP (tuần 18), NGHỊCH PHÁCH & DẤU NỐI (tuần 19), gam luồn ngón (tuần 20),
    sáng tác 4 ô nhịp; hòa nhạc Cấp 2 (tuần 21).
  - **Cấp 3 · Vững vàng** (22–31): hợp âm I–IV–V, DÒNG KẺ PHỤ & KHUÔNG LỚN (tuần 23), đổi thế, trưởng/thứ, nốt cao Đô cao–Sol cao,
    đọc nhạc hai khóa, bài hai tay, rồi Minuet (tuần 29), Für Elise (tuần 30), Đại hòa nhạc (tuần 31).
- **Khởi động kỹ thuật 1 phút** đầu tuần (thả rơi cánh tay, xoay cổ tay, tay tròn, gõ ngón, 5 ngón to/nhỏ, luồn ngón cái).
- **Tiêu chí qua tuần** bằng bài hát: đạt ở **2 ngày khác nhau** (micro, hoặc phiếu 3 ý của bố mẹ: đúng nốt · đều nhịp · đúng ngón).
- **Mỗi buổi 10–15 phút**: Tư thế → Ôn nhanh → Khởi động tai/đọc nốt → Bài mới → Con làm thầy → Tự đánh giá.
- **Trò chơi**: Lên hay xuống? · Bước hay nhảy? · Nốt nào đây? (có mốc) · Đọc nốt khóa Sol/Fa · Nốt mốc · Giống/bước/nhảy trên khuông (quãng) · Vui hay buồn? · Nhại lại · Vỗ nhịp · Sáng tạo (phím đen, hỏi – đáp, sáng tác).
- **95 bài** (public domain / dân ca Việt Nam / tự sáng tác, kể cả bài tập gam); **Thư viện** (⭐ bài đã thuộc) để bé tự chọn bài.
- **Đọc nhạc ngẫu nhiên**: app sinh đoạn nhạc mới mỗi lần (đúng thế tay, nhịp 4/4 hoặc 3/4) — luyện đọc vô hạn.
- **Màn bài hát**: Từng nốt (chờ bé đàn đúng) · Theo nhịp (đếm vào, máy gõ nhịp, nhạc đệm; con trỏ hoặc băng chuyền) ·
  tập từng câu · tốc độ 40/50/60 · khuông nhạc với gợi ý rút dần (phím sáng → tên nốt → chỉ khuông).
- **Micro (tùy chọn)** chấm từng nốt và chấm nhịp; không có micro thì bố mẹ đánh giá.
- **"Video" minh họa tự sinh**: bàn tay thầy giáo hoạt hình đàn mẫu trên chính bàn phím của màn hình (đúng ngón, đúng phím,
  có tiếng và phụ đề) — tự phát khi mở mỗi phần bài học, nút 🎬 Xem lại / 🎬 Xem mẫu cho mọi bài hát (cả hai tay, luồn ngón).
- **Giao diện**: nhân vật "Bé Nốt", bàn tay vẽ mới (móng, đốt ngón, số trên đầu ngón), phím đàn có chiều sâu, pháo giấy khi
  làm đúng, tranh minh họa tư thế ngồi, bản đồ đảo — toàn bộ bằng CSS/SVG, không tải ảnh/video.
- Chạm phím → **số ngón nảy lên** + hình bàn tay; tay trái màu cam từ tuần 7; La = ngón 5 duỗi từ tuần 8.

## Chạy trên máy (Windows)

Cần Node.js 20+ (`node -v`).

```bash
npm install
npm test          # chạy test tự động
npm run dev       # server dev, mở cả mạng LAN
```

### Thử trên iPad qua LAN (chỉ để thử giao diện / âm thanh / cảm ứng)

1. Máy tính và iPad cùng Wi-Fi.
2. `npm run dev` → dòng `Network: http://192.168.x.x:5173/` là địa chỉ cần mở.
   (Nếu Windows Firewall hỏi, chọn cho phép mạng Private.)
3. Trên iPad mở Safari → gõ địa chỉ đó → xoay ngang → bấm **Bắt đầu**.

> Bản LAN chạy HTTP nên **không có service worker / offline**. Đừng "Thêm vào Màn hình chính"
> từ bản LAN, và đừng coi đây là bài test PWA. Test offline phải làm trên bản GitHub Pages.

## Build

```bash
npm run build     # → dist/ (gồm sw.js có danh sách precache tự sinh)
npm run preview   # xem bản build tại http://localhost:4173 (localhost có service worker)
```

## Deploy lên GitHub Pages

Lần đầu:

```bash
git init
git add -A
git commit -m "Piano bé Phase 1"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/piano-be-9.git
git push -u origin main
npm run deploy
```

Sau đó trên GitHub: **Settings → Pages → Source: Deploy from a branch → `gh-pages` / (root)**.
App sẽ ở `https://<tài-khoản>.github.io/piano-be-9/` (1–2 phút sau).

Các lần sau chỉ cần `npm run deploy` (script chạy test → build → đẩy `dist/` lên nhánh `gh-pages`).
iPad nhận bản mới ở **lần mở thứ hai** sau khi deploy (lần đầu tải ngầm, lần sau dùng).

## Thêm / sửa bài hát JSON

File ở `src/data/songs/*.json` (định dạng v2 — v1 §12 + `week`, `phrases`, `extension`, dấu lặng `rest`).
Cách nhanh nhất: sửa danh sách trong `scripts/gen-songs.py` rồi chạy `py scripts/gen-songs.py`.
Định dạng v3 thêm: `position` / `lhPosition` (thế tay: C, MC, G, D, Cm, Am, free), `hand: "BOTH"` + `lh` (bè tay trái),
`also` (hợp âm), nốt giáng `Bb4`, nhịp 3/4, nốt chấm dôi (1.5 / 3 phách).
Các trường:

```json
{
  "id": "ten_bai_easy",
  "title": "Tên gốc",
  "titleVi": "Tên tiếng Việt",
  "composer": "Tác giả (phải là public domain)",
  "sourceStatus": "public-domain",
  "arrangementBy": "Original simple 5-finger arrangement for this app",
  "attributionRequired": false,
  "hand": "RH",
  "bpm": 60,
  "timeSignature": "4/4",
  "week": 5,
  "extension": "A4",
  "phrases": [0, 4],
  "notes": [{ "pitch": "E4", "beats": 1, "finger": 3 }, { "rest": true, "beats": 1 }]
}
```

Luật (test `tests/song-validation.test.ts` kiểm tra tự động):
- RH: mọi nốt trong C4–G4, ngón đúng §6 (C4=1 D4=2 E4=3 F4=4 G4=5); bài có `"extension": "A4"` thêm A4 = ngón 5 duỗi (từ tuần 8).
- LH: C3–G3 (C3=5 D3=4 E3=3 F3=2 G3=1).
- Tổng phách tròn ô nhịp. Không thêm trường lạ. p/mf/f từ tuần 6, ngắt/luyến từ tuần 12, nhịp 2/4 từ tuần 9, móc kép từ tuần 18 (gen-songs.py tự kiểm).
- Mọi thay đổi bài hát cần OWNER duyệt (CURRICULUM LOCK). Thêm bài thì sửa số lượng trong `tests/song-validation.test.ts`.
- Muốn bài xuất hiện trong giáo trình: thêm `{ kind: 'song', songId: '…' }` vào bài học trong `src/lessons/weekN.ts`.
  Mọi bài tự xuất hiện trong **Thư viện** từ tuần `week`.

## Cấu trúc

```
src/audio/        AudioEngine.ts (tiếng giống piano, gõ nhịp), pitchDetect.ts (YIN), MicListener.ts
src/music/        tune.ts (bài hát, câu, nhạc đệm), timing.ts (chấm nhịp), staff.ts (khuông), exercises.ts
src/piano/        pitchTable.ts, fingering.ts (khóa cứng §6 + A4 duỗi), PianoKey.ts, PianoKeyboard.ts
src/practice/     PracticeStateMachine.ts (§5), quiz.ts (trò nghe/đọc)
src/lessons/      lessonEngine.ts (kế hoạch buổi, tiêu chí 30 tuần), week1–10.ts, level2.ts, level3.ts, types.ts, targets.ts
src/progress/     schema.ts (v1, CURRICULUM_REV 3), migrations.ts (rev 1→2→3, bảng tuần OLD→NEW), ProgressStore.ts
src/ui/           App.ts, screens/, components/
src/pwa/          sw-template.js (vite.config.ts sinh dist/sw.js)
tests/            test tự động: ngón, cao độ, schema, bài hát, state machine, giáo trình, micro, nhịp, khuông, trò chơi
scripts/          make-icons.mjs (sinh icon PNG), deploy.mjs
```

## Micro — bật & thử trên đàn thật

1. Mở app từ biểu tượng trên Màn hình chính (bản GitHub Pages, **https**).
2. Giữ nút **Phụ huynh** 2 giây → tính nhẩm → **🎤 Cài micro (3 bước)** → **1. Cho phép micro** → chọn **Cho phép**.
3. **2. Kiểm tra 5 nốt**: đàn lần lượt từng phím app yêu cầu. Nếu micro nghe lệch nửa cung: **Chỉnh theo đàn nhà** → đàn Đô giữa 3 lần.
4. **3. Dùng micro cho các buổi học**.
5. Vào bài học: sau khi âm mẫu phát xong, dòng "🎤 Đang nghe…" xuất hiện → bé đàn trên đàn cơ.

Đặt iPad trên giá nhạc là đủ gần. Nếu nhận sai nhiều: tắt TV/quạt to, làm lại bước "Chỉnh theo đàn nhà".

**Kiểm tra 5 nốt** giờ **tự chỉnh độ nhạy** (Thấp/Vừa/Cao) theo độ to của từng nốt so với tiếng ồn phòng
(ví dụ: "Đã tự chỉnh độ nhạy: Cao — vì tiếng đàn tới micro khá nhỏ"), gợi ý "Chỉnh theo đàn nhà" khi nốt đủ to mà
bị nghe lệch nửa cung, hoặc bớt ồn; bấm **Kiểm tra lại** để thử với độ nhạy mới. Phần **Đàn tự do — bố mẹ chấm
micro**: mỗi nốt micro nghe được, bố mẹ chạm ✅ Đúng / ❌ Sai → ra tỉ lệ nhận đúng THẬT với đàn nhà.
**Sao chép nhật ký** (gửi người hỗ trợ) gồm: tần số lấy mẫu, độ trễ, kiểu phiên âm thanh iOS, các bộ lọc iOS
**thật sự** áp dụng cho micro (`track.getSettings()`: lọc tiếng vọng / giảm ồn / tự chỉnh âm lượng — app xin tắt
nhưng iOS có thể ép bật, màn hình cũng cảnh báo), thống kê khung (khung trễ), từng nốt kiểm tra (độ to, ồn nền,
ngưỡng, 3 nốt ứng viên + độ rõ + độ lệch (cent; 100 cent = nửa cung), độ trễ gõ phím → nhận nốt), kết quả tự chỉnh và bảng chấm của bố mẹ.
Bản LAN (`http://192.168…`) **không** dùng được micro — iOS chỉ cho micro trên https.

## Hạn chế đã biết

- Micro chỉ nhận **một nốt mỗi lần**; phòng ồn có thể nhận nhầm → bố mẹ bấm **Sửa**. Khi tắt micro, kết quả trên đàn cơ = nút bố mẹ bấm (PARENT_ASSESSMENT).
- **Safari và app ở Màn hình chính có bộ nhớ RIÊNG trên iPad.** Tiến độ làm trong tab Safari
  không sang app đã cài. Hãy luôn mở bằng biểu tượng trên Màn hình chính.
- Dữ liệu chỉ nằm trên iPad. Nên bấm **💾 Sao lưu** mỗi tuần ở màn Phụ huynh (bảng Chia sẻ của iOS → **Lưu vào Tệp**,
  hoặc dán vào Ghi chú nếu app đã chép dữ liệu).
- Âm thanh: nếu im lặng, kiểm tra âm lượng và công tắc/chế độ im lặng (iPadOS 17+ đã được xử lý bằng
  `audioSession = playback`; bản cũ hơn có thể bị tắt tiếng khi bật im lặng).
- Khi iPad khóa màn hình / chuyển app, âm thanh bị tạm dừng → app hiện nút "Chạm để bật lại âm thanh".
- Hết thời lượng buổi được kiểm tra **cuối mỗi đoạn bài**, nên buổi có thể dài hơn 1–2 phút.
- "Tối đa 2 buổi/ngày" chỉ hiện lời nhắc nhẹ, không khóa (theo §9).
- Âm thanh oscillator nghe "điện tử", không giống piano — cố ý cho Phase 1 (sample ở Phase 3).
