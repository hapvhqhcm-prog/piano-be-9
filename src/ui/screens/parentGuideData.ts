/**
 * (+ 2026-10-10) "📖 HƯỚNG DẪN NHANH" (cho người lớn, trong ⚙️ Cài đặt) — nội dung (thuần dữ liệu, không DOM → test được).
 * Màn: parentGuide.ts (nạp muộn). Mỗi mục: ≤ 4 dòng ngắn, làm theo việc cần làm + nút "Mở ngay" tới đúng chỗ.
 *
 * Đích "Mở ngay":
 * - màn riêng: 'home' (màn của bé), 'micSetup' (Cài micro), 'weeklyReport' (Báo cáo tuần), 'album' (Album của con);
 * - một thẻ trong màn Phụ huynh (GuideAnchor): parentScreen(app, { focus }) cuộn tới phần tử `data-guide="<mốc>"`
 *   (tự mở mục "Nâng cao" nếu mốc nằm trong đó — PARENT_ANCHORS).
 */

/**
 * Mốc trong màn ⚙️ Cài đặt (thuộc tính `data-guide`) → có nằm trong parentAdvanced.ts (Cài đặt chính / Dữ liệu) không.
 * (2026-10-25, bỏ phần phụ huynh: đã bỏ mốc 'tips' — thẻ "3 điều cần nhớ")
 */
export const PARENT_ANCHORS = {
  /** Nâng cao → Cài đặt → "🎤 Nghe đàn bằng micro" (ngay dưới: chấm nhịp, chấm cả 2 tay) */
  mic: true,
  /** Nâng cao → thẻ "Dữ liệu" (sao lưu, nhập lại) */
  data: true,
  /** Nâng cao → Cài đặt → "Tuần hiện tại" */
  week: true,
  /** Thẻ "🗓️ Tuần N" (mục tiêu, Vì sao?, "⏸ Ở lại tuần này thêm") */
  hold: false,
  /** Thẻ "⏰ Đặt giờ tập" (trong "🧩 Thiết lập một lần" — tự mở ra) */
  reminder: false,
  /** Thẻ "📝 Bài bố mẹ thêm" (trong "🧩 Thiết lập một lần") */
  songs: false,
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
      'Bé tự bấm nút ▶ to — app tự chọn bài, không cần người lớn ngồi cạnh.',
      'Micro chấm khi nghe được; chỗ micro không chấm được (tư thế, ngón…) bé tự kiểm tra: “👍 Rồi / 🔁 Làm lại”.',
      'Bé vừa nghỉ ≥ 3 ngày: app gợi ý “Buổi ngắn 5 phút” cho nhẹ nhàng.',
    ],
    open: { label: 'Mở màn của bé', go: 'home' },
  },
  {
    id: 'mic',
    icon: '🎤',
    title: 'Cài micro + Đo micro & gửi báo cáo',
    lines: [
      'Micro giúp app tự nghe đàn thật và chấm (xử lý ngay trên iPad). Bật sẵn — bé tự chạm “Cho phép” khi iPad hỏi.',
      'Cài micro: “1. Cho phép micro” → “2. Kiểm tra 5 nốt” (bé đàn Đô Rê Mi Fa Sol).',
      'Chưa ưng? “🔧 Dành cho người hỗ trợ” → “🎙️ Đo micro & tạo báo cáo” (≈ 1 phút) → gửi người hỗ trợ.',
    ],
    open: { label: 'Mở Cài micro', go: 'micSetup' },
  },
  {
    id: 'mic-wrong',
    icon: '👂',
    title: 'Khi micro nghe sai',
    lines: [
      'Micro nghe chưa rõ 3 lần → bé tự kiểm tra (👍 Rồi / 🔁 Làm lại) và đi tiếp.',
      'Hay hụt nốt nhẹ / nghe nhầm: Cài micro → “🔧 Dành cho người hỗ trợ” → Độ nhạy, “Học lại lệch dây”.',
      'Bài hai tay hay bị chấm sai: Cho người hỗ trợ → “Micro chấm cả 2 tay” → Tắt.',
    ],
    open: { label: 'Mở Cài micro', go: 'micSetup' },
    more: { label: 'Micro (Cài đặt)', go: 'mic' },
  },
  {
    id: 'backup',
    icon: '💾',
    title: 'Sao lưu & khôi phục',
    lines: [
      'Tiến độ nằm trên iPad này (app tự giữ thêm một bản sao trong máy) — XÓA BIỂU TƯỢNG APP = MẤT DỮ LIỆU.',
      'Khi tiện: ⚙️ Cài đặt → “💾 Sao lưu dữ liệu” → Lưu vào Tệp (app không nhắc).',
      'Đổi iPad / lỡ xóa app: Cho người hỗ trợ → “Nhập từ tệp JSON”.',
      '📀 Album không vào bản sao lưu — chia sẻ bản thu trước khi đổi máy; máy mới: làm lại “🎤 Cài micro 3 bước”.',
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
      'Bé chưa vững: thẻ “🗓️ Tuần N” → “⏸ Ở lại tuần này thêm” → “Có”. “Vì sao?” giải thích cách app tính.',
      'Cần nhảy / lùi tuần: Cài đặt → “Tuần hiện tại” → chọn Cấp rồi Tuần (kết quả cũ vẫn giữ).',
    ],
    open: { label: 'Giữ tuần', go: 'hold' },
    more: { label: 'Đổi tuần', go: 'week' },
  },
  {
    id: 'songs',
    icon: '📝',
    title: 'Thêm bài con thích',
    lines: [
      '“📝 Bài thêm” → “Thêm bài hát”: gõ Đô Rê Mi hoặc chạm phím, app tự đánh số ngón.',
      'Bài nằm trong Thư viện của bé, chỉ lưu trên iPad này.',
    ],
    open: { label: 'Mở Bài thêm', go: 'songs' },
  },
];

