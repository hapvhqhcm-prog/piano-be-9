/**
 * v5.1 — "NGHE LẠI CON ĐÀN" (OWNER duyệt 2026-10-06): ghi âm TẠM vài chục giây khi bé đàn để bé nghe lại, tự nhận xét.
 * Chỉ giữ trong BỘ NHỚ (Blob/ObjectURL), không lưu xuống máy, không gửi đi; rời màn / tắt app là mất.
 *
 * HỢP ĐỒNG (agent âm thanh hiện thực; agent giao diện dùng trong song.ts):
 *   const rec = takeRecorder(app.mic)        // null nếu không hỗ trợ / micro chưa bật
 *   rec.start()                              // bắt đầu lượt đàn
 *   const clip = await rec.stop()            // kết thúc lượt → TakeClip | null
 *   clip.play(); clip.stopPlayback(); clip.dispose()   // nghe lại / dừng / giải phóng (gọi khi rời màn)
 */
export interface TakeClip {
  /** Thời lượng (giây) */
  seconds: number;
  play(): Promise<void>;
  stopPlayback(): void;
  dispose(): void;
}

export interface TakeRecorder {
  start(): void;
  stop(): Promise<TakeClip | null>;
  /** Hủy, không giữ gì */
  cancel(): void;
}

/** Stub cho tới khi agent âm thanh hiện thực — trả null = "không ghi được" (giao diện ẩn nút Nghe lại). */
export function takeRecorder(_mic: unknown): TakeRecorder | null {
  return null;
}
