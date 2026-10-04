import type { Hand } from '../../piano/fingering';
import { handArt } from './handArt';

export const FINGER_NAMES: Record<number, string> = {
  1: 'ngón cái',
  2: 'ngón trỏ',
  3: 'ngón giữa',
  4: 'ngón áp út',
  5: 'ngón út',
};

export interface HandDiagram {
  el: SVGSVGElement;
  set(finger: number | undefined): void;
}

/** Hình bàn tay sáng đúng ngón (dùng hình vẽ mới `handArt`), ngón sáng có nhịp "nhấn" nhẹ. */
export function handDiagram(hand: Hand = 'RH'): HandDiagram {
  const art = handArt(hand, { className: 'hand' });
  return {
    el: art.el,
    set(finger) {
      art.setActive(finger ?? null);
      if (finger) art.press(finger, 420);
    },
  };
}
