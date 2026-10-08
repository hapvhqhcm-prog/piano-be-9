/**
 * 🩺 KIỂM TRA IPAD — phần logic thuần (không đụng DOM): đọc userAgent, chấm từng mục ✅/⚠️/❌,
 * soạn bản kết quả gửi người hỗ trợ. Màn hình: src/ui/screens/diagnostics.ts (thu thập số đo, vẽ, chia sẻ).
 *
 * Lý do có màn này (2026-10-07): chủ app chưa báo được thông tin máy thật (iPadOS mấy, micro / giọng đọc /
 * âm thanh có chạy không) → bố mẹ bấm vài nút rồi "📤 Gửi kết quả" là người hỗ trợ có đủ dữ kiện.
 * Không gửi gì tự động; không kèm tên bé trừ khi bố mẹ tự tích "kèm tên bé".
 */

import type { ErrorEntry } from './errorLog';

export type DiagStatus = 'ok' | 'warn' | 'bad' | 'info' | 'wait';

export const STATUS_ICON: Record<DiagStatus, string> = { ok: '✅', warn: '⚠️', bad: '❌', info: 'ℹ️', wait: '⏳' };

export interface DiagRow {
  id: string;
  label: string;
  status: DiagStatus;
  /** Giá trị đo được (ngắn) */
  value: string;
  /** Một câu giải thích bằng lời thường */
  explain: string;
  /** Cách khắc phục (khi ⚠️ / ❌ hoặc cần hướng dẫn) */
  tip?: string;
  /** Hướng dẫn từng bước (vd cài giọng tiếng Việt) */
  steps?: string[];
}

export interface DiagSection {
  id: 'device' | 'audio' | 'voice' | 'mic' | 'storage' | 'offline' | 'perf';
  title: string;
  rows: DiagRow[];
}

// ---------------------------------------------------------------- Thiết bị (userAgent)

export interface DeviceInfo {
  kind: 'ipad' | 'iphone' | 'mac' | 'android' | 'other';
  /** "iPadOS" / "iOS" / "macOS" / "Android" / "Windows" / "" */
  os: string;
  /** "17.4" / "15.0.2"; null = không đọc được */
  version: string | null;
  major: number | null;
  /** iPad tự nhận là máy Mac ("Macintosh … Version/17.x" + màn cảm ứng) — mặc định của Safari trên iPad */
  desktopUA: boolean;
  /** Safari / Chrome / Firefox / Edge / … */
  browser: string;
}

function ver(m: RegExpExecArray | null): string | null {
  if (!m) return null;
  const parts = [m[1], m[2] ?? '0'];
  if (m[3] && m[3] !== '0') parts.push(m[3]);
  return parts.join('.');
}

