# TỰ PHẢN BIỆN — Piano bé (2026-10-04)

Mục đích: nhìn lại chương trình bằng con mắt khó tính — sư phạm, trải nghiệm của bé & bố mẹ, kỹ thuật —
rồi sửa những gì đáng sửa nhất. Phần "Chưa làm" ghi rõ để OWNER quyết.

## A. Sư phạm

| # | Điểm yếu tìm ra | Vì sao quan trọng | Đã sửa |
|---|---|---|---|
| A1 | Bé sai nhiều lần cùng một nốt, app chỉ nói "Thử lại nhé" | Trẻ 9 tuổi dễ nản sau 2–3 lần thất bại liên tiếp | **Trợ giúp thích ứng**: sai ≥ 2 lần → thầy đàn mẫu lại đúng nốt đó; micro nghe sai 3 lần → bàn tay mờ hiện đúng chỗ |
| A2 | Buổi 10–15' nhưng khởi động 8–10 lượt + ôn + tư thế + làm thầy chiếm 4–5' | Phần "bài mới" bị ép, bé mệt trước khi vào bài chính | Khởi động **tối đa 6 lượt**; chỉ tuần có tiêu chí tai nghe (3, 6, 19) giữ 10 lượt |
| A3 | Không có lộ trình tốc độ: đạt ở 40 rồi thì sao? | Tập chậm → nhanh dần là cách luyện hiệu quả nhất | **Thang tốc độ**: đạt → nút "🐇 Nhanh hơn" (40 → 50 → 60 → 72) |
| A4 | Vỗ nhịp phải nhờ bố mẹ chấm | Bố mẹ không học nhạc khó đánh giá "đều" hay không | **Micro chấm tiếng vỗ tay**: sau đếm vào, tắt tiếng tích để micro nghe rõ; tô xanh/cam từng ô; vỗ thừa nhiều cũng chưa đạt |
| A5 | Micro chấm nhịp có thể quá khắt khe cho trẻ | Bị chấm trượt hoài → mất động lực | Cài đặt **Dễ / Vừa / Khó** (mặc định **Dễ**) |

## B. Trải nghiệm của bé & bố mẹ

| # | Điểm yếu | Đã sửa |
|---|---|---|
| B1 | Bé & bố mẹ không thấy mục tiêu "4–5 buổi/tuần" (§1) | Màn chính: **5 chấm tuần này**, **🔥 chuỗi ngày liền**, **🎯 mục tiêu của đảo** |
| B2 | Bố mẹ không học nhạc không biết nên để ý gì | **Mẹo cho bố mẹ** riêng cho từng tuần (24 mẹo) — ở màn chính và màn Phụ huynh |
| B3 | Dữ liệu chỉ nằm trên iPad, không có gì nhắc sao lưu | Màn Phụ huynh **nhắc sao lưu** nếu > 2 tuần chưa xuất/sao chép JSON |
| B4 | Lời khen lặp một câu → nhàm | **Lời khen / động viên đa dạng** (chọn ngẫu nhiên) |
| B5 | Chữ chuyên môn "BPM" trong mục tiêu | Đổi thành "tốc độ 60" |

## C. Kỹ thuật

Một agent rà lỗi độc lập (chỉ đọc code) đã soát các màn chính; các lỗi xác nhận được sửa ở mục D.
Thêm từ lần này: gỡ bộ nghe tiếng vỗ khi rời màn giữa chừng.

## D. Lỗi tìm được từ rà soát độc lập

