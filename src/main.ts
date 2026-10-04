import './styles/main.css';
import { AudioEngine } from './audio/AudioEngine';
import { ProgressStore, type KeyValueStorage } from './progress/ProgressStore';
import { App } from './ui/App';
import { installAudioOverlay } from './ui/components/audioOverlay';
import { startScreen } from './ui/screens/start';
import { registerServiceWorker } from './pwa/updater';

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

const root = document.getElementById('app') as HTMLElement;
const app = new App(root, new AudioEngine(), new ProgressStore(storage()));
installTouchGuards();
installAudioOverlay(app.audio, () => app.started);
registerServiceWorker();
app.show(startScreen(app));
