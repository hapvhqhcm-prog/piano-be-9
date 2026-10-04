# Piano bé — PIANO-BE-9-TUOI (3 cấp · 24 tuần · luyện tập mỗi ngày)

**Bản đang chạy:** https://hapvhqhcm-prog.github.io/piano-be-9/

App "thầy giáo hướng dẫn" chạy trên iPad (Safari), đặt trên giá nhạc của đàn piano cơ:
chỉ phím, chỉ ngón, phát âm mẫu. Khi bật micro, app **nghe đàn cơ và tự chấm** từng nốt; khi tắt, bố/mẹ bấm "Đúng rồi / Thử lại".

- Vite + TypeScript + Vanilla DOM + Web Audio (OscillatorNode) + PWA + localStorage
- **0 thư viện runtime.** Không backend, không đăng nhập, không analytics, không CDN.
- **Micro (tùy chọn, mặc định tắt):** app nghe đàn cơ và tự chấm từng nốt — xử lý ngay trên iPad,
  không ghi âm, không gửi đi đâu. Đây là quyền duy nhất app xin (OWNER mở khóa ngày 2026-10-04).
- Offline-first: sau lần mở đầu tiên từ GitHub Pages, app chạy hoàn toàn không cần mạng.

## Có gì trong app

- **3 cấp × 8 tuần** (bản đồ đảo mỗi cấp), sau đó **Luyện tập mỗi ngày** không có điểm dừng:
  - **Cấp 1 · Làm quen** (1–8): bàn phím, thế Đô hai tay, nhịp cơ bản, đọc nốt khóa Sol, La duỗi ngón.
  - **Cấp 2 · Hai tay** (9–16): Đô giữa tay trái & khóa Fa, hai tay luân phiên → cùng lúc, thế Sol, nhịp 3/4,
    phím đen (Fa♯, Mi♭), nốt chấm dôi & móc đơn, gam Đô trưởng luồn ngón, hòa nhạc Cấp 2.
  - **Cấp 3 · Thành thạo** (17–24): hợp âm I–IV–V tay trái, đổi thế tay, trưởng/thứ, Minuet, Für Elise, Canon,
    đọc nhạc hai khóa chỉ nhìn khuông, Đại hòa nhạc.
- **Mỗi buổi 10–15'**: Tư thế → Ôn nhanh → Khởi động tai/đọc nốt → Bài mới → Con làm thầy → Tự đánh giá.
- **Trò chơi**: Lên hay xuống? · Bước hay nhảy? · Nốt nào đây? (có mốc) · Đọc nốt khóa Sol/Fa · Vui hay buồn? (trưởng/thứ) · Nhại lại · Vỗ nhịp.
- **49 bài hát** public domain / tự sáng tác + 2 bài tập nhịp; **Thư viện** (⭐ bài đã thuộc) để bé tự chọn bài.
- **Đọc nhạc ngẫu nhiên**: app sinh đoạn nhạc mới mỗi lần (đúng thế tay, nhịp 4/4 hoặc 3/4) — luyện đọc vô hạn.
- **Màn bài hát**: Từng nốt (chờ bé đàn đúng) · Theo nhịp (đếm vào, máy gõ nhịp, nhạc đệm; con trỏ hoặc băng chuyền) ·
  tập từng câu · tốc độ 40/50/60 · khuông nhạc với gợi ý rút dần (phím sáng → tên nốt → chỉ khuông).
- **Micro (tùy chọn)** chấm từng nốt và chấm nhịp; không có micro thì bố mẹ đánh giá.
- **"Video" minh họa tự sinh**: bàn tay thầy giáo hoạt hình đàn mẫu trên chính bàn phím của màn hình (đúng ngón, đúng phím,
  có tiếng và phụ đề) — tự phát khi mở mỗi phần bài học, nút 🎬 Xem lại / 🎬 Xem mẫu cho mọi bài hát (cả hai tay, luồn ngón).
- **Giao diện**: nhân vật "Bé Nốt", bàn tay vẽ mới (móng, đốt ngón, số trên đầu ngón), phím đàn có chiều sâu, pháo giấy khi
  làm đúng, tranh minh họa tư thế ngồi, bản đồ đảo — toàn bộ bằng CSS/SVG, không tải ảnh/video.
