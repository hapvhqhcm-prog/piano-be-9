/**
 * (+ 2026-10-16, OWNER duyệt) 🎧 "NGHE LẠI TIẾN BỘ CỦA CON": hai thẻ (lần đầu · hôm nay — ngày, sao, % đúng) + một nút phát
 * liền mạch: lời dẫn ngắn ("Đây là lần đầu con đàn…") → bản đầu → "còn đây là hôm nay!" → bản bây giờ. Không màn phủ,
 * không pháo giấy — chỉ nghe. Dùng ở màn kết quả (vừa thuộc bài — dạng gọn) và màn Album (mục "🌱 Con tiến bộ").
 * Bản thu nạp muộn (chỉ khi chạm phát); chạm lần nữa = dừng; rời màn → stop().
 */
import { clipFromBlob, type TakeClip } from '../../audio/recorder';
import { cancelSpeech, speak } from '../../audio/voice';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { App } from '../App';
import { button, h } from './dom';

/** Một bên so sánh: thông tin hiện trên thẻ + cách lấy bản thu (null = không mở được). */
export interface CompareSide {
  /** ms */
  at: number;
  /** 0–3 */
  stars: number;
  /** 0–1 */
  accuracy: number;
  load(): Promise<TakeClip | null>;
}

export interface CompareOpts {
  first: CompareSide & {
    /** false = bản cũ nhất còn giữ (Album từ trước bản cập nhật — không chắc là lần đầu) */
    trueFirst: boolean;
  };
  now: CompareSide;
  /** Màn kết quả: một hàng gọn */
  compact?: boolean;
  /** Vừa bắt đầu phát (màn Album: dừng các bản đang phát khác) */
  onStart?: () => void;
}

/** "16/10" (thêm năm nếu khác năm nay) */
export function shortDay(ms: number, today = new Date()): string {
  const d = new Date(ms);
  const base = `${d.getDate()}/${d.getMonth() + 1}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base}/${d.getFullYear()}`;
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Nhãn + lời dẫn của hai bên (thuần — có test). */
export function compareWords(o: { trueFirst: boolean; nowAt: number; today?: number }): {
  firstLabel: string;
  nowLabel: string;
  sayFirst: string;
  sayNow: string;
  sayEnd: string;
} {
  const today = sameDay(o.nowAt, o.today ?? Date.now());
  return {
    firstLabel: o.trueFirst ? 'Lần đầu' : 'Ngày xưa',
    nowLabel: today ? 'Hôm nay' : 'Bản hay nhất',
    sayFirst: o.trueFirst ? 'Đây là lần đầu con đàn bài này…' : 'Đây là bản thu cũ nhất của con…',
    sayNow: today ? 'Còn đây là hôm nay!' : 'Còn đây là bản hay nhất của con!',
    sayEnd: 'Con tiến bộ nhiều lắm!',
  };
}

/** Nạp bản thu đã lưu thành clip phát lại (chuẩn hóa âm lượng như "Nghe lại"). */
export function clipLoader(engine: AudioEngine | null, read: () => Promise<{ data: ArrayBuffer; mime: string; seconds: number } | null>) {
  return async (): Promise<TakeClip | null> => {
    const t = await read();
    return t ? clipFromBlob(new Blob([t.data], { type: t.mime }), t.seconds, engine) : null;
  };
}

export function progressCompare(app: App, o: CompareOpts): { el: HTMLElement; stop(): void } {
  const w = compareWords({ trueFirst: o.first.trueFirst, nowAt: o.now.at });
  const card = (side: CompareSide, icon: string, label: string, cls: string) =>
    h(
      'div',
      { class: `pc-card ${cls}` },
      h('span', { class: 'pc-icon', 'aria-hidden': 'true' }, icon),
      h(
        'span',
        { class: 'pc-info' },
        h('b', { class: 'pc-label' }, label),
        h('span', { class: 'pc-date' }, ` 📅 ${shortDay(side.at)}`),
        h(
          'span',
          { class: 'pc-score' },
          h('span', { class: 'album-stars', 'aria-label': `${side.stars} trên 3 sao` }, '★'.repeat(side.stars), h('span', { class: 'stars-off' }, '★'.repeat(3 - side.stars))),
          ` ${Math.round(side.accuracy * 100)}%`,
        ),
      ),
    );
  const firstCard = card(o.first, '🌱', w.firstLabel, 'pc-first');
  const nowCard = card(o.now, '🌟', w.nowLabel, 'pc-now');
  const say = h('div', { class: 'pc-say', 'aria-live': 'polite' });
  let token = 0;
  let clips: TakeClip[] = [];
  let playing = false;

  const setLook = (on: boolean) => {
    playing = on;
    btn.querySelector('.btn-icon')!.textContent = on ? '⏹' : '🎧';
    btn.querySelector('.btn-label')!.textContent = on ? 'Dừng' : `Nghe ${w.firstLabel.toLowerCase()} → ${w.nowLabel.toLowerCase()}`;
  };
  const mark = (which: 'first' | 'now' | null) => {
    firstCard.classList.toggle('on', which === 'first');
    nowCard.classList.toggle('on', which === 'now');
  };
  const stop = () => {
    token++;
    cancelSpeech();
    for (const c of clips) {
      c.stopPlayback();
      c.dispose();
    }
    clips = [];
    mark(null);
    say.textContent = '';
    setLook(false);
  };
  const run = async () => {
    const my = ++token;
    o.onStart?.();
    setLook(true);
    const alive = () => my === token;
    const [a, b] = await Promise.all([o.first.load().catch(() => null), o.now.load().catch(() => null)]);
    clips = [a, b].filter((c): c is TakeClip => !!c);
    if (!alive()) return void clips.forEach((c) => c.dispose());
    if (!a || !b) {
      say.textContent = 'Chưa mở được bản thu — thử lại nhé';
      return setLook(false);
    }
    const step = async (which: 'first' | 'now', line: string, clip: TakeClip) => {
      mark(which);
      say.textContent = line;
      await speak(app, line);
      if (alive()) await clip.play().catch(() => undefined);
    };
    await step('first', w.sayFirst, a);
    if (!alive()) return;
    await step('now', w.sayNow, b);
    if (!alive()) return;
    mark(null);
    say.textContent = `${w.sayEnd} 💛`;
    void speak(app, w.sayEnd);
    for (const c of clips) c.dispose();
    clips = [];
    setLook(false);
  };
  const btn = button({ icon: '🎧', label: '', kind: 'sun', onTap: () => (playing ? stop() : void run()) });
  btn.classList.add('pc-play');
  setLook(false);
  const el = h(
    'div',
    { class: `pc${o.compact ? ' pc-compact' : ''}` },
    h('div', { class: 'pc-cards' }, firstCard, h('span', { class: 'pc-arrow', 'aria-hidden': 'true' }, '→'), nowCard),
    h('div', { class: 'pc-row' }, btn, say),
  );
  return { el, stop };
}
