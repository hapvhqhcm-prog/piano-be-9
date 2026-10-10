/**
 * (+ 2026-10-10) "📖 HƯỚNG DẪN NHANH CHO BỐ MẸ" — nội dung (thuần dữ liệu, không DOM → test được).
 * Màn: parentGuide.ts (nạp muộn). Mỗi mục: ≤ 4 dòng ngắn, làm theo việc cần làm + nút "Mở ngay" tới đúng chỗ.
 *
 * Đích "Mở ngay":
 * - màn riêng: 'home' (màn của bé), 'micSetup' (Cài micro), 'weeklyReport' (Báo cáo tuần), 'album' (Album của con);
 * - một thẻ trong màn Phụ huynh (GuideAnchor): parentScreen(app, { focus }) cuộn tới phần tử `data-guide="<mốc>"`
 *   (tự mở mục "Nâng cao" nếu mốc nằm trong đó — PARENT_ANCHORS).
 */

/** Mốc trong màn Phụ huynh (thuộc tính `data-guide`) → có nằm trong mục "⚙️ Nâng cao" (thu gọn) không. */
export const PARENT_ANCHORS = {
  /** Nâng cao → Cài đặt → "🎤 Nghe đàn bằng micro" (ngay dưới: chấm nhịp, chấm cả 2 tay) */
  mic: true,
  /** Nâng cao → thẻ "Dữ liệu" (sao lưu, nhập lại) */
  data: true,
  /** Nâng cao → Cài đặt → "Tuần hiện tại" */
  week: true,
  /** Thẻ "Sẵn sàng sang tuần mới?" (có "⏸ Ở lại tuần này thêm") */
  hold: false,
  /** Thẻ "⏰ Đặt giờ tập" */
  reminder: false,
  /** Thẻ "📝 Bài bố mẹ thêm" */
  songs: false,
  /** Thẻ "🗒️ Thẻ nhắc nhanh cho bố mẹ" */
  tips: false,
} as const satisfies Record<string, boolean>;
export type GuideAnchor = keyof typeof PARENT_ANCHORS;

export const GUIDE_SCREENS = ['home', 'micSetup', 'weeklyReport', 'album'] as const;
export type GuideScreen = (typeof GUIDE_SCREENS)[number];
export type GuideTarget = GuideScreen | GuideAnchor;

export function isParentAnchor(t: GuideTarget): t is GuideAnchor {
  return Object.prototype.hasOwnProperty.call(PARENT_ANCHORS, t);
}

