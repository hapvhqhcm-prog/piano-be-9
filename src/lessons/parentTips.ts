/**
 * MẸO CHO BỐ MẸ — mỗi tuần một điều cần để ý (dành cho phụ huynh không học nhạc).
 * Hiện ở màn chính (dòng nhỏ) và màn Phụ huynh.
 */
export const PARENT_TIPS: Record<number, string> = {
  1: 'Cho bé tự tìm phím, đừng chỉ hộ. Khen khi bé nói được "Đô ở bên trái hai phím đen".',
  2: 'Để ý ngón: Đô = ngón cái, Rê = ngón trỏ, Mi = ngón giữa. Bé dùng sai ngón thì nhẹ nhàng nhắc, không bấm "Thử lại" vì việc đó.',
  3: 'Ngón 4 và 5 thường yếu và hay "gập" — nhắc bé giữ ngón cong như ôm quả bóng nhỏ.',
  4: 'Đếm to cùng bé "1-2-3-4". Đều quan trọng hơn nhanh: cho bé đàn chậm (tốc độ 40) trước.',
  5: 'Tập từng câu, chỉ ghép cả bài khi từng câu đã trơn. Bật nhạc đệm để bé thấy vui.',
  6: 'Tay trái thường lười hơn: chỉ cần 3–5 phút/buổi. Khen nhiều khi bé không nhìn tay.',
  7: 'Bé đọc khuông thì dễ nhìn tay. Che nhẹ bàn tay bé bằng một tờ giấy để bé nhìn khuông.',
  8: 'Buổi biểu diễn: cả nhà ngồi nghe, vỗ tay to. Đừng sửa lỗi lúc bé đang đàn.',
  9: 'Khóa Fa mới lạ — đọc to tên nốt cùng bé. Hai tay luân phiên: chờ tay này xong tay kia mới vào.',
  10: 'Hai tay cùng lúc rất khó: cho bé tập riêng từng tay 2 lần rồi mới ghép, tốc độ 40.',
  11: 'Khi đổi sang thế Sol, nhắc bé "ngón cái về nhà mới ở Sol" trước khi bắt đầu.',
  12: 'Nhịp 3: bé hay đếm thành 4. Cùng bé đung đưa người "MỘT-hai-ba".',
  13: 'Phím đen: bé hay quên dấu ♯ ở giữa bài. Trước khi đàn, hỏi bé "Bài này có phím đen nào?".',
  14: 'Nốt chấm dôi: cho bé nói "Đi-i chạy" trước khi đàn. Nghe mẫu nhiều lần là cách tốt nhất.',
  15: 'Luồn ngón cái phải nhẹ, không xoay cả cổ tay. Tập chậm, mỗi tay riêng.',
  16: 'Hòa nhạc Cấp 2: có thể quay video bằng điện thoại của bố mẹ để bé xem lại và tự hào.',
  17: 'Hợp âm: 3 ngón xuống CÙNG LÚC. Bé hay bấm lệch — cho bé đếm "1-2-3 bấm!".',
  18: 'Đổi thế tay giữa bài: cho bé đánh dấu bằng bút chì chỗ phải dời tay (trong đầu) và tập riêng chỗ đó.',
  19: 'Hỏi bé "bài này nghe vui hay buồn?" khi nghe nhạc ở nhà — luyện tai tự nhiên nhất.',
  20: 'Minuet là nhạc cổ: tìm cho bé nghe bản gốc trên đài/TV nếu có dịp (không cần trong app).',
  21: 'Für Elise có Rê thăng: bé hay đánh Rê trắng. Tập riêng 5 nốt đầu thật nhiều lần.',
  22: 'Đọc nhạc: đừng cho bé đoán. Mỗi nốt bé nói tên trước rồi mới đàn.',
  23: 'Bài hai tay dài: chia đôi, mỗi buổi chỉ tập một nửa cho kỹ.',
  24: 'Đại hòa nhạc — bé đã đi một chặng dài! Tiếp tục 4–5 buổi ngắn mỗi tuần với "Luyện tập mỗi ngày".',
};

export function parentTip(week: number): string {
  return PARENT_TIPS[week] ?? PARENT_TIPS[24];
}
