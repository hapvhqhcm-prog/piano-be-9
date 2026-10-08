/**
 * (+ 2026-10-08) "Micro nói thật" — phần giao diện + theo dõi micro (logic thuần: src/audio/micHonesty.ts).
 * Dùng ở practice.ts, song.ts (chế độ chờ) và sing.ts. CHỈ ĐỌC micro (onFrame + stats.nearMisses).
 */
import type { MicFrame, MicStats } from '../../audio/MicListener';
import { micHonestyInit, micHonestyStep, type MicHonestyEvent } from '../../audio/micHonesty';
import { speechBusy } from '../../audio/voice';
import { button, h } from './dom';
import '../../styles/album.css';

/** Phần micro cần (MicListener đáp ứng). */
export interface HonestyMic {
  readonly stats: MicStats;
  onFrame(fn: (f: MicFrame) => void): () => void;
}

export const MIC_HONEST_TEXT = 'Micro nghe chưa rõ — không phải lỗi của con 👂';

/**
 * Theo dõi micro trong lúc màn đang CHỜ bé (active()). Bé đàn (tiếng gõ phím / "suýt nghe") mà không ra nốt nào,
 * liên tiếp 3 lần → onTrigger(). Màn gọi heard() mỗi khi micro nhận ra nốt (đúng hay sai), step() khi sang bước mới,
 * timeout() khi một lần chờ hết giờ.
 */
export class MicHonestyWatch {
  private s = micHonestyInit();
  private lastNear = -1;
  private un: () => void;

  constructor(
    private readonly mic: HonestyMic,
    private readonly o: {
      active: () => boolean;
      onTrigger: () => void;
      /** Khung này có phải "bé đang đàn / hát mà chưa ra nốt" không (mặc định: tiếng gõ phím hoặc "suýt nghe") */
      activity?: (f: MicFrame, nearMiss: boolean) => boolean;
      now?: () => number;
    },
  ) {
    this.un = mic.onFrame((f) => this.frame(f));
  }

  private now(): number {
    return (this.o.now ?? Date.now)();
  }

  private send(e: MicHonestyEvent): void {
    const r = micHonestyStep(this.s, e);
    this.s = r.state;
    if (r.show) {
      try {
        this.o.onTrigger();
      } catch {
        /* bỏ qua */
      }
    }
  }

  private frame(f: MicFrame): void {
    let near = false;
    try {
      const n = this.mic.stats.nearMisses;
      near = this.lastNear >= 0 && n > this.lastNear;
      this.lastNear = n;
    } catch {
      /* bỏ qua */
    }
    if (!this.o.active()) return;
    const t = this.now();
    // Tiếng của app (âm mẫu, chuông, tích) và giọng đọc không phải tiếng bé
    const quiet = f.app === 'quiet' && !speechBusy();
    const act = quiet && (this.o.activity ? this.o.activity(f, near) : f.onset || near);
    this.send(act ? { type: 'activity', at: t } : { type: 'tick', at: t });
  }

  heard(): void {
    this.send({ type: 'heard' });
  }
  step(): void {
    this.send({ type: 'step' });
  }
  timeout(): void {
    if (this.o.active()) this.send({ type: 'timeout' });
  }
  dispose(): void {
    this.un();
  }
}

/** Hộp thông báo nhẹ cho bé + lối ra cho bố mẹ (chấm giúp; gợi ý "Cài micro"). */
export function micHonestyBox(onParent: () => void): HTMLElement {
  return h(
    'div',
    { class: 'mic-honest', role: 'status' },
    h('div', { class: 'mic-honest-text' }, MIC_HONEST_TEXT),
    h(
      'div',
      { class: 'mic-honest-row' },
      button({ icon: '👪', label: 'Bố mẹ chấm giúp', kind: 'good', onTap: onParent }),
      h('span', { class: 'mic-honest-hint' }, 'Bố mẹ: màn Phụ huynh → 🎤 Cài micro để micro nghe rõ hơn'),
    ),
  );
}
