# Piano bé — PIANO-BE-9-TUOI (Phase 1)

**Bản đang chạy:** https://hapvhqhcm-prog.github.io/piano-be-9/

App "thầy giáo hướng dẫn" chạy trên iPad (Safari), đặt trên giá nhạc của đàn piano cơ:
chỉ phím, chỉ ngón, phát âm mẫu. **App không nghe đàn** — bố/mẹ bấm "Đúng rồi / Thử lại".

- Vite + TypeScript + Vanilla DOM + Web Audio (OscillatorNode) + PWA + localStorage
- **0 thư viện runtime.** Không backend, không đăng nhập, không analytics, không CDN, không xin quyền gì.
- Offline-first: sau lần mở đầu tiên từ GitHub Pages, app chạy hoàn toàn không cần mạng.

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

File ở `src/data/songs/*.json`, định dạng v1 (§12), chỉ các trường:

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
  "notes": [{ "pitch": "E4", "beats": 1, "finger": 3 }]
}
```

Luật (test `tests/song-validation.test.ts` kiểm tra tự động):
- RH: mọi nốt trong C4–G4, ngón đúng §6 (C4=1 D4=2 E4=3 F4=4 G4=5).
- LH: C3–G3 (C3=5 D3=4 E3=3 F3=2 G3=1).
- Tổng phách chia hết cho 4. Không thêm trường lạ.
- Mọi thay đổi bài hát cần OWNER duyệt (CURRICULUM LOCK). Thêm bài mới cần thêm vào danh sách trong test.

Bài hát chưa được dùng trong app ở Phase 1 (Phase 2 mới dùng).

## Cấu trúc

```
src/audio/        AudioEngine.ts — oscillator triangle + ADSR, không phụ thuộc DOM
src/piano/        pitchTable.ts, fingering.ts (khóa cứng §6), PianoKey.ts, PianoKeyboard.ts
src/practice/     PracticeStateMachine.ts (§5), EarGame.ts (APP_ASSESSMENT)
src/lessons/      lessonEngine.ts, week1–3.ts, types.ts, targets.ts
src/progress/     schema.ts (v1), migrations.ts, ProgressStore.ts
src/ui/           App.ts, screens/, components/
src/pwa/          sw-template.js (vite.config.ts sinh dist/sw.js)
tests/            70 test: fingering, pitchTable, schema, song-validation, state machine, lessons, audio
scripts/          make-icons.mjs (sinh icon PNG), deploy.mjs
```

## Hạn chế đã biết

- **App không nghe được đàn thật.** Kết quả trên đàn cơ = nút bố/mẹ bấm (PARENT_ASSESSMENT).
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
