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
2. **Micro chỉ nghe một nốt mỗi lúc**: bài hai tay/hợp âm chấm "dễ" hơn thực tế — nên để bố mẹ xác nhận các bài này.
3. **Nhịp độ 24 tuần là cố định theo tiêu chí** — bé nhanh có thể thấy chậm; bé chậm có thể ở lâu một tuần (bình thường).
   Bố mẹ đổi tuần thủ công được ở màn Phụ huynh.
4. **Video quay thật** của bố mẹ/thầy cô (nhập vào app, lưu trên máy) — cần OWNER đồng ý vì tốn bộ nhớ.
5. **Hai iPad / đồng bộ** — spec cấm backend; hiện chỉ có xuất/nhập JSON.

## F. Micro (vòng 2 — sau khi OWNER thử trên đàn thật)

Đo lại toàn bộ đường xử lý trên giả lập đàn cơ thật. Tìm ra **5 nguyên nhân** làm micro "không hiệu quả" và đã sửa cả 5,
nâng tỉ lệ nhận đúng từ 87% lên 97% và giảm độ trễ từ 143 ms xuống 68 ms. Chi tiết ở TEST_REPORT §14.
Lỗi đáng kể nhất là bé nhại lại ngay sau tiếng mẫu thì nốt **không bao giờ** được nhận. Lỗi này hay xảy ra nhất ở chế độ "Từng nốt".
