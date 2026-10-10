/**
 * (+ 2026-10-10) "🆕 CÓ GÌ MỚI" CHO BỐ MẸ — nhật ký thay đổi viết bằng lời thường (không thuật ngữ kỹ thuật).
 *
 * - Mỗi bản: version (đúng package.json), ngày phát hành, 2–5 ý ngắn nói bố mẹ được gì / tìm ở đâu.
 * - Bản MỚI NHẤT ĐỨNG ĐẦU; bản đầu tiên phải trùng package.json (tests/changelog.test.ts canh) → khi tăng phiên bản
 *   nhớ thêm một mục ở đây.
 * - Chỉ hiện ở màn Phụ huynh (thẻ thu gọn được, "Đã xem" thì ẩn) — KHÔNG bao giờ hiện cho bé.
 * - settings.lastSeenVersion = bản bố mẹ đã xem. Dữ liệu cũ (chưa có trường này) coi như đã xem tới CHANGELOG_BASELINE.
 */

export interface ChangelogEntry {
  /** "0.21.0" */
  version: string;
  /** Ngày phát hành YYYY-MM-DD */
  date: string;
  /** 2–5 ý, mỗi ý một câu ngắn cho bố mẹ */
  items: readonly string[];
}

/** Bản cuối cùng TRƯỚC khi có nhật ký này — dữ liệu cũ không có lastSeenVersion coi như đã xem tới đây. */
export const CHANGELOG_BASELINE = '0.15.0';

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.22.0',
    date: '2026-10-10',
    items: [
      '🎙️ Đàn để thêm bài (trong "Bố mẹ thêm bài"): đàn giai điệu, app tự ghi nốt và nhịp.',
      'Nhãn "Mới" nhỏ trên bài hát và trò chơi bé chưa thử — tự mất khi bé chơi lần đầu.',
    ],
  },
  {
    version: '0.21.1',
    date: '2026-10-10',
    items: [
      '📖 Hướng dẫn nhanh cho bố mẹ (nút 📖 ở đầu màn này): mỗi việc vài dòng, có nút "Mở ngay".',
      'Mục "Có gì mới" này — sau mỗi lần cập nhật sẽ kể ngắn những gì thay đổi.',
      'Sửa lỗi: dừng bài mẫu giữa chừng làm micro "điếc" một lúc và tiếng đàn mỏng đi.',
      'Thử kỹ trên Safari (giống iPad): cả 7 trò chơi, báo cáo tuần, sao lưu, Cài micro.',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-10-09',
    items: [
      'Tiếng đàn trong app ấm và tròn hơn, bài đàn mẫu nghe hay hơn.',
      'Thêm 4 trò chơi luyện tai và nhịp (nút 🎮 Trò chơi ở màn của bé) — giờ có 7 trò.',
      '📊 Báo cáo tuần: bé tập mấy ngày, thuộc bài nào, bố mẹ nên giúp gì — gửi ảnh cho ông bà được.',
      'Thư viện có thêm 24 bài, tổng cộng 150 bài.',
    ],
  },
  {
    version: '0.20.1',
    date: '2026-10-09',
    items: ['Sắp xếp lại bên trong app cho gọn và ổn định hơn — bố mẹ không cần làm gì.', 'App mở nhanh hơn một chút.'],
  },
  {
    version: '0.20.0',
    date: '2026-10-09',
    items: [
      'Micro tự học độ lệch dây của đàn nhà — đàn lâu chưa lên dây vẫn chấm đúng.',
      'Phóng to được bằng hai ngón (trừ bàn phím); chữ to và rõ hơn, nút dễ bấm hơn.',
      'iPad bật “Giảm chuyển động” thì app không bắn pháo giấy.',
    ],
  },
  {
    version: '0.19.1',
    date: '2026-10-09',
    items: ['Rà lại toàn bộ 43 tuần học, sửa 22 chỗ nhỏ.', '“Ôn bài cũ” chỉ chọn bài bé đã từng chơi.'],
  },
  {
    version: '0.19.0',
    date: '2026-10-09',
    items: [
      'Micro chấm bài hai tay: nói rõ tay nào chưa đàn, nhầm phím nào. Tắt được ở Nâng cao.',
      'Sau mỗi bài, app nhận xét như thầy giáo: tô màu nốt đúng / sai trên khuông nhạc.',
      'Nút “🎯 Luyện ngay chỗ này” để bé tập riêng chỗ vừa sai.',
      'Album bản thu mở nhanh hơn.',
    ],
  },
  {
    version: '0.18.2',
    date: '2026-10-09',
    items: [
      'Sửa nhiều lỗi nhỏ sau đợt cập nhật lớn (Album, Biểu diễn, đo micro).',
      'Mỗi lần mở app chỉ hiện tối đa một màn chúc mừng; nút “Học tiếp” luôn dễ thấy.',
      'App mở nhanh hơn trên iPad.',
    ],
  },
  {
    version: '0.18.1',
    date: '2026-10-09',
    items: [
      'Cài micro có nút “🎙️ Đo micro & tạo báo cáo”: app tự nghe khoảng 1 phút.',
      'Bấm “Sao chép báo cáo” rồi gửi cho người hỗ trợ để chỉnh micro cho đúng đàn nhà.',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-10-08',
    items: [
      'Thêm Cấp 4 (tuần 32–43): gam, hợp âm rải, pedal, nhịp 6/8 — tổng 126 bài.',
      'Buổi học mở đầu bằng âm nhạc; thêm “Hát rồi đàn” và 1 phút đọc nốt (từ tuần 8).',
      '🎤 Biểu diễn cho cả nhà mỗi tuần; 🎧 Album giữ bản thu hay nhất của từng bài.',
      '⏰ Đặt giờ tập vào Lịch iPad; quà mở theo đảo; sticker đếm “ngày tập”.',
      'Dữ liệu an toàn hơn (thêm bản sao trong máy); micro nghe chưa rõ thì có nút “Bố mẹ chấm giúp”.',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-10-08',
    items: [
      'Tuần 4–10 mượt hơn: lời dẫn ngắn gọn, thêm thẻ dạy nốt Si, tuần 10 chia làm hai buổi.',
      'Đã làm đủ 7 thay đổi bố mẹ duyệt (ngón bài Kìa con bướm vàng, thêm Tàu hỏa xình xịch…).',
      'Micro chấm bài hát chính xác hơn, ít báo sai oan.',
    ],
  },
  {
    version: '0.16.1',
    date: '2026-10-08',
    items: [
      'Micro nghe được tiếng đàn nhẹ — không cần đánh thật to nữa.',
      'Trong buổi học, app tự tăng độ nhạy micro khi bé đàn nhẹ.',
      'Cài micro nhắc chạy “Kiểm tra 5 nốt” — nên làm một lần.',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-10-07',
    items: [
      '🎮 Trò chơi: Đọc nốt nhanh, Đố nhịp, Nghe đoán bài — có lưu kỷ lục.',
      '🏆 Thử thách tuần: mỗi tuần một việc nhỏ, xong được cúp trong Sổ sticker.',
    ],
  },
];

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** "0.21.0" → [0, 21, 0]; sai dạng → null. */
export function parseVersion(v: unknown): [number, number, number] | null {
  if (typeof v !== 'string') return null;
  const m = VERSION_RE.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isVersion(v: unknown): v is string {
  return parseVersion(v) !== null;
}

/** < 0: a cũ hơn b · 0: bằng · > 0: a mới hơn. Sai dạng coi như 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a) ?? [0, 0, 0];
  const y = parseVersion(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Bản mới nhất có trong nhật ký (= package.json — có test). */
export const LATEST_VERSION: string = CHANGELOG[0].version;

export type WhatsNew =
  /** Cài mới (chưa từng học, chưa có lastSeenVersion): không có gì để báo — ghi lastSeenVersion luôn, không hiện thẻ */
  | { kind: 'first-install'; entries: [] }
  /** Đã xem bản này rồi (hoặc dữ liệu từ bản MỚI hơn — quay về bản cũ) */
  | { kind: 'same'; entries: [] }
  /** Có bản mới hơn bản bố mẹ đã xem: các mục cần hiện, mới nhất trước */
  | { kind: 'update'; entries: ChangelogEntry[] };

/**
 * Bố mẹ cần xem gì? `lastSeen` = settings.lastSeenVersion; `hasHistory` = dữ liệu đã có buổi học / đã xem hướng dẫn
 * lần đầu (tức là người dùng CŨ cập nhật lên, chỉ là trước đây chưa có trường lastSeenVersion).
 */
export function whatsNew(lastSeen: unknown, hasHistory: boolean, log: readonly ChangelogEntry[] = CHANGELOG): WhatsNew {
  const latest = log[0]?.version;
  if (!latest) return { kind: 'same', entries: [] };
  let since: string;
  if (isVersion(lastSeen)) since = lastSeen;
  else if (!hasHistory) return { kind: 'first-install', entries: [] };
  else since = CHANGELOG_BASELINE;
  const entries = log.filter((e) => compareVersions(e.version, since) > 0);
  return entries.length ? { kind: 'update', entries } : { kind: 'same', entries: [] };
}
