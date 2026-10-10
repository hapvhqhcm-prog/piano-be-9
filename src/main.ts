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

/**
 * Chặn cuộn/chọn chữ/zoom chạm-đúp ngoài ý muốn trên iPad (§3 Touch).
 * (2026-10-09, trợ năng) VẪN cho phóng to bằng 2 ngón (pinch) ở mọi nơi TRỪ trên bàn phím đàn — bàn phím có
 * touch-action: none và chặn cử chỉ ở đây để bấm nhiều ngón không làm màn hình phóng to.
 */
function installTouchGuards(): void {
  const onKeyboard = (e: Event) => !!(e.target as Element | null)?.closest?.('.keyboard');
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.target as Element | null;
      if (t?.closest?.('.scrollable')) return;
      if (e.touches.length > 1 && !onKeyboard(e)) return; // pinch-zoom
      e.preventDefault();
    },
    { passive: false },
  );
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => {
      if (onKeyboard(e)) e.preventDefault();
    }, { passive: false });
  }
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target as Element | null)?.closest?.('input, textarea')) e.preventDefault();
  });
}

/**
 * (+ 2026-10-08) Bản sao thứ hai trong IndexedDB (progress/mirror.ts): dữ liệu chính trống / hỏng mà bản sao có
 * tiến độ → khôi phục TRƯỚC khi tạo store (chờ IndexedDB tối đa 1,5 s; dữ liệu chính đọc được thì không chờ gì).
 */
async function boot(): Promise<void> {
  // (+ 2026-10-09) Chỉ bản dev: trang nghe thử A/B tiếng đàn (?soundtest) — không có trong bản build.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('soundtest')) {
    const { mountSoundTest } = await import('./dev/soundTest');
    mountSoundTest(document.getElementById('app') as HTMLElement);
    return;
  }
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

  // Chỉ bản dev (và bản build riêng của kiểm thử WebKit — __TEST_HOOKS__): cho phép kiểm thử tự động điều khiển app.
  // (Chờ chunk micro nạp xong: kịch bản chụp màn nhảy thẳng vào các màn dùng app.mic, không qua màn chính.)
  if (import.meta.env.DEV || __TEST_HOOKS__) void micModule.load().then(() => ((window as unknown as { __piano: App }).__piano = app));
}

void boot();
