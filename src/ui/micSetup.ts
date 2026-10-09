/**
 * (+ 2026-10-09) Phần micro của App (MicListener + phân tích cao độ / hợp âm + nhật ký) nằm trong CHUNK RIÊNG:
 * màn Bắt đầu không cần micro → chunk chính nhẹ hơn, khởi động nhanh hơn trên iPad cũ.
 * App nạp ngầm ngay khi khởi động; màn chính (và mọi màn sau nó) chờ chunk này xong mới mở (xem App.micModule).
 */
export { MicListener } from '../audio/MicListener';
export { saveAutoSens } from '../audio/micLogStore';
export { SENS_NAME } from '../audio/micTune';
export { speechBusy } from '../audio/voice';
