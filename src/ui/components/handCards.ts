/**
 * (+ 2026-10-15) THẺ NGUYÊN TẮC "Đúng ✓ / Chưa đúng ✗": tên + 🔊, các tranh (nạp muộn) kèm nhãn, một câu cho bé (≤ 12 chữ),
 * tùy chọn một dòng "vì sao" cho bố mẹ. Dùng ở trang "✋ Tư thế tay", dãy thẻ tư thế và khởi động tay.
 */
import { handPrinciple, principleSpeech, type HandPrincipleId, type HandVariant } from '../../lessons/handTechnique';
import type { VoiceHost } from '../../audio/voice';
import { h } from './dom';
import { lazyPrinciple } from './handArtLazy';
import { speakChip } from './speakChip';

const VERDICT: Record<HandVariant, { cls: string; text: string }> = {
  good: { cls: 'good', text: '✓ Đúng' },
  bad: { cls: 'bad', text: '✗ Chưa đúng' },
  bad2: { cls: 'bad', text: '✗ Chưa đúng' },
};

/** Một tranh có chú thích "✓ Đúng · nhãn". */
export function principleFigure(id: HandPrincipleId, variant: HandVariant, text?: string): HTMLElement {
  const p = handPrinciple(id);
  const panel = p.panels.find((x) => x.variant === variant) ?? p.panels[0];
  return h(
    'figure',
    { class: `hp-fig ${VERDICT[variant].cls}` },
    lazyPrinciple(id, variant),
    h('figcaption', {}, h('span', { class: `hp-verdict ${VERDICT[variant].cls}` }, VERDICT[variant].text), text ?? panel.label),
  );
}

export interface CardOpts {
  /** Hiện dòng "vì sao" (cho bố mẹ) */
  why?: boolean;
  /** Bố mẹ vừa nhắc lỗi này → viền vàng + nhãn */
  flagged?: boolean;
}

export function principleCard(host: VoiceHost, id: HandPrincipleId, opts: CardOpts = {}): HTMLElement {
  const p = handPrinciple(id);
  const panels = h('div', { class: 'hp-panels' }, ...p.panels.map((x) => principleFigure(id, x.variant)));
  panels.style.setProperty('--hp-n', String(p.panels.length));
  return h(
    'article',
    { class: `hp-card${opts.flagged ? ' flagged' : ''}`, 'data-principle': id },
    opts.flagged ? h('div', { class: 'hp-flag' }, '👪 Bố mẹ vừa nhắc điều này') : null,
    h('div', { class: 'hp-head' }, h('span', { class: 'hp-emoji', 'aria-hidden': 'true' }, p.emoji), h('h2', { class: 'hp-title' }, p.title), speakChip(host, principleSpeech(p))),
    panels,
    h('p', { class: 'hp-caption' }, p.caption),
    opts.why ? h('p', { class: 'hp-why' }, `👪 ${p.why}`) : null,
  );
}
