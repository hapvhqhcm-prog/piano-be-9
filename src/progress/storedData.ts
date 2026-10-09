/**
 * Đọc dữ liệu đã lưu + xử lý BẢN HỎNG ("corrupt-*") / BẢN CẤT ("archived-*") của ProgressStore.
 * Hàm thuần trên kho khóa–giá trị (storage.ts) — ProgressStore giữ trạng thái và gọi các hàm này.
 */
import { isFutureData, migrate } from './migrations';
import { sessionCount } from './history';
import { defaultData, validateAppData, type AppData } from './schema';
import { MAX_ARCHIVES, MAX_UNREADABLE_CORRUPT, STORAGE_KEY, type KeyValueStorage } from './storage';

/** Chuỗi đã lưu → dữ liệu hợp lệ (đã chuyển đổi phiên bản), hoặc null nếu trống / hỏng / sai cấu trúc. */
export function parseStored(raw: string | null): AppData | null {
  if (!raw) return null;
  try {
    const d = migrate(JSON.parse(raw));
    return validateAppData(d).length === 0 ? d : null;
  } catch {
    return null;
  }
}

/** Các khóa "corrupt-*" hiện có (cả bản đọc được lẫn không). */
export function corruptKeys(kv: KeyValueStorage): string[] {
  const keys: string[] = [];
  const n = kv.length ?? 0;
  for (let i = 0; i < n; i++) {
    const k = kv.key?.(i);
    if (k && k.startsWith(`${STORAGE_KEY}:corrupt-`)) keys.push(k);
  }
  return keys;
}

