/**
 * Đầu trang màn bài hát: tên bài · tay tập · cách chơi · chọn câu · bảng "⚙️ Tuỳ chọn" (gợi ý, kiểu con trỏ, tốc độ).
 * Không giữ trạng thái chơi — song.ts truyền ảnh chụp lựa chọn hiện tại vào `render()`, chạm chip → `pick()`.
 */
import { phraseRanges, type Tune } from '../../music/tune';
import { h } from '../components/dom';
import { TEMPOS, expressionLegend, type HandSel, type SongOptions } from './songShared';

/** Các lựa chọn bé/bố mẹ đổi được trên đầu trang. */
export interface SongChoices {
  handSel: HandSel;
  mode: SongOptions['mode'];
  phrase: [number, number] | null;
  hints: SongOptions['hints'];
  level: 2 | 3;
  bpm: number;
}

export interface SongHeadDeps {
  full: Tune;
  opts: SongOptions;
  /** Chip chỉ có tác dụng khi không đang chơi (idle / màn kết quả) */
  canEdit(): boolean;
  /** Áp dụng lựa chọn mới (rồi song.ts dựng lại màn) */
  pick(patch: Partial<SongChoices>): void;
}

export class SongHead {
  readonly el = h('div', { class: 'song-head' });
  /** Bảng "⚙️ Tuỳ chọn" đang mở hay không; giữ nguyên khi vẽ lại đầu trang. */
  private optsOpen = false;

  constructor(private readonly d: SongHeadDeps) {}

  /** Chạm ra ngoài bảng tuỳ chọn (trong `screenEl`) → đóng bảng. */
  closeOnOutsideTap(screenEl: HTMLElement): void {
    screenEl.addEventListener('pointerdown', (e) => {
      if (!this.optsOpen) return;
      const t = e.target as Element | null;
      if (t?.closest('.opts-pop') || t?.closest('.opts-toggle')) return;
      this.optsOpen = false;
      this.el.querySelector('.opts-pop')?.setAttribute('hidden', '');
      this.el.querySelector('.opts-toggle')?.classList.remove('on');
    });
  }

  private chip(label: string, on: boolean, patch: Partial<SongChoices>): HTMLButtonElement {
    const b = h('button', { class: `seg-btn small${on ? ' on' : ''}`, type: 'button' }, label);
    b.addEventListener('click', () => (this.d.canEdit() ? this.d.pick(patch) : undefined));
    return b;
  }