function browserOf(ua: string): string {
  if (/CriOS\//.test(ua)) return 'Chrome';
  if (/FxiOS\//.test(ua)) return 'Firefox';
  if (/EdgiOS\/|Edg\//.test(ua)) return 'Edge';
  if (/OPiOS\/|OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/AppleWebKit\//.test(ua)) return 'Safari';
  return 'không rõ';
}

/**
 * Đọc loại máy + phiên bản hệ điều hành từ userAgent.
 * iPadOS 13+ trong Safari mặc định báo UA của máy Mac ("Macintosh; Intel Mac OS X 10_15_7 … Version/17.4 Safari")
 * → có màn cảm ứng (maxTouchPoints > 1) thì coi là iPad và lấy "Version/x.y" (phiên bản Safari = phiên bản iPadOS).
 * App mở từ Màn hình chính có thể không có "Version/" → phiên bản = null (không rõ).
 */
export function parseDevice(ua: string, maxTouchPoints = 0): DeviceInfo {
  const browser = browserOf(ua);
  const cpuOs = /(?:CPU (?:iPhone )?OS|iPhone OS) (\d+)[_.](\d+)(?:[_.](\d+))?/.exec(ua);
  const safariVer = /Version\/(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(ua);
  const out = (kind: DeviceInfo['kind'], os: string, version: string | null, desktopUA = false): DeviceInfo => ({
    kind,
    os,
    version,
    major: version ? parseInt(version, 10) : null,
    desktopUA,
    browser,
  });
  if (/iPad/.test(ua)) return out('ipad', 'iPadOS', ver(cpuOs) ?? ver(safariVer));
  if (/iPhone|iPod/.test(ua)) return out('iphone', 'iOS', ver(cpuOs) ?? ver(safariVer));
  if (/Macintosh/.test(ua)) {
    if (maxTouchPoints > 1) return out('ipad', 'iPadOS', ver(safariVer), true);
    return out('mac', 'macOS', ver(/Mac OS X (\d+)[_.](\d+)(?:[_.](\d+))?/.exec(ua)));
  }
  if (/Android/.test(ua)) return out('android', 'Android', ver(/Android (\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(ua)));
  if (/Windows/.test(ua)) return out('other', 'Windows', null);
  return out('other', '', null);
}

/** "iPadOS 17.4 · Safari" */
export function deviceText(d: DeviceInfo): string {
  const os = d.os ? `${d.os} ${d.version ?? '(không rõ bản)'}` : 'Thiết bị không rõ';
  return `${os} · ${d.browser}`;
}

// ---------------------------------------------------------------- Số đo (màn hình thu thập)

export type Heard = 'yes' | 'no' | null;

/** Mọi số đo thô. `undefined` ở các trường "đang đo" = chưa có kết quả (hiện ⏳). */
export interface DiagSnapshot {
  at: number;
  appVersion: string;
  ua: string;
  maxTouchPoints: number;
  standalone: boolean;
  screen: { w: number; h: number; vw: number; vh: number; dpr: number };
  language: string;
  updateReady: boolean;
  audio: {
    supported: boolean;
    /** AudioContext.state; null = app chưa bật âm thanh */
    state: string | null;
    sampleRate: number | null;
    /** giây */
    baseLatency: number | null;
    /** giây — iPadOS 15/16 không có */
    outputLatency: number | null;
    heard: Heard;
  };
  voice: {
    supported: boolean;
    /** Đã nạp xong danh sách giọng (Safari nạp ngầm) */
    loaded: boolean;
    viVoices: string[];
    total: number;
    /** Phụ huynh bật "Giọng đọc hướng dẫn" */
    enabled: boolean;
    heard: Heard;
  };
  mic: {
    getUserMedia: boolean;
    secure: boolean;
    /** undefined = đang hỏi; 'unknown' = trình duyệt không cho hỏi trước */
    permission?: 'granted' | 'denied' | 'prompt' | 'unknown';
    state: string;
    enabled: boolean;
    sensitivity: string;
    tuningCents: number;
    latencyMs: number;
    lastCheck: { ok: number; total: number; at: string } | null;
    /** Lần gần nhất micro TỰ tăng độ nhạy trong buổi học (micAutoSens.ts) */
    autoSens?: { at: string; from: string; to: string; missed: number } | null;
  };
  storage: {
    text: string;
    percent: number;
    ok: boolean;
    full: boolean;
    /** undefined = đang hỏi; null = trình duyệt không cho biết */
    persisted?: boolean | null;
    lastBackupAt: number;
    sessions: number;
    completed: number;
    curriculumRev: number;
    week: number;
  };
  offline: {
    swSupported: boolean;
    controller: boolean;
    /** undefined = đang đọc; null = không đọc được */
    caches?: string[] | null;
    online: boolean;
  };
  perf: {
    /** ms; undefined = đang đo */
    planMs?: number | null;
    homeMs?: number | null;
    cores: number | null;
    memoryGB: number | null;
  };
  /** (+ 2026-10-08) Nhật ký lỗi gần đây (errorLog.ts, cũ → mới); không có = không đọc */
  errors?: ErrorEntry[];
}

// ---------------------------------------------------------------- Chấm từng mục

const DAY_MS = 86_400_000;

export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${fmtDay(ms)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const msText = (sec: number | null): string | null => (sec === null || !isFinite(sec) ? null : `${Math.round(sec * 1000)} ms`);

const SENS_TEXT: Record<string, string> = { low: 'Thấp', normal: 'Vừa', high: 'Cao' };

export const VOICE_INSTALL_STEPS = [
  'Mở ứng dụng Cài đặt của iPad.',
  'Chọn Trợ năng → Nội dung được đọc → Giọng nói.',
  'Chọn Tiếng Việt → bấm “Linh” → bấm biểu tượng tải về (☁︎) và đợi tải xong (cần Wi‑Fi).',
  'Đóng hẳn app Piano bé (vuốt lên từ đáy màn hình) rồi mở lại.',
  'Trong app: Phụ huynh → Nâng cao → Cài đặt → “Giọng đọc hướng dẫn” chọn Bật → bấm “Nghe thử”.',
];

const SILENT_TIP =
  'Tắt chế độ im lặng (công tắc bên hông, hoặc vuốt mở Trung tâm điều khiển → biểu tượng chuông), tăng âm lượng bằng nút bên hông, ' +
  'kiểm tra iPad có đang nối loa/tai nghe Bluetooth không. Vẫn im: đóng hẳn app rồi mở lại.';

function deviceRows(s: DiagSnapshot): DiagRow[] {
  const d = parseDevice(s.ua, s.maxTouchPoints);
  const rows: DiagRow[] = [];
  const explain = 'Phiên bản iPadOS quyết định âm thanh, micro và giọng đọc có chạy ổn không.';
  const findVer = 'Xem trong Cài đặt → Cài đặt chung → Giới thiệu → Phiên bản phần mềm, rồi ghi vào ô góp ý bên dưới.';
  if (d.kind === 'ipad') {
    if (d.major === null)
      rows.push({ id: 'os', label: 'iPad', status: 'warn', value: deviceText(d), explain: 'App không đọc được phiên bản iPadOS.', tip: findVer });
    else if (d.major < 15)
      rows.push({
        id: 'os',
        label: 'iPad',
        status: 'bad',
        value: deviceText(d),
        explain: 'iPadOS quá cũ — app cần iPadOS 15 trở lên.',
        tip: 'Cài đặt → Cài đặt chung → Cập nhật phần mềm (nếu iPad còn được cập nhật).',
      });
    else if (d.major < 16)
      rows.push({
        id: 'os',
        label: 'iPad',
        status: 'warn',
        value: deviceText(d),
        explain: 'iPadOS 15 đã cũ — app vẫn chạy, nhưng micro và giọng đọc có thể kém ổn định hơn.',
        tip: 'Nếu iPad cho phép: Cài đặt → Cài đặt chung → Cập nhật phần mềm.',
      });
    else rows.push({ id: 'os', label: 'iPad', status: 'ok', value: deviceText(d), explain });
  } else if (d.kind === 'iphone') {
    rows.push({ id: 'os', label: 'Thiết bị', status: 'warn', value: deviceText(d), explain: 'Đây là iPhone — app được thiết kế cho màn iPad.', tip: 'Dùng iPad để bé học cho dễ nhìn.' });
  } else {
    rows.push({ id: 'os', label: 'Thiết bị', status: 'info', value: deviceText(d), explain: 'Không phải iPad (máy tính / thiết bị khác).' });
  }
  rows.push(
    s.standalone
      ? { id: 'standalone', label: 'Mở từ Màn hình chính', status: 'ok', value: 'Có', explain: 'App chạy toàn màn hình, dữ liệu được giữ bền hơn.' }
      : {
          id: 'standalone',
          label: 'Mở từ Màn hình chính',
          status: 'warn',
          value: 'Không — đang mở trong tab trình duyệt',
          explain: 'Mở trong tab Safari thì iPad có thể tự xóa dữ liệu của bé sau 7 ngày không mở.',
          tip: 'Trong Safari bấm nút Chia sẻ (ô vuông có mũi tên lên) → “Thêm vào MH chính”, rồi luôn mở app từ biểu tượng Piano bé.',
        },
  );
  rows.push({
    id: 'version',
    label: 'Phiên bản app',
    status: 'info',
    value: s.appVersion + (s.updateReady ? ' (đã tải bản mới — sẽ dùng khi về màn của bé)' : ''),
    explain: 'Người hỗ trợ cần số này để biết bé đang dùng bản nào.',
  });
  if (s.errors) {
    const n = s.errors.length;
    const last = s.errors[n - 1];
    rows.push(
      n
        ? {
            id: 'errors',
            label: 'Lỗi gần đây',
            status: 'warn',
            value: `${n} lỗi · gần nhất ${fmtTime(last.t)}`,
            explain: 'App tự ghi lại lỗi kỹ thuật (chỉ trên iPad này) để người hỗ trợ tìm nguyên nhân.',
            tip: 'Bấm “📤 Gửi kết quả” để gửi kèm danh sách lỗi cho người hỗ trợ.',
          }
        : { id: 'errors', label: 'Lỗi gần đây', status: 'ok', value: 'Không có', explain: 'App chưa ghi lại lỗi kỹ thuật nào.' },
    );
  }
  const small = Math.min(s.screen.vw, s.screen.vh) < 600;
  rows.push({
    id: 'screen',
    label: 'Màn hình',
    status: small ? 'warn' : 'ok',
    value: `${s.screen.w}×${s.screen.h} · khung app ${s.screen.vw}×${s.screen.vh} · mật độ ${Math.round(s.screen.dpr * 100) / 100}x`,
    explain: 'App vẽ cho màn iPad nằm ngang.',
    tip: small ? 'Khung app đang nhỏ: xoay iPad nằm ngang, tắt chia đôi màn hình (Split View / Slide Over).' : undefined,
  });
  rows.push({ id: 'lang', label: 'Ngôn ngữ của iPad', status: 'info', value: s.language || 'không rõ', explain: 'Chỉ để tham khảo — app luôn nói tiếng Việt.' });
  return rows;
}

function audioRows(s: DiagSnapshot): DiagRow[] {
  const a = s.audio;
  const rows: DiagRow[] = [];
  const explain = 'Tiếng đàn mẫu, tiếng tích nhịp và chuông khen đều phát qua bộ này.';
  if (!a.supported)
    rows.push({ id: 'ctx', label: 'Bộ phát âm thanh', status: 'bad', value: 'Không có', explain, tip: 'Mở app bằng Safari (không dùng trình duyệt khác) và cập nhật iPadOS.' });
  else if (a.state === null)
    rows.push({ id: 'ctx', label: 'Bộ phát âm thanh', status: 'info', value: 'Chưa bật', explain, tip: 'Bấm “🔊 Phát thử” để bật.' });
  else {
    const sr = a.sampleRate ? ` · ${a.sampleRate} Hz` : '';
    if (a.state === 'running') rows.push({ id: 'ctx', label: 'Bộ phát âm thanh', status: 'ok', value: `Đang chạy${sr}`, explain });
    else
      rows.push({
        id: 'ctx',
        label: 'Bộ phát âm thanh',
        status: a.state === 'closed' ? 'bad' : 'warn',
        value: `${a.state === 'suspended' ? 'Đang tạm dừng' : a.state === 'interrupted' ? 'Bị gián đoạn (cuộc gọi / app khác)' : a.state}${sr}`,
        explain,
        tip: 'Bấm “🔊 Phát thử”. Vẫn không chạy: đóng hẳn app (vuốt lên từ đáy màn hình) rồi mở lại.',
      });
  }
  const base = msText(a.baseLatency);
  const out = msText(a.outputLatency);
  if (a.state !== null && a.supported) {
    const slow = a.outputLatency !== null && a.outputLatency > 0.15;
    rows.push({
      id: 'latency',
      label: 'Độ trễ loa',
      status: slow ? 'warn' : 'info',
      value: [base && `xử lý ${base}`, out && `ra loa ${out}`].filter(Boolean).join(' · ') || 'iPad không báo (bình thường trên iPadOS cũ)',
      explain: 'Thời gian từ lúc app phát tới lúc loa kêu — ảnh hưởng chấm nhịp.',
      tip: slow ? 'Độ trễ lớn — có thể đang dùng loa/tai nghe Bluetooth. Dùng loa của iPad khi tập theo nhịp.' : undefined,
    });
  }
  rows.push(heardRow('heard', 'Bố mẹ nghe thử', a.heard, 'Bấm “🔊 Phát thử” — app đàn Đô–Mi–Son–Đô.', SILENT_TIP));
  return rows;
}

function heardRow(id: string, label: string, heard: Heard, ask: string, tip: string): DiagRow {
  if (heard === 'yes') return { id, label, status: 'ok', value: 'Nghe rõ', explain: 'Bố mẹ xác nhận nghe rõ.' };
  if (heard === 'no') return { id, label, status: 'bad', value: 'Không nghe thấy', explain: 'Bố mẹ không nghe thấy tiếng.', tip };
  return { id, label, status: 'info', value: 'Chưa thử', explain: ask };
}

function voiceRows(s: DiagSnapshot): DiagRow[] {
  const v = s.voice;
  const rows: DiagRow[] = [];
  const explain = 'App đọc to câu hướng dẫn cho bé (bé đọc chậm).';
  if (!v.supported) {
    rows.push({ id: 'tts', label: 'Giọng đọc của iPad', status: 'bad', value: 'Không có', explain, tip: 'Mở app bằng Safari và cập nhật iPadOS. App vẫn dùng được, chỉ không đọc to.' });
    return rows;
  }
  if (!v.loaded) rows.push({ id: 'vi', label: 'Giọng tiếng Việt', status: 'wait', value: 'Đang tìm…', explain });
  else if (v.viVoices.length)
    rows.push({ id: 'vi', label: 'Giọng tiếng Việt', status: 'ok', value: v.viVoices.join(', '), explain });
  else
    rows.push({
      id: 'vi',
      label: 'Giọng tiếng Việt',
      status: 'bad',
      value: `Chưa có (iPad có ${v.total} giọng khác)`,
      explain: 'iPad chưa tải giọng tiếng Việt nên app im lặng thay vì đọc hướng dẫn.',
      tip: 'Cài giọng “Linh” (miễn phí, khoảng 5 phút):',
      steps: VOICE_INSTALL_STEPS,
    });
  rows.push(
    v.enabled
      ? { id: 'setting', label: 'Giọng đọc trong app', status: 'ok', value: 'Bật', explain: 'Cài đặt “Giọng đọc hướng dẫn” của app.' }
      : {
          id: 'setting',
          label: 'Giọng đọc trong app',
          status: 'warn',
          value: 'Tắt',
          explain: 'Bố mẹ đã tắt “Giọng đọc hướng dẫn”.',
          tip: 'Phụ huynh → Nâng cao → Cài đặt → Giọng đọc hướng dẫn → Bật.',
        },
  );
  rows.push(
    heardRow(
      'heard',
      'Bố mẹ nghe thử',
      v.heard,
      'Bấm “🗣️ Nghe thử” — app đọc một câu ngắn.',
      'Tăng âm lượng, tắt chế độ im lặng; kiểm tra giọng “Linh” đã tải xong (Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt).',
    ),
  );
  return rows;
}

function micRows(s: DiagSnapshot): DiagRow[] {
  const m = s.mic;
  const rows: DiagRow[] = [];
  const explain = 'Micro giúp app tự nghe đàn và chấm từng nốt (không bắt buộc).';
  if (!m.secure)
    rows.push({ id: 'api', label: 'Micro trên trang này', status: 'bad', value: 'Bị chặn (không phải https)', explain, tip: 'Mở app bằng địa chỉ https:// (GitHub Pages) rồi thêm vào Màn hình chính.' });
  else if (!m.getUserMedia)
    rows.push({ id: 'api', label: 'Micro trên trang này', status: 'bad', value: 'Không dùng được', explain, tip: 'Mở bằng Safari và cập nhật iPadOS.' });
  else rows.push({ id: 'api', label: 'Micro trên trang này', status: 'ok', value: 'Dùng được', explain });

  const p = m.permission;
  if (p === undefined) rows.push({ id: 'perm', label: 'Quyền micro', status: 'wait', value: 'Đang hỏi…', explain: 'iPad có cho app dùng micro không.' });
  else if (p === 'granted') rows.push({ id: 'perm', label: 'Quyền micro', status: 'ok', value: 'Đã cho phép', explain: 'iPad đã cho app dùng micro.' });
  else if (p === 'denied')
    rows.push({
      id: 'perm',
      label: 'Quyền micro',
      status: 'bad',
      value: 'Đang bị chặn',
      explain: 'iPad đang chặn micro của app.',
      tip: 'Cài đặt → Safari → Micrô → chọn “Hỏi” hoặc “Cho phép”, rồi đóng hẳn app và mở lại.',
    });
  else if (p === 'prompt')
    rows.push({ id: 'perm', label: 'Quyền micro', status: 'info', value: 'Chưa hỏi', explain: 'iPad sẽ hỏi khi bố mẹ bấm “Cho phép micro” — chọn Cho phép.' });
  else
    rows.push({
      id: 'perm',
      label: 'Quyền micro',
      status: 'info',
      value: 'iPad không cho biết trước',
      explain: 'Bình thường trên iPadOS cũ — bấm “Mở Cài micro” để thử thật.',
    });

  rows.push(
    m.enabled
      ? { id: 'use', label: 'Dùng micro cho buổi học', status: 'ok', value: 'Bật', explain: 'App tự nghe và chấm nốt.' }
      : {
          id: 'use',
          label: 'Dùng micro cho buổi học',
          status: 'info',
          value: 'Tắt — bố mẹ bấm “Đúng rồi”',
          explain: 'Không bắt buộc. Muốn app tự nghe đàn: bấm “🎤 Mở Cài micro (3 bước)”.',
        },
  );
  rows.push({
    id: 'tune',
    label: 'Cài đặt micro',
    status: 'info',
    value:
      `độ nhạy ${SENS_TEXT[m.sensitivity] ?? m.sensitivity} · bù lệch dây ${m.tuningCents > 0 ? '+' : ''}${m.tuningCents} cent · ` +
      (m.latencyMs > 0 ? `độ trễ đã đo ${m.latencyMs} ms` : 'chưa đo độ trễ'),
    explain: 'Số liệu cho người hỗ trợ (bài kiểm tra 5 nốt tự chỉnh).',
  });
  const c = m.lastCheck;
  if (!c)
    rows.push({
      id: 'check',
      label: 'Kiểm tra 5 nốt gần nhất',
      // Đang dùng micro mà chưa từng kiểm tra → độ nhạy mặc định, đàn khẽ có thể không được nghe (OWNER 2026-10-08)
      status: m.enabled ? 'warn' : 'info',
      value: 'Chưa có',
      explain: 'Làm trong “Cài micro (3 bước)” → bước 2.',
      tip: m.enabled ? 'Micro đang bật mà chưa kiểm tra 5 nốt: làm ngay để app tự chỉnh độ nhạy (bé đàn khẽ mới được nghe).' : undefined,
    });
  else {
    const good = c.ok >= 4;
    rows.push({
      id: 'check',
      label: 'Kiểm tra 5 nốt gần nhất',
      status: good ? 'ok' : c.ok >= 3 ? 'warn' : 'bad',
      value: `nghe đúng ${c.ok}/${c.total} nốt${c.at ? ` · ${c.at}` : ''}`,
      explain: 'Micro nghe đúng ít nhất 4/5 nốt là đủ dùng cho buổi học.',
      tip: good ? undefined : 'Đặt iPad trên giá nhạc, tắt TV/quạt, bé đàn rõ từng nốt; làm lại bài kiểm tra 5 nốt.',
    });
  }
  const a = m.autoSens;
  if (a) {
    const t = Date.parse(a.at);
    rows.push({
      id: 'auto',
      label: 'Micro tự tăng độ nhạy',
      status: 'info',
      value: `${SENS_TEXT[a.from] ?? a.from} → ${SENS_TEXT[a.to] ?? a.to}${isNaN(t) ? '' : ` · ${fmtDay(t)}`}`,
      explain: `Trong buổi học có ${a.missed} lần bé đàn khẽ micro chưa nghe được → app tự tăng một bậc (mỗi lần bật micro tối đa một lần).`,
    });
  }
  return rows;
}

function storageRows(s: DiagSnapshot): DiagRow[] {
  const st = s.storage;
  const rows: DiagRow[] = [];
  rows.push({
    id: 'space',
    label: 'Bộ nhớ dữ liệu',
    status: st.full || !st.ok ? 'bad' : st.percent >= 80 ? 'warn' : 'ok',
    value: st.text,
    explain: 'Tiến độ của bé nằm trong bộ nhớ của app trên iPad này.',
    tip: st.full || !st.ok || st.percent >= 80 ? 'Bấm “💾 Sao lưu” ở màn Phụ huynh ngay, rồi gửi kết quả này cho người hỗ trợ.' : undefined,
  });
  const p = st.persisted;
  rows.push(
    p === undefined
      ? { id: 'persist', label: 'Lưu trữ bền', status: 'wait', value: 'Đang hỏi…', explain: 'iPad có hứa không tự xóa dữ liệu của app.' }
      : p === true
        ? { id: 'persist', label: 'Lưu trữ bền', status: 'ok', value: 'Có', explain: 'iPad sẽ không tự xóa dữ liệu của app.' }
        : p === false
          ? {
              id: 'persist',
              label: 'Lưu trữ bền',
              status: 'warn',
              value: 'Không',
              explain: 'iPad có thể tự xóa dữ liệu khi lâu không mở hoặc máy đầy.',
              tip: 'Thêm app vào Màn hình chính và sao lưu mỗi tuần (💾 Sao lưu → Lưu vào Tệp).',
            }
          : { id: 'persist', label: 'Lưu trữ bền', status: 'info', value: 'iPad không cho biết', explain: 'Bình thường trên iPadOS cũ — nhớ sao lưu mỗi tuần.' },
  );
  const last = st.lastBackupAt;
  const stale = last ? s.at - last > 14 * DAY_MS : st.completed >= 3;
  rows.push({
    id: 'backup',
    label: 'Sao lưu gần nhất',
    status: stale ? 'warn' : last ? 'ok' : 'info',
    value: last ? fmtDay(last) : 'Chưa lần nào',
    explain: 'Bản sao lưu giúp lấy lại tiến độ nếu iPad bị xóa dữ liệu.',
    tip: stale ? 'Bấm “💾 Sao lưu” ở đầu màn Phụ huynh → chọn “Lưu vào Tệp”.' : undefined,
  });
  rows.push({
    id: 'data',
    label: 'Dữ liệu học',
    status: 'info',
    value: `tuần ${st.week} · ${st.sessions} buổi (${st.completed} buổi xong) · giáo trình bản ${st.curriculumRev}`,
    explain: 'Tóm tắt để người hỗ trợ đối chiếu.',
  });
  return rows;
}

function offlineRows(s: DiagSnapshot): DiagRow[] {
  const o = s.offline;
  const rows: DiagRow[] = [];
  const explain = 'App lưu sẵn trên iPad để học được cả khi không có mạng.';
  if (!o.swSupported) rows.push({ id: 'sw', label: 'Chạy không cần mạng', status: 'bad', value: 'Không hỗ trợ', explain, tip: 'Mở app bằng Safari (https://) và cập nhật iPadOS.' });
  else if (o.controller) rows.push({ id: 'sw', label: 'Chạy không cần mạng', status: 'ok', value: 'Sẵn sàng', explain });
  else
    rows.push({
      id: 'sw',
      label: 'Chạy không cần mạng',
      status: 'warn',
      value: 'Chưa sẵn sàng',
      explain,
      tip: 'Mở app khi có Wi‑Fi, đợi khoảng 1 phút, đóng hẳn app rồi mở lại.',
    });
  const c = o.caches;
  rows.push(
    c === undefined
      ? { id: 'cache', label: 'Bản lưu sẵn', status: 'wait', value: 'Đang đọc…', explain: 'Bản app đã lưu trong iPad.' }
      : c === null
        ? { id: 'cache', label: 'Bản lưu sẵn', status: 'info', value: 'Không đọc được', explain: 'Bản app đã lưu trong iPad.' }
        : c.length
          ? { id: 'cache', label: 'Bản lưu sẵn', status: 'ok', value: c.join(', '), explain: 'Bản app đã lưu trong iPad.' }
          : {
              id: 'cache',
              label: 'Bản lưu sẵn',
              status: 'warn',
              value: 'Chưa có',
              explain: 'Chưa lưu bản app nào — mất mạng sẽ không mở được.',
              tip: 'Mở app khi có Wi‑Fi và đợi khoảng 1 phút.',
            },
  );
  rows.push(
    o.online
      ? { id: 'net', label: 'Mạng', status: 'ok', value: 'Có mạng', explain: 'Có mạng thì app tự tải bản mới.' }
      : { id: 'net', label: 'Mạng', status: 'info', value: 'Không có mạng', explain: 'Không sao — app vẫn chạy nếu đã lưu sẵn.' },
  );
  return rows;
}

function speedStatus(ms: number | null | undefined): DiagStatus {
  if (ms === undefined) return 'wait';
  if (ms === null) return 'info';
  return ms < 60 ? 'ok' : ms < 250 ? 'warn' : 'bad';
}

function perfRows(s: DiagSnapshot): DiagRow[] {
  const p = s.perf;
  const slowTip = 'iPad hơi chậm: đóng bớt app đang chạy ngầm, khởi động lại iPad.';
  const v = (ms: number | null | undefined) =>
    ms === undefined ? 'Đang đo…' : ms === null ? 'Không đo được' : ms < 0.1 ? 'dưới 0,1 ms' : `${Math.round(ms * 10) / 10} ms`;
  const plan = speedStatus(p.planMs);
  const home = speedStatus(p.homeMs);
  return [
    {
      id: 'plan',
      label: 'Chuẩn bị buổi học',
      status: plan,
      value: v(p.planMs),
      explain: 'Thời gian app soạn các bước của một buổi học.',
      tip: plan === 'warn' || plan === 'bad' ? slowTip : undefined,
    },
    {
      id: 'home',
      label: 'Tính bảng của bố mẹ',
      status: home,
      value: v(p.homeMs),
      explain: 'Thời gian app đọc tiến độ để vẽ màn chính / Phụ huynh.',
      tip: home === 'warn' || home === 'bad' ? slowTip : undefined,
    },
    {
      id: 'cpu',
      label: 'Cấu hình máy',
      status: 'info',
      value: `${p.cores ? `${p.cores} nhân` : 'số nhân không rõ'} · ${p.memoryGB ? `RAM ~${p.memoryGB} GB` : 'RAM không rõ (Safari không báo)'}`,
      explain: 'Chỉ để tham khảo.',
    },
  ];
}

/** Toàn bộ bảng kiểm (7 mục). */
export function diagSections(s: DiagSnapshot): DiagSection[] {
  return [
    { id: 'device', title: '📱 Thiết bị', rows: deviceRows(s) },
    { id: 'audio', title: '🔊 Âm thanh', rows: audioRows(s) },
    { id: 'voice', title: '🗣️ Giọng đọc', rows: voiceRows(s) },
    { id: 'mic', title: '🎤 Micro', rows: micRows(s) },
    { id: 'storage', title: '💾 Lưu trữ', rows: storageRows(s) },
    { id: 'offline', title: '📶 Không cần mạng', rows: offlineRows(s) },
    { id: 'perf', title: '⚡ Hiệu năng', rows: perfRows(s) },
  ];
}

export function countStatus(sections: DiagSection[]): Record<DiagStatus, number> {
  const n: Record<DiagStatus, number> = { ok: 0, warn: 0, bad: 0, info: 0, wait: 0 };
  for (const sec of sections) for (const r of sec.rows) n[r.status]++;
  return n;
}

// ---------------------------------------------------------------- Kiểm tra 5 nốt (nhật ký micro)

/** Tóm tắt lần kiểm tra 5 nốt từ nhật ký micro (micTest.ts buildMicLog). */
export function micCheckFromLog(log: unknown): { ok: number; total: number; at: string } | null {
  if (!log || typeof log !== 'object') return null;
  const o = log as { steps?: unknown; at?: unknown; checkAt?: unknown };
  if (!Array.isArray(o.steps) || o.steps.length === 0) return null;
  const ok = o.steps.filter((x) => (x as { result?: unknown })?.result === 'ok').length;
  // checkAt: nhật ký lưu lúc rời màn mà lần đó không kiểm tra 5 nốt → giữ ngày của lần kiểm tra trước
  const when = typeof o.checkAt === 'string' ? o.checkAt : o.at;
  const t = typeof when === 'string' ? Date.parse(when) : NaN;
  return { ok, total: o.steps.length, at: isNaN(t) ? '' : fmtDay(t) };
}

// ---------------------------------------------------------------- Soạn bản gửi người hỗ trợ

export interface ReportOptions {
  /** Góp ý của bố mẹ (có thể rỗng) */
  feedback?: string;
  /** Chỉ có khi bố mẹ tích "kèm tên bé" */
  childName?: string;
  /** Nhật ký micro gần nhất (nếu có) — vào phần JSON */
  micLog?: unknown;
}

/** Phần JSON kỹ thuật — KHÔNG có tên bé hay góp ý. */
export function technicalJSON(s: DiagSnapshot, micLog?: unknown): Record<string, unknown> {
  const d = parseDevice(s.ua, s.maxTouchPoints);
  return {
    app: 'piano-be-9 diag v1',
    version: s.appVersion,
    at: new Date(s.at).toISOString(),
    ua: s.ua,
    maxTouchPoints: s.maxTouchPoints,
    device: d,
    standalone: s.standalone,
    screen: s.screen,
    language: s.language,
    updateReady: s.updateReady,
    audio: s.audio,
    voice: s.voice,
    mic: s.mic,
    storage: { ...s.storage, lastBackupAt: s.storage.lastBackupAt ? new Date(s.storage.lastBackupAt).toISOString() : null },
    offline: s.offline,
    perf: s.perf,
    errors: s.errors ?? null,
    micLog: micLog ?? null,
  };
}

/**
 * Bản kết quả gọn bằng tiếng Việt (dán vào Zalo / tin nhắn) + phụ lục JSON kỹ thuật.
 * Chỉ có những gì bố mẹ thấy trên màn; tên bé chỉ có khi opts.childName được truyền (bố mẹ tự tích).
 */
export function composeReport(s: DiagSnapshot, opts: ReportOptions = {}): string {
  const sections = diagSections(s);
  const n = countStatus(sections);
  const d = parseDevice(s.ua, s.maxTouchPoints);
  const lines: string[] = [];
  lines.push('🩺 Piano bé — kết quả kiểm tra iPad');
  lines.push(`Lúc: ${fmtTime(s.at)} · Bản app: ${s.appVersion} · ${deviceText(d)}`);
  const name = opts.childName?.trim();
  if (name) lines.push(`Bé: ${name}`);
  lines.push(`Tóm tắt: ${n.ok} ✅ · ${n.warn} ⚠️ · ${n.bad} ❌`);
  for (const sec of sections) {
    lines.push('');
    lines.push(`[${sec.title}]`);
    for (const r of sec.rows) {
      lines.push(`${STATUS_ICON[r.status]} ${r.label}: ${r.value}`);
      if ((r.status === 'warn' || r.status === 'bad') && r.tip) lines.push(`   → ${r.tip}`);
    }
  }
  // (+ 2026-10-08) Lỗi gần đây (tối đa 5, mới nhất trước) — đầy đủ trong phần JSON
  if (s.errors?.length) {
    lines.push('');
    lines.push('[🐞 Lỗi gần đây]');
    for (const e of s.errors.slice(-5).reverse()) lines.push(`${fmtTime(e.t)} · ${e.kind}${e.screen ? ` · ${e.screen}` : ''} · ${e.v}: ${e.msg}`);
  }
  const fb = opts.feedback?.trim();
  lines.push('');
  lines.push('[📝 Góp ý của bố mẹ]');
  lines.push(fb || '(không có)');
  lines.push('');
  lines.push('--- Kỹ thuật (JSON, cho người hỗ trợ) ---');
  lines.push(JSON.stringify(technicalJSON(s, opts.micLog)));
  return lines.join('\n');
}