/**
 * (+ 2026-10-17, OWNER duyệt) "🆘 KHI CÓ SỰ CỐ" — các bước tự xử lý (màn Hướng dẫn, thẻ riêng; không nằm trong bản một trang).
 * Mỗi sự cố: ≤ 4 bước ngắn, theo thứ tự thử.
 */
export interface TroubleItem {
  id: string;
  icon: string;
  title: string;
  steps: readonly string[];
}
export const TROUBLE: readonly TroubleItem[] = [
  {
    id: 'no-sound',
    icon: '🔇',
    title: 'Không có tiếng',
    steps: [
      'Tăng âm lượng; tắt chế độ Im lặng (Trung tâm điều khiển → chuông).',
      'Tháo tai nghe / tắt Bluetooth nếu không dùng.',
      'Chạm vào màn một lần (iPad cần một lần chạm để bật tiếng sau cuộc gọi).',
      'Vẫn im: vuốt tắt hẳn app rồi mở lại từ biểu tượng 🎹.',
    ],
  },
  {
    id: 'mic-deaf',
    icon: '👂',
    title: 'Micro không nghe thấy đàn',
    steps: [
      'Mở nắp đàn, đặt iPad trên giá nhạc, tắt quạt / TV.',
      '⚙️ Cài đặt → Cài micro → “2. Kiểm tra 5 nốt” (app tự chỉnh độ nhạy).',
      'Vẫn hụt: “🩺 Kiểm tra sức khỏe app” → bước 3 → đổi độ nhạy.',
      'Tạm thời: bé tự kiểm tra (👍 Rồi / 🔁 Làm lại) và đi tiếp.',
    ],
  },
  {
    id: 'mic-perm',
    icon: '🎤',
    title: 'iPad chặn micro',
    steps: [
      'Cài đặt iPad → Safari → Micrô → chọn “Hỏi” hoặc “Cho phép”.',
      'Vuốt tắt hẳn app, mở lại, bấm “1. Cho phép micro” → Cho phép.',
      'iPad có thể hỏi lại một lần mỗi khi mở app — chọn Cho phép.',
    ],
  },
  {
    id: 'screen-dark',
    icon: '🌙',
    title: 'Màn hình tự tắt khi bé đàn',
    steps: [
      'Cài đặt → Màn hình & Độ sáng → Tự động khóa: 5 phút hoặc lâu hơn.',
      'Tắt Chế độ nguồn điện thấp (pin) khi tập.',
      'Mở app từ biểu tượng 🎹 trên Màn hình chính.',
    ],
  },
  {
    id: 'progress-missing',
    icon: '📭',
    title: 'Mất tiến độ / app như mới cài',
    steps: [
      'ĐỪNG học tiếp ngay (tránh ghi đè). Mở bằng biểu tượng 🎹 trên Màn hình chính (không phải tab Safari).',
      '⚙️ Cài đặt → Cho người hỗ trợ → “Nhập từ tệp JSON” → chọn bản sao lưu trong Tệp.',
      'Không có bản sao lưu: gửi “🩺 Kiểm tra iPad” cho người hỗ trợ.',
    ],
  },
  {
    id: 'strange',
    icon: '🌀',
    title: 'Màn hình lạ / bị kẹt',
    steps: [
      'Bấm “Quay lại” hoặc “Về màn của bé”.',
      'Vuốt tắt hẳn app rồi mở lại — tiến độ đã lưu không mất.',
      'Lặp lại: ⚙️ Cài đặt → Cho người hỗ trợ → “🩺 Kiểm tra sức khỏe app” → “📤 Gửi kết quả”.',
    ],
  },
  {
    id: 'new-ipad',
    icon: '📲',
    title: 'Chuyển sang iPad mới',
    steps: [
      'iPad CŨ: “💾 Sao lưu” → Lưu vào Tệp (iCloud Drive) hoặc gửi cho chính mình. Album bản thu không nằm trong bản sao lưu.',
      'iPad MỚI: mở app bằng Safari → Chia sẻ → “Thêm vào MH chính” → mở từ biểu tượng 🎹.',
      '⚙️ Cài đặt → Cho người hỗ trợ → “Nhập từ tệp JSON”.',
      'Cài micro lại (3 bước) — micro và loa của máy mới khác máy cũ.',
    ],
  },
];