  render(c: SongChoices): void {
    const { full, opts } = this.d;
    const chip = this.chip.bind(this);
    const twoHand = !!full.lh;
    // Hàng chính (luôn thấy): tên bài · cách chơi (Từng nốt / Theo nhịp) · câu · nút ⚙️ Tuỳ chọn
    const row = h(
      'div',
      { class: 'song-head-row' },
      h(
        'div',
        { class: 'song-title' },
        h('b', {}, full.titleVi),
        // Tên gốc/nhạc sĩ chỉ dành cho bố mẹ (thư viện) — màn của bé gọn chữ
        full.lh && opts.stage ? h('span', { class: 'hand-tag' }, '🙌 hai tay') : null,
        opts.review ? h('span', { class: 'hand-tag review-tag' }, '🔁 ôn bài cũ') : null,
      ),
    );
    // Playtest 2026-10: trong BUỔI HỌC, tay tập & câu do bài học chọn sẵn (opts.hand / opts.phrase) → chip nằm trong ⚙️
    // cho gọn màn của bé; chỉ ở Thư viện (free) chip mới nằm ngay trên hàng chính.
    const inRow = !!opts.free;
    const handChips = () => [
      chip('🫱 Tay phải', c.handSel === 'RH', { handSel: 'RH' }),
      chip('🫲 Tay trái', c.handSel === 'LH', { handSel: 'LH' }),
      chip('🙌 Hai tay', c.handSel === 'BOTH', { handSel: 'BOTH' }),
    ];
    if (twoHand && !opts.stage && inRow) {
      // v5: tập TÁCH TAY trước rồi mới ghép hai tay (lượt tách tay không tính tiêu chí tuần / "đã thuộc")
      row.append(h('div', { class: 'seg-group hand-sel', role: 'group', 'aria-label': 'Tay tập' }, ...handChips()));
    } else if (twoHand && !opts.stage && c.handSel !== 'BOTH') {
      // Bài học chỉ định tập một tay: nhãn nhỏ (không bấm) để bé biết đang tập tay nào
      row.append(h('span', { class: 'hand-tag hand-now' }, c.handSel === 'RH' ? '🫱 tay phải' : '🫲 tay trái'));
    }
    if (opts.free) {
      row.append(
        h(
          'div',
          { class: 'seg-group', role: 'group', 'aria-label': 'Cách chơi' },
          chip('🐢 Từng nốt', c.mode === 'wait', { mode: 'wait' }),
          chip('🎵 Theo nhịp', c.mode === 'tempo', { mode: 'tempo' }),
        ),
      );
    }
    const ranges = phraseRanges(full);
    const phraseChips = () => [
      chip('Cả bài', !c.phrase, { phrase: null }),
      ...ranges.map(([a, b], i) => chip(`Câu ${i + 1}`, !!c.phrase && c.phrase[0] === a, { phrase: [a, b] })),
    ];
    const phraseOk = ranges.length > 1 && !opts.stage && !opts.review;
    if (phraseOk && inRow) {
      row.append(h('div', { class: 'seg-group', role: 'group', 'aria-label': 'Chọn câu' }, ...phraseChips()));
    } else if (phraseOk && c.phrase) {
      const i = ranges.findIndex(([a]) => a === c.phrase![0]);
      if (i >= 0) row.append(h('span', { class: 'hand-tag hand-now' }, `Câu ${i + 1}`));
    }

    // Tuỳ chọn phụ (ít dùng) gom vào bảng bật/tắt
    const sections: HTMLElement[] = [];
    const section = (label: string, ...chips: HTMLElement[]) =>
      sections.push(h('div', { class: 'opts-sec' }, h('div', { class: 'opts-label' }, label), h('div', { class: 'seg-group' }, ...chips)));
    if (twoHand && !opts.stage && !inRow) section('✋ Tay tập', ...handChips());
    if (phraseOk && !inRow) section('🧩 Câu', ...phraseChips());
    if (opts.free) {
      section(
        '💡 Gợi ý',
        chip('Đầy đủ', c.hints === 'full', { hints: 'full' }),
        chip('Tên nốt', c.hints === 'names', { hints: 'names' }),
        chip('Chỉ khuông', c.hints === 'staff', { hints: 'staff' }),
      );
    }
    if (c.mode === 'tempo' && !opts.stage) {
      if (opts.free) {
        section('👀 Cách nhìn', chip('Con trỏ', c.level === 2, { level: 2 }), chip('Băng chuyền', c.level === 3, { level: 3 }));
      }
      section(
        '⏱ Tốc độ',
        ...TEMPOS.map((t) => chip(`${t === TEMPOS[0] ? '🐢 ' : t === TEMPOS[TEMPOS.length - 1] ? '🐇 ' : ''}${t}`, c.bpm === t, { bpm: t })),
      );
    }
    let pop: HTMLElement | null = null;
    if (sections.length) {
      const toggle = h(
        'button',
        { class: `seg-btn small opts-toggle${this.optsOpen ? ' on' : ''}`, type: 'button', 'aria-haspopup': 'true' },
        '⚙️ Tùy chọn',
      );
      const p = h('div', { class: 'opts-pop', role: 'dialog', 'aria-label': 'Tùy chọn' }, ...sections);
      pop = p;
      if (!this.optsOpen) p.setAttribute('hidden', '');
      toggle.addEventListener('click', () => {
        this.optsOpen = !this.optsOpen;
        toggle.classList.toggle('on', this.optsOpen);
        p.toggleAttribute('hidden', !this.optsOpen);
      });
      row.append(h('div', { class: 'song-head-spacer' }), toggle);
    }
    // Chú giải sắc thái nằm cùng hàng (trước nút ⚙️) — khi xuống dòng thì đi cùng nút, không tốn thêm hàng
    const legend = expressionLegend(full);
    if (legend) row.insertBefore(legend, row.querySelector('.song-head-spacer'));
    this.el.replaceChildren(row, ...(pop ? [pop] : []));
  }
}
