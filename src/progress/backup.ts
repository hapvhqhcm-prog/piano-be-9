import type { ProgressStore } from './ProgressStore';

/**
 * Giữ dữ liệu của bé AN TOÀN trên iPad.
 *
 * Rủi ro thật (rà soát 2026-10-05):
 * - Tiến độ chỉ nằm trong localStorage. Safari (tab thường, không "Thêm vào MH chính") có thể XÓA dữ liệu trang
 *   sau 7 ngày không mở → mất hết. → xin "lưu trữ bền" (navigator.storage.persist) + khuyên cài lên Màn hình chính
 *   (installCard) + nhắc xuất bản sao lưu.
 * - Xuất JSON bằng thẻ <a download> thường KHÔNG chạy khi app mở từ Màn hình chính (iOS standalone),
 *   mà trước đây vẫn ghi "đã sao lưu". → dùng bảng Chia sẻ của iOS (Lưu vào Tệp / AirDrop / Zalo…) khi có;
 *   chỉ ghi lastBackupAt khi THÀNH CÔNG.
 */

export type BackupResult = 'shared' | 'downloaded' | 'copied' | 'failed';

/** Phần navigator/document cần dùng — tiêm vào để test không cần trình duyệt. */
export interface BackupEnv {
  navigator?: {
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    canShare?: (data: { files?: File[] }) => boolean;
    clipboard?: { writeText(text: string): Promise<void> };
    standalone?: boolean;
    userAgent?: string;
    maxTouchPoints?: number;
    platform?: string;
  };
  document?: Pick<Document, 'createElement' | 'body'>;
  /** Đang chạy như app trên Màn hình chính */
  standalone?: boolean;
  createObjectURL?: (b: Blob) => string;
  revokeObjectURL?: (u: string) => void;
  now?: () => number;
}

/** App đang mở từ Màn hình chính (không phải tab Safari). */
export function isStandalone(): boolean {
  try {
    if ((globalThis.navigator as { standalone?: boolean } | undefined)?.standalone === true) return true;
    return !!globalThis.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** iPhone / iPad (iPadOS 13+ tự nhận là "Macintosh" nhưng có màn cảm ứng). */
export function isIOS(nav: BackupEnv['navigator'] = globalThis.navigator): boolean {
  const ua = nav?.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1;
}

export function backupFileName(store: ProgressStore): string {
  return `piano-be-9-${store.today()}.json`;
}

/**
 * Xuất bản sao lưu: (1) bảng Chia sẻ với file JSON (iPad: "Lưu vào Tệp") → (2) tải file (không dùng trong app
 * Màn hình chính của iOS vì thường hỏng lặng lẽ) → (3) sao chép vào bộ nhớ tạm. Chỉ ghi lastBackupAt khi thành công.
 * Người dùng tự đóng bảng Chia sẻ → 'failed' (không thử cách khác, không ghi là đã sao lưu).
 */
export async function exportBackup(store: ProgressStore, env: BackupEnv = {}): Promise<BackupResult> {
  const nav = env.navigator ?? (globalThis.navigator as BackupEnv['navigator']);
  const doc = env.document ?? (typeof document !== 'undefined' ? document : undefined);
  const now = env.now ?? Date.now;
  const json = store.exportJSON();
  const name = backupFileName(store);
  const ok = (r: BackupResult): BackupResult => {
    store.updateSettings({ lastBackupAt: now() });
    return r;
  };

  // 1) Bảng Chia sẻ (iOS 15+ / Android): đáng tin nhất trên iPad, kể cả app Màn hình chính
  let file: File | null = null;
  try {
    file = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : null;
  } catch {
    file = null;
  }
  if (file && typeof nav?.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return ok('shared');
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'failed'; // bố/mẹ tự đóng bảng chia sẻ
      // lỗi khác (NotAllowedError do mất "thao tác chạm"…) → thử cách sau
    }
  }

  // 2) Tải file — bỏ qua trong app Màn hình chính của iOS (thẻ download hay hỏng mà không báo lỗi)
  const standalone = env.standalone ?? isStandalone();
  const createURL = env.createObjectURL ?? (typeof URL !== 'undefined' ? URL.createObjectURL?.bind(URL) : undefined);
  const revokeURL = env.revokeObjectURL ?? (typeof URL !== 'undefined' ? URL.revokeObjectURL?.bind(URL) : undefined);
  if (doc && createURL && !(standalone && isIOS(nav))) {
    try {
      const a = doc.createElement('a');
      if ('download' in a) {
        const url = createURL(new Blob([json], { type: 'application/json' }));
        a.href = url;
        a.download = name;
        doc.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => revokeURL?.(url), 10_000);
        return ok('downloaded');
      }
    } catch {
      /* thử cách sau */
    }
  }

  // 3) Sao chép (dán vào Ghi chú / Zalo / email cho chính mình)
  if (typeof nav?.clipboard?.writeText === 'function') {
    try {
      await nav.clipboard.writeText(json);
      return ok('copied');
    } catch {
      /* hết cách */
    }
  }
  return 'failed';
}

/** Lời nhắn cho phụ huynh theo kết quả exportBackup (giao diện dùng chung). */
export const BACKUP_MESSAGE: Record<BackupResult, string> = {
  shared: '✅ Đã mở bảng Chia sẻ — chọn "Lưu vào Tệp" để giữ bản sao lưu.',
  downloaded: '✅ Đã tải file sao lưu (xem trong mục Tải về / Tệp).',
  copied: '✅ Đã sao chép dữ liệu — hãy dán vào Ghi chú hoặc gửi cho chính mình.',
  failed: '❌ Chưa sao lưu được — hãy thử lại.',
};

/**
 * Xin trình duyệt KHÔNG tự xóa dữ liệu của app (Safari xóa dữ liệu trang sau 7 ngày không dùng, trừ khi "bền").
 * Gọi sau lần chạm "Bắt đầu" đầu tiên. Trả về true nếu dữ liệu đã được lưu bền.
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  try {
    if (!storage) return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    if (typeof storage.persist === 'function') return await storage.persist();
  } catch {
    /* trình duyệt cũ / chế độ riêng tư */
  }
  return false;
}
