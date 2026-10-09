/**
 * 🎁 QUÀ MỞ KHÓA THEO ĐẢO — phần giao diện: áp món đang dùng (trang phục Bé Nốt, kiểu nhạc đệm), màn mừng "Quà mới!",
 * ô quà trong Sổ sticker. Logic thuần: src/lessons/unlocks.ts.
 */
import { UNLOCKS, autoEquip, equipped, storedCosmetics, unlockedItems, unseenUnlocks, withToggle, type UnlockDef } from '../../lessons/unlocks';
import { WEEKS } from '../../lessons/lessonEngine';
import { setBackingStyle } from '../../music/tune';
import { pitchFreq } from '../../piano/pitchTable';
import { isTimbre, playTimbre } from '../../audio/timbres';
import type { AppData } from '../../progress/schema';
import type { App } from '../App';
import { confetti } from './celebrate';
import { button, h, toast } from './dom';
import { mascot, setMascotOutfit } from './mascot';
import '../../styles/longterm.css';

/** Áp món đang dùng cho toàn app (Bé Nốt vẽ từ nay mặc trang phục; nhạc đệm theo kiểu đã chọn). */
export function applyCosmetics(data: Readonly<AppData>): void {
  const e = equipped(data);
  setMascotOutfit(e.outfit);
  setBackingStyle(e.backing);
}

const KIND_LABEL: Record<UnlockDef['kind'], string> = { outfit: 'Trang phục Bé Nốt', timbre: 'Tiếng đàn tự do', backing: 'Nhạc đệm' };

/**
 * Món mới mở (chưa xem) → đánh dấu đã xem + mặc trang phục mới nhất, áp ngay. Trả về các món mới (để hiện màn mừng
 * SAU khi màn đã vẽ — bé thấy Bé Nốt mặc đồ mới). Gọi TRƯỚC khi vẽ màn chính.
 */
export function takeFreshUnlocks(app: App): UnlockDef[] {
  const data = app.store.get();
  const fresh = unseenUnlocks(data);
  if (fresh.length) app.store.updateSettings({ cosmetics: autoEquip(data, fresh) });
  applyCosmetics(app.store.get());
  return fresh;
}

/** Màn mừng "🎁 Quà mới!" (nền mờ + thẻ giữa màn). `onClose`: gọi một lần khi đóng (mọi cách đóng). */
export function showUnlockCelebration(app: App, fresh: readonly UnlockDef[], openBook: () => void, onClose?: () => void): void {
  if (!fresh.length) return;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const island = (w: number) => WEEKS.find((x) => x.week === w)?.island ?? `Tuần ${w}`;
  const card = h(
    'div',
    { class: 'dialog-card unlock-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quà mới mở khóa' },
    h('div', { class: 'unlock-hero', 'aria-hidden': 'true' }, mascot('cheer', 110)),
    h('h2', { class: 'dialog-title' }, fresh.length > 1 ? `🎁 Con mở được ${fresh.length} món quà!` : '🎁 Quà mới mở khóa!'),
    h(
      'ul',
      { class: 'unlock-list' },
      ...fresh.map((d) =>
        h(
          'li',
          {},
          h('span', { class: 'unlock-icon', 'aria-hidden': 'true' }, d.icon),
          h('span', { class: 'unlock-text' }, h('b', {}, d.title), h('small', {}, `${KIND_LABEL[d.kind]} · qua ${island(d.week)}`)),
        ),
      ),
    ),
    h(
      'div',
      { class: 'dialog-actions' },
      button({
        icon: '📒',
        label: 'Xem quà',
        onTap: () => {
          close();
          openBook();
        },
      }),
      button({ icon: '🎉', label: 'Tuyệt!', kind: 'primary', onTap: close }),
    ),
  );
  const wrap = h('div', { class: 'dialog-backdrop unlock-backdrop' }, card);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  confetti(40);
  void app.audio.chime();
}

/** Mục "🎁 Quà của các đảo" trong Sổ sticker: chạm món đã mở để dùng / thôi dùng. */
export function unlockSection(app: App, onChange: () => void): HTMLElement {
  const data = app.store.get();
  const open = new Set(unlockedItems(data).map((x) => x.id));
  const on = equipped(data);
  const using = (d: UnlockDef) => on[d.kind] === d.key;
  const cell = (d: UnlockDef) => {
    const isOpen = open.has(d.id);
    const active = isOpen && using(d);
    return h(
      'button',
      {
        class: `sticker-cell unlock-cell kind-${d.kind}${isOpen ? ' earned' : ' locked'}${active ? ' using' : ''}`,
        type: 'button',
        'data-unlock': d.id,
        'aria-pressed': isOpen ? String(active) : undefined,
        'aria-label': isOpen ? `${d.title} — ${active ? 'đang dùng, chạm để thôi' : 'chạm để dùng'}` : `Chưa mở — qua đảo tuần ${d.week}`,
        onClick: () => {
          if (!isOpen) return toast(`🔒 Qua đảo tuần ${d.week} để mở: ${d.title}`);
          const next = withToggle(app.store.get(), d.id);
          app.store.updateSettings({ cosmetics: next });
          applyCosmetics(app.store.get());
          const nowOn = next[d.kind] === d.key;
          if (nowOn && d.kind === 'timbre' && isTimbre(d.key)) {
            void app.audio.unlock().then(() => {
              ['C4', 'E4', 'G4', 'C5'].forEach((p, i) => window.setTimeout(() => playTimbre(app.audio.context, d.key as never, pitchFreq(p), 0.4), i * 220));
            });
          }
          toast(nowOn ? `${d.icon} Đang dùng: ${d.title}${d.kind === 'timbre' ? ' (ở Đàn tự do)' : d.kind === 'backing' ? ' (khi đàn theo nhịp)' : ''}` : `Thôi dùng ${d.title}`);
          onChange();
        },
      },
      h('span', { class: 'sticker-pic unlock-pic', 'aria-hidden': 'true' }, isOpen ? d.icon : '🎁'),
      h('span', { class: 'sticker-name' }, isOpen ? d.title : `Đảo tuần ${d.week}`),
      active ? h('span', { class: 'unlock-using' }, '✓ Đang dùng') : null,
    );
  };
  const got = UNLOCKS.filter((d) => open.has(d.id)).length;
  return h(
    'section',
    { class: 'sticker-section unlock-section' },
    h('h2', { class: 'sticker-kicker' }, '🎁 Quà của các đảo', h('span', { class: 'sticker-count' }, `${got}/${UNLOCKS.length}`)),
    h('p', { class: 'unlock-help' }, 'Qua mỗi đảo là có quà mới: áo mũ cho Bé Nốt, tiếng đàn lạ, kiểu nhạc đệm. Chạm để dùng!'),
    h('div', { class: 'sticker-grid' }, ...UNLOCKS.map(cell)),
  );
}

/** (Đàn tự do) Tiếng đang dùng: mã timbre hợp lệ đã mở, null = piano. */
export function currentTimbre(data: Readonly<AppData>): string | null {
  return equipped(data).timbre;
}

/** (Đàn tự do) Đặt tiếng đang dùng (null = piano). */
export function setTimbre(app: App, key: string | null): void {
  const c = storedCosmetics(app.store.get());
  app.store.updateSettings({ cosmetics: { ...c, timbre: key ?? undefined } });
}