export interface GuideLink {
  label: string;
  go: GuideTarget;
}

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  /** ≤ 4 dòng ngắn */
  lines: readonly string[];
  /** Nút chính "Mở ngay" */
  open: GuideLink;
  /** Nút phụ (nếu có) */
  more?: GuideLink;
}

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'session',
    icon: '▶',
    title: 'Bắt đầu một buổi học',
    lines: [
      'Về màn của bé, bấm “Học tiếp” — app tự chọn bài, không cần soạn gì.',
      'Ngồi cạnh bé 10–15 phút. Bé đàn đúng thì bấm “👪 Đúng rồi”, chưa đúng thì “Thử lại”.',
      'Bé vừa nghỉ ≥ 3 ngày: app gợi ý “Buổi ngắn 5 phút” cho nhẹ nhàng.',
    ],
    open: { label: 'Mở màn của bé', go: 'home' },
  },
  {
    id: 'mic',
    icon: '🎤',
    title: 'Cài micro + Đo micro & gửi báo cáo',
    lines: [
      'Micro giúp app tự nghe đàn thật và chấm thay bố mẹ (xử lý ngay trên iPad).',
      'Cài micro: “1. Cho phép micro” → “2. Kiểm tra 5 nốt” (bé đàn Đô Rê Mi Fa Sol).',
      'Chưa ưng? Bấm “🎙️ Đo micro & tạo báo cáo” (≈ 1 phút) → “Sao chép báo cáo” → gửi người hỗ trợ.',
    ],
    open: { label: 'Mở Cài micro', go: 'micSetup' },
  },
  {
    id: 'mic-wrong',
    icon: '👂',
    title: 'Khi micro nghe sai',
    lines: [
      'Micro nghe chưa rõ 3 lần → bấm “👪 Bố mẹ chấm giúp” (hoặc “Bố mẹ: tiếp”) để bé đi tiếp.',
      'Hay hụt nốt nhẹ / nghe nhầm: Cài micro → “🔧 Dành cho người hỗ trợ” → Độ nhạy, “Học lại lệch dây”.',
      'Bài hai tay hay bị chấm sai: Nâng cao → “Micro chấm cả 2 tay” → Tắt.',
    ],
    open: { label: 'Mở Cài micro', go: 'micSetup' },
    more: { label: 'Chấm 2 tay (Nâng cao)', go: 'mic' },
  },
  {
    id: 'backup',
    icon: '💾',
    title: 'Sao lưu & khôi phục',
    lines: [
      'Tiến độ của bé chỉ nằm trên iPad này. Mỗi tuần bấm “💾 Sao lưu” → Lưu vào Tệp.',
      'App còn tự giữ một bản sao thứ hai trong máy, tự khôi phục nếu dữ liệu chính hỏng.',
      'Đổi iPad / lỡ xóa app: Nâng cao → Dữ liệu → “Nhập từ tệp JSON” → chọn tệp đã lưu.',
    ],
    open: { label: 'Mở phần Dữ liệu', go: 'data' },
  },
  {
    id: 'weekly',
    icon: '📊',
    title: 'Báo cáo tuần & gửi ông bà',
    lines: [
      'Mỗi thứ Hai có báo cáo tuần trước: số ngày tập, phút, bài mới thuộc, lời khen.',
      '“📤 Gửi ảnh” để gửi qua Zalo / tin nhắn; “📋 Sao chép chữ” để dán.',
      'Xem lại được 8 tuần gần nhất.',
    ],
    open: { label: 'Mở Báo cáo tuần', go: 'weeklyReport' },
  },
  {
    id: 'concert',
    icon: '🎤',
    title: 'Biểu diễn cho cả nhà & Album',
    lines: [
      'Bé đạt mục tiêu tuần → cuối buổi có nút “🎤 Biểu diễn cho cả nhà”: bé chọn bài, cả nhà nghe.',
      'Người nghe chạm 👏 ❤️ 🌟; bé được sticker “Buổi diễn”.',
      'Bản thu hay nhất của mỗi bài tự vào “🎧 Album của con” (Thư viện) — chỉ lưu trên iPad.',
    ],
    open: { label: 'Mở Album của con', go: 'album' },
  },
  {
    id: 'reminder',
    icon: '⏰',
    title: 'Đặt giờ tập',
    lines: [
      'Chọn các ngày + giờ tập → “📅 Tạo lời nhắc trong Lịch”.',
      'iPad sẽ tự nhắc mỗi tuần; muốn đổi thì tạo lại.',
    ],
    open: { label: 'Mở Đặt giờ tập', go: 'reminder' },
  },
  {
    id: 'week',
    icon: '🗓️',
    title: 'Đổi tuần / giữ tuần',
    lines: [
      'App tự sang tuần mới khi bé đạt mục tiêu và học xong các bài của tuần.',
      'Bé chưa vững: màn Phụ huynh, dòng “⏸ Ở lại tuần này thêm” → chọn “Có”.',
      'Cần nhảy / lùi tuần: Nâng cao → “Tuần hiện tại” (kết quả cũ vẫn giữ).',
    ],
    open: { label: 'Giữ tuần', go: 'hold' },
    more: { label: 'Đổi tuần (Nâng cao)', go: 'week' },
  },
  {
    id: 'songs',
    icon: '📝',
    title: 'Thêm bài con thích',
    lines: [
      '“📝 Bài bố mẹ thêm” → “Thêm bài hát”: gõ Đô Rê Mi hoặc chạm phím, app tự đánh số ngón.',
      'Bài nằm trong Thư viện của bé, chỉ lưu trên iPad này.',
    ],
    open: { label: 'Mở Bài bố mẹ thêm', go: 'songs' },
  },
  {
    id: 'tips',
    icon: '💡',
    title: 'Mẹo khi bé chán / khó',
    lines: [
      'Chán: cho chơi 1 lượt 🎮 Trò chơi hoặc 🎹 Đàn tự do rồi học tiếp; buổi ngắn còn hơn bỏ.',
      "Khó: “Con thử chậm hơn nhé” — dùng “Làm ngay (5')” ở thẻ “Việc cần làm tối nay”.",
      'Khen cụ thể, không so sánh. Bé mệt / cáu: nghỉ 1 phút, hoặc mai học tiếp.',
    ],
    open: { label: 'Mở Thẻ nhắc nhanh', go: 'tips' },
  },
];

/** Bản tóm tắt MỘT TRANG (chữ thường) — sao chép / chia sẻ / in. */
export function guideSummaryText(sections: readonly GuideSection[] = GUIDE_SECTIONS, version = ''): string {
  const out: string[] = [`📖 PIANO BÉ — HƯỚNG DẪN NHANH CHO BỐ MẸ${version ? ` (bản ${version})` : ''}`, ''];
  for (const s of sections) {
    out.push(`${s.icon} ${s.title.toUpperCase()}`);
    for (const l of s.lines) out.push(`• ${l}`);
    out.push('');
  }
  out.push('Vào màn Phụ huynh: ở màn của bé, nhấn giữ nút “Phụ huynh” 2 giây rồi làm một phép nhân.');
  out.push('Mọi dữ liệu của bé chỉ nằm trên iPad này — nhớ sao lưu mỗi tuần.');
  return out.join('\n');
}