| Mức | Lỗi | Hậu quả nếu không sửa | Đã sửa |
|---|---|---|---|
| **NGHIÊM TRỌNG** | Kiểm tra dữ liệu chỉ chấp nhận tuần ≤ 8 (sót lại từ Cấp 1) | **Lên tuần 9 → lần mở app sau, toàn bộ tiến độ bị đặt lại** | Giới hạn mới 52 tuần + **tự khôi phục** bản bị đặt lại (cất ở khóa `corrupt-*`) + test tuần 9/16/24 |
| Cao | Bấm "Bắt đầu" 2 lần / rời màn khi micro đang mở → bài chạy 2 lần, tiếng tích vang sang màn khác, ghi lượt chơi giả | Âm thanh lộn xộn, số liệu sai | Chặn bấm lặp, kiểm tra màn còn mở sau khi chờ micro |
| Cao | Tắt micro đúng lúc nó đang mở → micro vẫn bật ngầm | iPad nghe ngầm, chế độ ghi âm | Bộ đếm "thế hệ": micro mở xong mà đã bị tắt thì đóng ngay |
| Trung bình-cao | Chế độ chờ có micro: không có nút đi tiếp nếu micro không nhận ra nốt | Bé kẹt ở một nốt | Luôn có nút "Bố mẹ: tiếp" (không tính điểm micro) |
| Trung bình | Bài kiểm tra tuần 1 có "Ôn nhanh" → một lần "Thử lại" khi ôn làm trượt 10/10 | Không qua được tuần 1 dù làm đúng | Bài kiểm tra tuần không có ôn nhanh |
| Trung bình | "Thử lại" cùng nốt giữ trạng thái micro lượt trước | Hợp âm 3 nốt chỉ cần 1 nốt là qua | Mỗi lần vào lại nốt là một lượt nghe mới |
| Thấp | Sân khấu: quay lại trang mời mà không dọn màn bài hát; hoạt hình bị hủy không kết thúc; đếm vào hiện "0"; trò Vui/buồn thiếu phím; Si♭/La♯ chấm khác nhau | Rò bộ nghe, lỗi hiển thị nhỏ | Đã sửa cả |

## E. Chưa làm — đề xuất cho OWNER

1. **Thử với bé thật** là việc quan trọng nhất còn thiếu. Mọi tham số (độ trễ micro 0,18 s, ngưỡng tiếng vỗ, độ khó tuần 9–10)
   mới chỉ đúng trên lý thuyết.
2. **Micro chỉ nghe một nốt mỗi lúc**: bài hai tay/hợp âm chấm "dễ" hơn thực tế — nên để bố mẹ xác nhận các bài này. *(2026-10-09: micro đã chấm riêng từng tay ở bài hai tay — TEST_REPORT §35; còn yếu với hợp âm 3 nốt tay trái.)*
3. **Nhịp độ 24 tuần là cố định theo tiêu chí** — bé nhanh có thể thấy chậm; bé chậm có thể ở lâu một tuần (bình thường).
   Bố mẹ đổi tuần thủ công được ở màn Phụ huynh.
4. **Video quay thật** của bố mẹ/thầy cô (nhập vào app, lưu trên máy) — cần OWNER đồng ý vì tốn bộ nhớ.
5. **Hai iPad / đồng bộ** — spec cấm backend; hiện chỉ có xuất/nhập JSON.

## F. Micro (vòng 2 — sau khi OWNER thử trên đàn thật)

Đo lại toàn bộ đường xử lý trên giả lập đàn cơ thật. Tìm ra **5 nguyên nhân** làm micro "không hiệu quả" và đã sửa cả 5,
nâng tỉ lệ nhận đúng từ 87% lên 97% và giảm độ trễ từ 143 ms xuống 68 ms. Chi tiết ở TEST_REPORT §14.
Lỗi đáng kể nhất là bé nhại lại ngay sau tiếng mẫu thì nốt **không bao giờ** được nhận. Lỗi này hay xảy ra nhất ở chế độ "Từng nốt".

## G. Phản biện bằng 4 agent độc lập (2026-10-04, OWNER: "dùng tất cả các agent")

Bốn agent chỉ đọc mã, mỗi agent soát một mảng; sau đó các agent sửa theo từng nhóm file riêng. Tổng cộng: 366 test, tsc sạch.

**Micro & chấm điểm**
- **Hợp âm / hai tay bị chấm SAI dù bé đàn đúng.** Micro nghe 2–3 nốt cùng lúc thành một nốt trầm chung (đo trên giả lập: Đô+Mi → Đô thấp).
  Giờ nhận ra trường hợp này (`src/audio/match.ts`), và với hợp âm không tính nốt nghe lẫn là lỗi.