- Chạm phím → **số ngón nảy lên** + hình bàn tay; tay trái màu cam từ tuần 6; La = ngón 5 duỗi từ tuần 7.

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
- RH: mọi nốt trong C4–G4, ngón đúng §6 (C4=1 D4=2 E4=3 F4=4 G4=5); bài có `"extension": "A4"` thêm A4 = ngón 5 duỗi (chỉ tuần 7–8).
- LH: C3–G3 (C3=5 D3=4 E3=3 F3=2 G3=1).
- Tổng phách chia hết cho 4. Không thêm trường lạ.
- Mọi thay đổi bài hát cần OWNER duyệt (CURRICULUM LOCK). Thêm bài thì sửa số lượng trong `tests/song-validation.test.ts`.
- Muốn bài xuất hiện trong giáo trình: thêm `{ kind: 'song', songId: '…' }` vào bài học trong `src/lessons/weekN.ts`.
  Mọi bài tự xuất hiện trong **Thư viện** từ tuần `week`.

## Cấu trúc

```
src/audio/        AudioEngine.ts (tiếng giống piano, gõ nhịp), pitchDetect.ts (YIN), MicListener.ts
src/music/        tune.ts (bài hát, câu, nhạc đệm), timing.ts (chấm nhịp), staff.ts (khuông), exercises.ts
src/piano/        pitchTable.ts, fingering.ts (khóa cứng §6 + A4 duỗi), PianoKey.ts, PianoKeyboard.ts
src/practice/     PracticeStateMachine.ts (§5), quiz.ts (trò nghe/đọc)
src/lessons/      lessonEngine.ts (kế hoạch buổi, tiêu chí 8 tuần), week1–8.ts, types.ts, targets.ts
src/progress/     schema.ts (v1), migrations.ts, ProgressStore.ts
src/ui/           App.ts, screens/, components/
src/pwa/          sw-template.js (vite.config.ts sinh dist/sw.js)
tests/            test tự động: ngón, cao độ, schema, bài hát, state machine, giáo trình, micro, nhịp, khuông, trò chơi
scripts/          make-icons.mjs (sinh icon PNG), deploy.mjs
```

## Micro — bật & thử trên đàn thật

1. Mở app từ biểu tượng trên Màn hình chính (bản GitHub Pages, **https**).
2. Giữ nút **Phụ huynh** 2 giây → phép cộng → **Cài đặt → 🎤 Thử micro** → **Bật micro** → chọn **Cho phép**.
3. Đàn vài phím: app phải hiện đúng tên nốt. Bấm **Chỉnh theo đàn nhà** → đàn Đô giữa 3 lần.
4. Quay lại Cài đặt → **Nghe đàn bằng micro: Bật**.
5. Vào bài học: sau khi âm mẫu phát xong, dòng "🎤 Đang nghe…" xuất hiện → bé đàn trên đàn cơ.

Đặt iPad trên giá nhạc là đủ gần. Nếu nhận sai nhiều: tắt TV/quạt to, làm lại bước "Chỉnh theo đàn nhà".
Bản LAN (`http://192.168…`) **không** dùng được micro — iOS chỉ cho micro trên https.

## Hạn chế đã biết

- Micro chỉ nhận **một nốt mỗi lần**; phòng ồn có thể nhận nhầm → bố mẹ bấm **Sửa**. Khi tắt micro, kết quả trên đàn cơ = nút bố/mẹ bấm (PARENT_ASSESSMENT).
- **Safari và app ở Màn hình chính có bộ nhớ RIÊNG trên iPad.** Tiến độ làm trong tab Safari
  không sang app đã cài. Hãy luôn mở bằng biểu tượng trên Màn hình chính.
- Dữ liệu chỉ nằm trên iPad. Nên **Xuất JSON / Sao chép JSON** định kỳ ở màn Phụ huynh.
  Trong app ở Màn hình chính, nút tải file của iOS đôi khi không chạy → dùng "Sao chép JSON" rồi dán vào Ghi chú.
- Âm thanh: nếu im lặng, kiểm tra âm lượng và công tắc/chế độ im lặng (iPadOS 17+ đã được xử lý bằng
  `audioSession = playback`; bản cũ hơn có thể bị tắt tiếng khi bật im lặng).
- Khi iPad khóa màn hình / chuyển app, âm thanh bị tạm dừng → app hiện nút "Chạm để bật lại âm thanh".
- Hết thời lượng buổi được kiểm tra **cuối mỗi đoạn bài**, nên buổi có thể dài hơn 1–2 phút.
- "Tối đa 2 buổi/ngày" chỉ hiện lời nhắc nhẹ, không khóa (theo §9).
- Âm thanh oscillator nghe "điện tử", không giống piano — cố ý cho Phase 1 (sample ở Phase 3).