/** Các bản dữ liệu từng bị coi là hỏng (đã cất ở khóa "piano-be-9:corrupt-<thời điểm>"), mới nhất trước. */
export function corruptBackups(kv: KeyValueStorage): Array<{ key: string; data: AppData }> {
  const out: Array<{ key: string; data: AppData; ts: number }> = [];
  for (const k of corruptKeys(kv)) {
    const d = parseStored(kv.getItem(k));
    if (d) out.push({ key: k, data: d, ts: Number(k.split('-').pop()) || 0 });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

/**
 * (+ 2026-10-08) Dọn các bản "corrupt-*" KHÔNG đọc được: giữ `keep` bản mới nhất, bỏ phần còn lại (để bộ nhớ không
 * đầy dần). Bản đọc được không đụng tới (loadStored lo). Trả về true nếu có bỏ bản nào.
 */
export function pruneUnreadableCorrupt(kv: KeyValueStorage, keep: number = MAX_UNREADABLE_CORRUPT): boolean {
  const ts = (k: string) => Number(k.split('-').pop()) || 0;
  let bad: string[];
  try {
    bad = corruptKeys(kv)
      .filter((k) => {
        const raw = kv.getItem(k);
        if (parseStored(raw)) return false;
        try {
          return !isFutureData(JSON.parse(raw ?? '')); // dữ liệu của bản app mới hơn → không phải rác, giữ
        } catch {
          return true;
        }
      })
      .sort((a, b) => ts(b) - ts(a));
  } catch {
    return false;
  }
  let dropped = false;
  for (const k of bad.slice(Math.max(0, keep))) {
    try {
      kv.removeItem(k);
      dropped = true;
    } catch {
      /* bỏ qua */
    }
  }
  return dropped;
}

/**
 * Cất bản sao lưu "corrupt-*" sang "archived-*": không bao giờ tự khôi phục nữa nhưng vẫn giữ lại
 * (không mất gì). Tránh bản cũ đè lên dữ liệu sau khi đặt lại / nhập JSON.
 */
export function archiveCorrupt(kv: KeyValueStorage, keys: string[] = corruptKeys(kv)): void {
  for (const k of keys) {
    try {
      const v = kv.getItem(k);
      if (v !== null) kv.setItem(k.replace(`${STORAGE_KEY}:corrupt-`, `${STORAGE_KEY}:archived-`), v);
      kv.removeItem(k);
    } catch {
      /* bỏ qua */
    }
  }
}

/** Các khóa "archived-*", mới nhất trước. */
export function archivedKeys(kv: KeyValueStorage): string[] {
  const keys: string[] = [];
  const n = kv.length ?? 0;
  for (let i = 0; i < n; i++) {
    const k = kv.key?.(i);
    if (k && k.startsWith(`${STORAGE_KEY}:archived-`)) keys.push(k);
  }
  const ts = (k: string) => Number(k.split('-').pop()) || 0;
  return keys.sort((a, b) => ts(b) - ts(a));
}

/** Chỉ giữ MAX_ARCHIVES bản mới nhất. */
export function pruneArchives(kv: KeyValueStorage): void {
  for (const k of archivedKeys(kv).slice(MAX_ARCHIVES)) {
    try {
      kv.removeItem(k);
    } catch {
      /* bỏ qua */
    }
  }
}

/** Bỏ bản cất CŨ NHẤT (trừ `keep`). Trả về false nếu không còn bản nào để bỏ. */
export function dropOldestArchive(kv: KeyValueStorage, keep?: string): boolean {
  const k = archivedKeys(kv)
    .filter((x) => x !== keep)
    .pop();
  if (!k) return false;
  try {
    kv.removeItem(k);
  } catch {
    return false;
  }
  return true;
}

/**
 * Trước khi GHI ĐÈ dữ liệu (nhập JSON / đặt lại): cất bản hiện tại sang "archived-<thời điểm>" để lỡ tay còn cứu được.
 * Dữ liệu trống (chưa học buổi nào) thì không cần cất. Dữ liệu "bản mới hơn" → cất nguyên chuỗi gốc.
 * Ghi bản mới TRƯỚC; hết chỗ thì bỏ dần bản cất cũ rồi thử lại. Thành công → chỉ giữ MAX_ARCHIVES bản mới nhất.
 */
export function archiveCurrent(
  kv: KeyValueStorage,
  data: AppData,
  futureVersion: boolean,
  now: () => Date,
): { needed: boolean; key: string | null } {
  const raw = futureVersion ? kv.getItem(STORAGE_KEY) : null;
  const needed = futureVersion ? raw !== null : sessionCount(data) > 0 || !!data.learner.name;
  if (!needed) return { needed: false, key: null };
  const payload = raw ?? JSON.stringify(data);
  let ts = now().getTime();
  while (kv.getItem(`${STORAGE_KEY}:archived-${ts}`) !== null) ts++;
  const key = `${STORAGE_KEY}:archived-${ts}`;
  for (;;) {
    try {
      kv.setItem(key, payload);
      break;
    } catch {
      if (!dropOldestArchive(kv, key)) return { needed: true, key: null };
    }
  }
  // Bản vừa cất luôn được giữ (kể cả khi đồng hồ lùi làm nó không "mới nhất")
  const rest = archivedKeys(kv).filter((k) => k !== key);
  for (const k of rest.slice(Math.max(0, MAX_ARCHIVES - 1))) {
    try {
      kv.removeItem(k);
    } catch {
      /* bỏ qua */
    }
  }
  return { needed: true, key };
}

/** Kết quả đọc dữ liệu lúc mở app (loadStored) */
export interface LoadResult {
  data: AppData;
  /** Dữ liệu trong máy do bản app MỚI HƠN ghi (data = dữ liệu tạm trống) */
  futureVersion: boolean;
  /** Đã tự khôi phục tiến độ từ bản "corrupt-*" */
  recoveredFromBackup: boolean;
  /** Dữ liệu chính hỏng → đã cất sang "corrupt-*", data = dữ liệu mới */
  recoveredFromCorrupt: boolean;
}

/** Đọc dữ liệu chính khi mở app (tự khôi phục / cất bản hỏng — xem chú thích bên trong). */
export function loadStored(kv: KeyValueStorage, now: () => Date): LoadResult {
  const r = { futureVersion: false, recoveredFromBackup: false, recoveredFromCorrupt: false };
  const raw = kv.getItem(STORAGE_KEY);
  // (+ 2026-10-06) Dữ liệu của bản app MỚI HƠN: giữ NGUYÊN (không coi là hỏng, không khôi phục bản khác đè lên)
  if (raw) {
    try {
      if (isFutureData(JSON.parse(raw))) {
        r.futureVersion = true;
        return { ...r, data: defaultData(now()) };
      }
    } catch {
      /* không phải JSON → xử lý như dữ liệu hỏng bên dưới */
    }
  }
  const main = parseStored(raw);
  // Tự khôi phục (chỉ một lần): dữ liệu chính trống/ít hơn một bản từng bị đặt lại do lỗi kiểm tra cũ
  // (vd lỗi tuần 9) → dùng bản đó. Các bản đọc được còn lại coi như cũ → cất sang "archived-*" để sau này
  // không đè lên dữ liệu thật (đặt lại / nhập JSON). Bản chưa đọc được giữ nguyên chờ bản sửa lỗi sau.
  // So TỔNG số buổi (gồm buổi đã gộp vào history) — dữ liệu đã gộp có ít buổi "còn giữ" hơn.
  const backups = corruptBackups(kv);
  const best = backups.find((b) => sessionCount(b.data) > (main ? sessionCount(main) : 0));
  if (best) {
    r.recoveredFromBackup = true;
    try {
      // Dữ liệu chính đang hỏng → vẫn cất lại trước khi ghi đè
      if (raw && !main) kv.setItem(`${STORAGE_KEY}:corrupt-${now().getTime()}`, raw);
      kv.setItem(STORAGE_KEY, JSON.stringify(best.data));
      archiveCorrupt(kv, backups.map((b) => b.key));
    } catch {
      /* bỏ qua — chưa ghi được thì để nguyên, lần mở sau thử lại */
    }
    return { ...r, data: best.data };
  }
  archiveCorrupt(kv, backups.map((b) => b.key));
  if (main) return { ...r, data: main };
  if (!raw) return { ...r, data: defaultData(now()) };
  try {
    kv.setItem(`${STORAGE_KEY}:corrupt-${now().getTime()}`, raw);
  } catch {
    /* bỏ qua */
  }
  r.recoveredFromCorrupt = true;
  return { ...r, data: defaultData(now()) };
}
