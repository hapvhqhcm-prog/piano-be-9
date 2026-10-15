/**
 * (+ 2026-10-15) Chỗ đặt tranh "Tư thế tay" NẠP MUỘN: trả về ngay một ô giữ chỗ (đúng tỉ lệ khung, không giật bố cục),
 * tranh thật (handTechniqueArt.ts — chunk riêng) điền vào khi nạp xong. Lỗi nạp (mất mạng lúc chưa cache) → ô trống, không vỡ màn.
 */
import type { HandPrincipleId, HandVariant } from '../../lessons/handTechnique';
import { lazy } from '../lazy';
import '../../styles/handTech.css';

export const handArtMod = lazy(() => import('./handTechniqueArt'));

export function lazyPrinciple(id: HandPrincipleId, variant: HandVariant, opts: { bare?: boolean; className?: string } = {}): HTMLElement {
  const slot = document.createElement('span');
  const ready = handArtMod.loaded;
  if (ready) {
    slot.className = 'hp-box';
    slot.append(ready.principleSvg(id, variant, opts));
    return slot;
  }
  slot.className = `hp-box hp-slot${id === 'sit' ? ' sit' : ''}`;
  handArtMod.load().then(
    (m) => {
      slot.classList.remove('hp-slot', 'sit');
      slot.append(m.principleSvg(id, variant, opts));
    },
    () => undefined,
  );
  return slot;
}

/** Hình thu nhỏ (không chữ trong tranh) bọc trong span.hp-thumb. */
export function principleThumb(id: HandPrincipleId, variant: HandVariant = 'good'): HTMLElement {
  const box = document.createElement('span');
  box.className = 'hp-thumb';
  box.append(lazyPrinciple(id, variant, { bare: true }));
  return box;
}
