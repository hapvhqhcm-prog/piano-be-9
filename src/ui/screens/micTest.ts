import { MicListener, type MicState } from '../../audio/MicListener';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToPitch, noteLabel, pitchFreq } from '../../piano/pitchTable';
import type { App } from '../App';
import { actionBar, backButton, button, h } from '../components/dom';
import { parentScreen } from './parent';

const STATE_TEXT: Record<MicState, string> = {
  off: 'Micro đang tắt',
  starting: 'Đang bật micro… (iPad có thể hỏi quyền — chọn Cho phép)',
  on: '🎤 Đang nghe — hãy đàn một phím',
  denied:
    'iPad đang chặn micro. Vào Cài đặt → Safari → Micrô → chọn "Hỏi" hoặc "Cho phép", rồi mở lại app.',
  unsupported: 'Thiết bị/trang này không dùng được micro (cần mở bằng địa chỉ https:// GitHub Pages).',
  error: 'Không bật được micro. Thử đóng hẳn app rồi mở lại.',
};

/**
 * Màn phụ huynh "Thử micro": kiểm tra app nghe đàn cơ có đúng không,
 * và CHỈNH THEO ĐÀN NHÀ (đàn cơ lâu không lên dây thường lệch vài chục cents).
 */
export function micTestScreen(app: App) {
  return (root: HTMLElement) => {
    const store = app.store;
    const status = h('p', { class: 'lead' });
    const big = h('div', { class: 'note-big' }, '—');
    const detail = h('div', { class: 'note-sub' }, ' ');
    const levelBar = h('span', { class: 'mic-level-bar' });
    const tuning = h('p', { class: 'muted' });
    const calib = h('p', { class: 'lead' });
    const kb = new PianoKeyboard({ labels: 'all', fingerOnPress: false });
    kb.setEnabled(false);

    let calibrating = false;
    let samples: number[] = [];

    const showTuning = () => {
      const c = store.settings.micTuningCents;
      tuning.textContent = `Đang bù cho đàn nhà: ${c > 0 ? '+' : ''}${c} cents`;
    };

    const unState = app.mic.onState((s) => (status.textContent = STATE_TEXT[s]));
    const unFrame = app.mic.onFrame((f) => {
      levelBar.style.width = `${Math.min(100, Math.round(f.level * 250))}%`;
    });
    const unNote = app.mic.onNote((n) => {
      const p = midiToPitch(n.midi);
      big.textContent = noteLabel(p);
      const cents = Math.round(n.cents);
      detail.textContent = `${p} · ${n.freq.toFixed(1)} Hz · lệch ${cents > 0 ? '+' : ''}${cents} cents`;
      kb.setResult(p, 'good');
      if (calibrating) {
        // Độ lệch "thô" so với C4 chuẩn — so trực tiếp tần số, vì đàn lệch > nửa cung
        // sẽ bị nhận thành Si/Đô thăng nếu chỉ nhìn tên nốt.
        const raw = 1200 * Math.log2(n.freq / pitchFreq('C4'));
        if (Math.abs(raw) > 100) {
          calib.textContent = `Mình nghe thấy ${noteLabel(p)} — hãy đàn Đô giữa (C4) nhé.`;
          return;
        }
        samples.push(raw);
        if (samples.length < 3) {
          calib.textContent = `Tốt! Đàn Đô giữa thêm ${3 - samples.length} lần nữa…`;
          return;
        }
        const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
        const clamped = Math.max(-100, Math.min(100, avg));
        store.updateSettings({ micTuningCents: clamped });
        app.mic.tuningCents = clamped;
        calibrating = false;
        calib.textContent =
          Math.abs(clamped) >= 40
            ? `Đã chỉnh: đàn nhà lệch ${clamped} cents. Lệch khá nhiều — nên gọi thợ lên dây khi có dịp.`
            : `Đã chỉnh xong: đàn nhà lệch ${clamped} cents. ✅`;
        showTuning();
      }
    });

    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'stage' },
          h('h1', { class: 'title' }, '🎤 Thử micro với đàn nhà'),
          status,
          big,
          detail,
          h('div', { class: 'mic-level wide' }, levelBar),
          calib,
          tuning,
        ),
        h('div', { class: 'keyboard-wrap short' }, kb.el),
        actionBar(
          backButton(() => app.show(parentScreen(app))),
          button({
            icon: '🎤',
            label: 'Bật micro',
            kind: 'primary',
            onTap: async () => {
              app.mic.tuningCents = store.settings.micTuningCents;
              await app.mic.start();
            },
          }),
          button({
            icon: '🎯',
            label: 'Chỉnh theo đàn nhà',
            onTap: async () => {
              if (app.mic.state !== 'on') await app.mic.start();
              if (app.mic.state !== 'on') return;
              calibrating = true;
              samples = [];
              app.mic.tuningCents = 0;
              calib.textContent = 'Đàn phím Đô giữa (C4) 3 lần, mỗi lần cách nhau 1 giây.';
            },
          }),
          button({
            icon: '↺',
            label: 'Bù = 0',
            onTap: () => {
              store.updateSettings({ micTuningCents: 0 });
              app.mic.tuningCents = 0;
              calibrating = false;
              calib.textContent = '';
              showTuning();
            },
          }),
        ),
      ),
    );
    status.textContent = MicListener.supported ? STATE_TEXT[app.mic.state] : STATE_TEXT.unsupported;
    showTuning();

    return () => {
      unState();
      unFrame();
      unNote();
      kb.destroy();
      app.mic.stop();
    };
  };
}
