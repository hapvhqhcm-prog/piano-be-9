/**
 * (+ 2026-10-17, OWNER duyệt — "đổi iPad an toàn") Nhập bản sao lưu JSON = có thể là iPad KHÁC: micro, loa, độ trễ khác hẳn.
 * Các số đo của MICRO TRÊN MÁY CŨ (độ trễ loa → micro, lệch dây tự học theo micro, độ nhạy) không còn đúng → về mặc định;
 * "Dùng micro" giữ nguyên nhưng đánh dấu "cần cài lại micro" (settings.ops.micSetupNeededAt) → app mời "Cài micro 3 bước".
 * Bù lệch dây BẰNG TAY (micTuningCents) là của cây đàn nhà, không phải của iPad → giữ.
 * Album (bản thu) KHÔNG nằm trong bản sao lưu (IndexedDB riêng) — nhắc bố mẹ chia sẻ bản thu trước khi đổi máy.
 */
import { defaultSettings, type AppData } from './schema';
import { mergeOps, readOps } from '../pwa/opsState';

/** Lời nhắc dùng ở nút sao lưu / hướng dẫn */
export { ALBUM_NOTE as ALBUM_NOT_IN_BACKUP } from './backup';

export interface DeviceReset {
  /** Có trường micro nào bị đưa về mặc định */
  micReset: boolean;
  /** Micro đang bật → cần "Cài micro 3 bước" trên máy này */
  needsMicSetup: boolean;
}

/** Đưa các số đo riêng của máy về mặc định (SỬA trực tiếp `data`). */
export function resetDeviceSpecific(data: AppData, now: number): DeviceReset {
  const st = data.settings;
  const def = defaultSettings();
  const micReset = st.micLatencyMs !== def.micLatencyMs || st.micAutoTune !== undefined || st.micSensitivity !== def.micSensitivity;
  st.micLatencyMs = def.micLatencyMs;
  st.micSensitivity = def.micSensitivity;
  delete st.micAutoTune;
  const ops = readOps(st);
  const needsMicSetup = !!st.micEnabled;
  // Lời khuyên "Tự động khóa" là của iPad cũ → máy mới hiện lại một lần
  const next = mergeOps(ops, { wakeDeniedAt: undefined, wakeTipAt: undefined, micSetupNeededAt: needsMicSetup ? now : undefined });
  if (Object.keys(next).length) st.ops = next;
  else delete st.ops;
  return { micReset, needsMicSetup };
}

/** Bố mẹ đã cài lại micro (kiểm tra 5 nốt / đo độ trễ) → bỏ dấu "cần cài lại micro". Trả về ops mới, null = không đổi. */
export function clearMicSetupNeeded(settings: { ops?: unknown }): ReturnType<typeof readOps> | null {
  const ops = readOps(settings);
  if (ops.micSetupNeededAt === undefined) return null;
  return mergeOps(ops, { micSetupNeededAt: undefined });
}
