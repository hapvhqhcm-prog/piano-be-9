import type { Pitch } from '../piano/pitchTable';

/**
 * Trò chơi tai nghe — APP_ASSESSMENT (§2): app phát một nốt, bé chạm phím ảo.
 * App biết chính xác phím nào → chấm tự động. Chỉ lần chạm ĐẦU TIÊN mỗi lượt được tính.
 */
export interface EarAnswer {
  expected: Pitch;
  actual: Pitch;
  correct: boolean;
}

export class EarGame {
  private round = 0;
  private current: Pitch | null = null;
  private answered = false;
  readonly results: EarAnswer[] = [];

  constructor(
    readonly pool: readonly Pitch[],
    readonly rounds = 10,
    private readonly rng: () => number = Math.random,
  ) {
    if (pool.length === 0) throw new Error('pool rỗng');
  }

  get roundNumber(): number {
    return this.round;
  }

  get expected(): Pitch | null {
    return this.current;
  }

  get isAnswered(): boolean {
    return this.answered;
  }

  get done(): boolean {
    return this.round >= this.rounds && this.answered;
  }

  get score(): number {
    return this.results.filter((r) => r.correct).length;
  }

  /** Sang lượt mới; trả về nốt cần phát, hoặc null nếu đã hết lượt. */
  next(): Pitch | null {
    if (this.round >= this.rounds) return null;
    if (this.current !== null && !this.answered) return this.current;
    const prev = this.current;
    let pick = this.pool[Math.floor(this.rng() * this.pool.length)];
    // Không lặp lại nốt vừa rồi (cho đa dạng) nếu pool có ≥2 nốt.
    for (let i = 0; i < 8 && this.pool.length > 1 && pick === prev; i++) {
      pick = this.pool[Math.floor(this.rng() * this.pool.length)];
    }
    if (this.pool.length > 1 && pick === prev) {
      pick = this.pool[(this.pool.indexOf(prev as Pitch) + 1) % this.pool.length];
    }
    this.current = pick;
    this.answered = false;
    this.round++;
    return pick;
  }

  /** Ghi câu trả lời; null nếu lượt này đã trả lời rồi (không tính lần sau). */
  answer(actual: Pitch): EarAnswer | null {
    if (this.current === null || this.answered) return null;
    this.answered = true;
    const r = { expected: this.current, actual, correct: actual === this.current };
    this.results.push(r);
    return r;
  }
}