- **iOS cắt micro** (khóa màn hình, cuộc gọi) thì app vẫn hiện 🎤 nhưng không nghe gì nữa. Giờ app phát hiện và bật lại ở lần chạm sau.
- **Chấm nhịp lệch sớm ~110 ms.** Giờ dùng lúc GÕ PHÍM ước tính (sai số ±30 ms) và trừ độ trễ loa.
- **Tiếng tích máy đếm nhịp bị nghe thành nốt Sol cao** và làm mất lần gõ đúng phách. Giờ micro bỏ qua đúng các khung có tiếng tích, và lần gõ trùng tiếng tích vẫn được tính.
- Vỗ nhịp: không còn chạy chồng khi iPad hỏi quyền micro; micro chấm trượt 2 lần thì có nút "Bố mẹ: qua" (hết ngõ cụt).
- Rò bộ nghe micro khi rời màn bài hát.

**Dữ liệu & cập nhật**
- App cài lần đầu không nhận bản cập nhật trong cùng phiên mở.
- Bản sao lưu hỏng cũ có thể **ghi đè** dữ liệu sau khi "Xóa hẳn" hoặc nhập JSON. Giờ các bản đó được cất sang `archived-*`.
- Banner "xong 24 tuần" hiện lại sau mọi buổi tập.
- Nhập JSON lỗi (tuần lẻ, bài hát thiếu trường) có thể làm sập màn hình. Giờ bị từ chối ngay khi nhập.

**Giáo trình (sửa lỗi dữ liệu, không đổi cấu trúc 24 tuần)**
- Happy Birthday: sửa phách lấy đà ("Hap-py" ở phách 3).
- Frère Jacques: thêm La♭ ở bản thứ, và kết đúng Đô–Sol trầm–Đô.
- Silent Night: đàn trọn bài.
- Für Elise: nhịp lấy đà, thêm nốt Mi bị thiếu.
- Canon: sửa ngón không với tới.
- Các bài có La4: đàn Sol–La–Sol bằng ngón 4-5-4 thay vì ngón 5 lặp lại.
- Thêm nhịp "Đi-i-i" (3 phách) và "Đi-chấm chạy" (nốt chấm) để tuần 12/14 thật sự luyện đúng thứ đang dạy.
- Bài cô Rhody chuyển về đúng bài học; tuần 23 có bài mới (Oh Susanna hai tay, tổng 50 bài).
- Khởi động tuần 9 đọc đúng vùng nốt của tuần; tuần 18–19 chuẩn bị các nốt La3/Si3 và Mi5–Sol5 trước khi gặp trong bài.

**Giao diện cho bé**
- Nội dung dài không còn bị cắt mất phần trên; các màn đều cuộn được.
- Nút "Quay lại" tách sang mép trái, kiểu nhạt, để bé khỏi bấm nhầm.
- Chạm vào bài đang khóa thì có thông báo "🔒 mở ở Tuần N".
- Màn chính bớt chữ; chữ nhỏ nhất được tăng lên ≥ 18px.
- Các nút dành cho bố mẹ có dấu 👪.
- Màn bài hát bỏ tên tiếng Anh / tên nhạc sĩ; thống nhất cách gọi "Bố mẹ" và "đàn".

**Cần OWNER quyết (chưa làm)**
1. **Ngón Sol–La:** ở các bài, Sol–La–Sol nay đàn 4-5-4. Riêng thẻ dạy nốt của tuần 7 vẫn ghi "ngón 5 lo cả Sol và La", vì quy tắc ngón tuần 1–8 đã được OWNER duyệt.
   Đề xuất đổi luôn thẻ tuần 7 sang 4-5 cho thống nhất.
2. **Sắc thái (to/nhỏ) và liền tiếng/ngắt tiếng** chưa có trong giáo trình. Đây là lỗ hổng âm nhạc lớn nhất so với giáo trình chuẩn; cần thêm định dạng bài và bài tập mới.
3. **Tuần 20 (Minuet) là bước nhảy lớn nhất.** Nên chèn một tuần đọc nốt Đô5–Sol5 với bài ở thế Đô cao trước đó (sẽ thành 25 tuần).
4. **Nhiều bài trùng lặp** (Ode to Joy 7 lần, Mary 5 lần). Có thể thêm bài thiếu nhi Việt Nam (cần bài không vướng bản quyền) và bài sáng tác vui (ninja, robot…).
5. **Tay trái chỉ giữ hợp âm.** Có thể thêm đệm rải / "bùm-tách" ở cấp 3.