/** Bản chữ "🆘 Khi có sự cố" (sao chép / chia sẻ). */
export function troubleText(items: readonly TroubleItem[] = TROUBLE): string {
  const out = ['🆘 PIANO BÉ — KHI CÓ SỰ CỐ', ''];
  for (const t of items) {
    out.push(`${t.icon} ${t.title.toUpperCase()}`);
    t.steps.forEach((x, i) => out.push(`${i + 1}. ${x}`));
    out.push('');
  }
  return out.join('\n');
}

/** Bản tóm tắt MỘT TRANG (chữ thường) — sao chép / chia sẻ / in. */
export function guideSummaryText(sections: readonly GuideSection[] = GUIDE_SECTIONS, version = ''): string {
  const out: string[] = [`📖 PIANO BÉ — HƯỚNG DẪN NHANH${version ? ` (bản ${version})` : ''}`, ''];
  for (const s of sections) {
    out.push(`${s.icon} ${s.title.toUpperCase()}`);
    for (const l of s.lines) out.push(`• ${l}`);
    out.push('');
  }
  out.push('Vào ⚙️ Cài đặt: ở màn của bé, nhấn giữ nút ⚙️ 2 giây rồi làm một phép nhân. App chạy không cần người lớn.');
  out.push('Dữ liệu của bé nằm trên iPad này — xóa biểu tượng app = mất dữ liệu. Sao lưu tay khi tiện.');
  return out.join('\n');
}
