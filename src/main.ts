import './styles/main.css';
import './styles/theme.css';
import { AudioEngine } from './audio/AudioEngine';
import { ProgressStore, type KeyValueStorage } from './progress/ProgressStore';
import { App, micModule } from './ui/App';
import { installAudioOverlay } from './ui/components/audioOverlay';
import { startScreen } from './ui/screens/start';
import { registerServiceWorker } from './pwa/updater';
import { installErrorCapture } from './pwa/errorLog';
import { SaveMirror, idbBackend, restoreFromMirrorResult, type MirrorRestore } from './progress/mirror';

// (+ 2026-10-08) Ghi lại mọi lỗi chưa xử lý (nhật ký nhỏ — màn 🩺 Kiểm tra iPad) — càng sớm càng tốt
installErrorCapture();

/** localStorage có thể bị chặn (chế độ riêng tư cũ) → dùng bộ nhớ tạm. */
function storage(): KeyValueStorage {
  try {
    const k = '__piano_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const m = new Map<string, string>();
    return {
      getItem: (key) => m.get(key) ?? null,
      setItem: (key, v) => void m.set(key, v),
      removeItem: (key) => void m.delete(key),
    };
  }
}

/** Chặn zoom/cuộn/chọn chữ ngoài ý muốn trên iPad (§3 Touch). */
function installTouchGuards(): void {
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!(e.target as Element | null)?.closest?.('.scrollable')) e.preventDefault();
    },
    { passive: false },
  );
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target as Element | null)?.closest?.('input, textarea')) e.preventDefault();
  });
}

/**
 * (+ 2026-10-08) Bản sao thứ hai trong IndexedDB (progress/mirror.ts): dữ liệu chính trống / hỏng mà bản sao có
 * tiến độ → khôi phục TRƯỚC khi tạo store (chờ IndexedDB tối đa 1,5 s; dữ liệu chính đọc được thì không chờ gì).
 */
async function boot(): Promise<void> {
  const kv = storage();
  let backend: ReturnType<typeof idbBackend> = null;
  try {
    backend = idbBackend();
  } catch {
    backend = null;
  }
  const restored = await restoreFromMirrorResult(kv, backend).catch((): MirrorRestore => 'unknown');
  // Dữ liệu chính trống / hỏng mà chưa đọc được bản sao (IndexedDB chậm / lỗi) → lần chạy này KHÔNG gắn bản sao:
  // dữ liệu trống của lần này không được ghi đè bản sao (có thể là tiến độ thật duy nhất — lần mở sau thử khôi phục lại).
  const mirror = backend && restored !== 'unknown' ? new SaveMirror(backend) : null;
  const store = new ProgressStore(kv, undefined, mirror ? { mirror } : {});
  store.recoveredFromMirror = restored === 'restored';
  const root = document.getElementById('app') as HTMLElement;
  const app = new App(root, new AudioEngine(), store);
  installTouchGuards();
  installAudioOverlay(app.audio, () => app.started);
  registerServiceWorker();
  app.show(startScreen(app));

  // Chỉ bản dev: cho phép kiểm thử tự động điều khiển app (không có trong bản build).
  // (Chờ chunk micro nạp xong: kịch bản chụp màn nhảy thẳng vào các màn dùng app.mic, không qua màn chính.)
  if (import.meta.env.DEV) void micModule.load().then(() => ((window as unknown as { __piano: App }).__piano = app));
}

void boot();
