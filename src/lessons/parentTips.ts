/**
 * MẸO CHO BỐ MẸ — mỗi tuần một điều cần để ý (dành cho phụ huynh không học nhạc).
 * Hiện ở màn chính (dòng nhỏ) và màn Phụ huynh. v5 (OWNER duyệt 2026-10-05): 30 tuần.
 */
export const PARENT_TIPS: Record<number, string> = {
  1: 'Cho bé tự tìm phím, đừng chỉ hộ. Khen khi bé nói được "Đô ở bên trái hai phím đen". Bài thử thách cho phép trượt 1 lần — đừng bắt làm lại từ đầu.',
  2: 'Để ý ngón: Đô = ngón cái, Rê = ngón trỏ, Mi = ngón giữa. Khi không bật micro, phiếu chấm có 3 ý (đúng nốt · đều nhịp · đúng ngón) — chỉ đánh "đạt" khi cả 3 đều đạt. Tiêu chí tuần cần đạt ở 2 NGÀY khác nhau.',
  3: 'Ngón 4 và 5 thường yếu và hay "gập" — nhắc bé giữ ngón cong như ôm quả bóng nhỏ. Trò phím đen: không có nốt sai, cứ để bé tự do.',
  4: 'Đếm to cùng bé "1-2-3-4". Đều quan trọng hơn nhanh: cho bé đàn chậm (tốc độ 40) trước. "Chạy-chạy" = hai nốt nhanh đều nhau trong một phách.',
  5: 'Tuần củng cố: không có gì mới — bé đàn bài mới bằng kỹ năng cũ. Đây là lúc bé thấy mình "giỏi lên". Khen sự tự tin, đừng vội chuyển tuần.',
  6: 'Tập từng câu, chỉ ghép cả bài khi từng câu đã trơn. Bật nhạc đệm để bé thấy vui. Trò "To hay nhỏ?": f = to (ấn sâu, ngón chắc), p = nhỏ (chạm nhẹ) — đàn nhỏ KHÔNG có nghĩa là đàn chậm.',
  7: 'Tay trái thường lười hơn: chỉ cần 3–5 phút/buổi. Khen nhiều khi bé không nhìn tay. Thấy dấu p/f trong bài, hỏi bé "chỗ này to hay nhỏ?" trước khi đàn.',
  8: 'Bé đọc khuông thì dễ nhìn tay. Che nhẹ bàn tay bé bằng một tờ giấy để bé nhìn khuông. Hỏi "nốt mốc gần nhất là nốt nào?" thay vì đọc hộ. Nốt La: khi Sol–La đi cùng nhau, Sol ngón 4, La ngón 5.',
  9: 'Nhịp 2/4: mỗi ô chỉ 2 phách "MỘT-hai". Cùng bé vỗ tay hát "Inh lả ơi" trước khi đàn. Trò Hỏi – Đáp: mọi câu trả lời kết ở Đô đều đúng.',
  10: 'Buổi biểu diễn: cả nhà ngồi nghe, vỗ tay to. Đừng sửa lỗi lúc bé đang đàn.',
  11: 'Khóa Fa mới lạ — đọc to tên nốt cùng bé, bắt đầu từ nốt mốc Fa (vạch giữa hai dấu chấm). Hai tay luân phiên: chờ tay này xong tay kia mới vào.',
  12: 'Hai tay cùng lúc rất khó: cho bé tập riêng từng tay 2 lần rồi mới ghép, tốc độ 40. Ngắt (dấu chấm) = nhấc ngón ngay như chạm bếp nóng; liền (dấu luyến cong) = nốt trước chỉ nhả khi nốt sau đã vang.',
  13: 'Tuần củng cố hai tay: bài mới nhưng kỹ năng cũ. Khi bé sáng tác, đừng sửa "cho hay" — hỏi bé "bài này kể chuyện gì?".',
  14: 'Khi đổi sang thế Sol, nhắc bé "ngón cái về nhà mới ở Sol" trước khi bắt đầu.',
  15: 'Nhịp 3: bé hay đếm thành 4. Cùng bé đung đưa người "MỘT-hai-ba".',
  16: 'Phím đen: bé hay quên dấu ♯ ở giữa bài. Trước khi đàn, hỏi bé "Bài này có phím đen nào?". Khởi động "cá lặn" là chuẩn bị cho gam ở tuần 19.',
  17: 'Nốt chấm dôi: cho bé nói "Đi-chấm chạy" trước khi đàn. Nghe mẫu nhiều lần là cách tốt nhất.',
  18: 'Móc kép rất nhanh: bài bắt đầu ở tốc độ 40 là đúng. Cho bé đọc to "Chạy-chạy-chạy-chạy" rồi mới đàn. Nghịch phách "Chạy-Đi-chạy": nốt giữa dài và vang lệch phách — nghe mẫu trước.',
  19: 'Luồn ngón cái phải nhẹ, không xoay cả cổ tay. Tập chậm, mỗi tay riêng.',
  20: 'Hòa nhạc Cấp 2: có thể quay video bằng điện thoại của bố mẹ để bé xem lại và tự hào.',
  21: 'Hợp âm: 3 ngón xuống CÙNG LÚC. Bé hay bấm lệch — cho bé đếm "1-2-3 bấm!".',
  22: 'Dòng kẻ phụ: bé đọc sai thì hỏi "từ Đô giữa đi xuống mấy bậc?" thay vì nói tên nốt. Khuông lớn: tay phải đọc khóa Sol, tay trái đọc khóa Fa.',
  23: 'Đổi thế tay giữa bài: cho bé đánh dấu bằng bút chì chỗ phải dời tay (trong đầu) và tập riêng chỗ đó.',
  24: 'Hỏi bé "bài này nghe vui hay buồn?" khi nghe nhạc ở nhà — luyện tai tự nhiên nhất.',
  25: 'Tuần đọc nốt cao: mỗi lần bé đọc sai, hỏi "nốt này ngồi ở vạch hay ở khe?" rồi đếm từ Đô cao (khe 3) lên. Không cần nhanh — đọc ĐÚNG trước.',
  26: 'Đọc nhạc: đừng cho bé đoán. Mỗi nốt bé nói tên trước rồi mới đàn.',
  27: 'Bài hai tay dài: chia đôi, mỗi buổi chỉ tập một nửa cho kỹ.',
  28: 'Minuet là nhạc cổ: tìm cho bé nghe bản gốc trên đài/TV nếu có dịp (không cần trong app). Tập từng câu, mỗi câu 3 lần đúng liền mới ghép.',
  29: 'Für Elise có Rê thăng: bé hay đánh Rê trắng. Tập riêng 5 nốt đầu thật nhiều lần.',
  30: 'Đại hòa nhạc — bé đã đi một chặng dài 30 tuần (≈ hết Faber cấp 1 / đầu cấp 2)! Tiếp tục 4–5 buổi ngắn mỗi tuần với "Luyện tập mỗi ngày"; nếu có thể, tìm thêm một thầy/cô dạy trực tiếp.',
};

export function parentTip(week: number): string {
  return PARENT_TIPS[week] ?? PARENT_TIPS[30];
}
