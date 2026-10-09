import { concertSongs, makeConcert, AUDIENCE_CHIPS, splitAudience } from '../../lessons/concert';
import { levelOf, songMastered, songStats } from '../../lessons/lessonEngine';
import type { Tune } from '../../music/tune';
import type { App } from '../App';
import { stickerArt } from '../components/art/stickerArt';
import { confetti } from '../components/celebrate';
import { backButton, button, h } from '../components/dom';
import { shortTitle, songEmoji } from '../components/songArt';
import { cancelSpeech, speak } from '../../audio/voice';
import { stageSongScreen } from './stage';
import '../../styles/kidux.css';
import '../../styles/concert.css';

/** Số bài gợi ý (thẻ to) — bài khác sau nút "Bài khác" (như sân khấu cuối cấp) */
const SUGGEST = 6;
type ReactionKey = 'clap' | 'heart' | 'star';
const REACTIONS: ReadonlyArray<{ key: ReactionKey; emoji: string; label: string }> = [
  { key: 'clap', emoji: '👏', label: 'Vỗ tay' },
  { key: 'heart', emoji: '❤️', label: 'Thả tim' },
  { key: 'star', emoji: '🌟', label: 'Ngôi sao' },
];

export interface ConcertHooks {
  /** Tuần giáo trình buổi diễn này mừng (concertOfferWeek) */
  week: number;
  /** Xong (đã lưu hoặc bỏ giữa chừng) */
  onDone(): void;
}

/**
 * (+ 2026-10-08) "🎤 BIỂU DIỄN CHO CẢ NHÀ" — buổi diễn nhỏ hằng tuần (mời ở màn kết buổi, không bắt buộc):
 * chọn MỘT bài → mời khán giả → đàn trên sân khấu (stageSongScreen: đếm vào, theo nhịp, cả bài một lần)
 * → khán giả chạm 👏 ❤️ 🌟 + ghi ai nghe → lưu nhật ký (AppData.concerts) + sticker "Buổi diễn tuần N".
 * Bản thu của lượt diễn tự vào "🎧 Album của con" nếu hay hơn bản đang có (songTake — như mọi lượt cả bài).
 */
export function concertScreen(app: App, hooks: ConcertHooks) {
  return (root: HTMLElement) => {
    const data = app.store.get();
    const level = levelOf(data.progress.currentWeek).level;
    const choices = concertSongs(data, hooks.week);
    const suggested = choices.slice(0, SUGGEST);
    let showAll = false;
    let song: Tune | null = null;
    let passed: boolean | undefined;
    let cleanup: (() => void) | null = null;
    const timers: number[] = [];
    const stopChild = () => {
      cleanup?.();
      cleanup = null;
    };

    const pick = () => {
      stopChild();
      const list = showAll ? choices : suggested;
      root.replaceChildren(
        h(
          'div',
          { class: 'screen concert' },
          h(
            'div',
            { class: 'stage scroll-y scrollable' },
            h('div', { class: 'step-tag' }, '🎤 Biểu diễn cho cả nhà'),
            h('h1', { class: 'title' }, 'Con chọn MỘT bài để biểu diễn nhé!'),
            h(
              'div',
              { class: 'stage-picks' },
              ...list.map((s) =>
                h(
                  'button',
                  { class: 'stage-pick', type: 'button', onClick: () => ((song = s), invite()) },
                  h('span', { class: 'stage-pick-emoji', 'aria-hidden': 'true' }, songEmoji(s)),
                  h('span', { class: 'stage-pick-title' }, shortTitle(s)),
                  songMastered(data, s.id) ? h('span', { class: 'stage-pick-star' }, '⭐ đã thuộc') : null,
                ),
              ),
            ),
            !showAll && choices.length > suggested.length
              ? h(
                  'button',
                  { class: 'seg-btn small stage-more', type: 'button', onClick: () => ((showAll = true), pick()) },
                  `➕ Bài khác (${choices.length - suggested.length})`,
                )
              : null,
          ),
          h('div', { class: 'actions' }, backButton(hooks.onDone)),
        ),
      );
    };

    const invite = () => {
      stopChild();
      if (!song) return pick();
      const s = song;
      root.replaceChildren(
        h(
          'div',
          { class: 'screen center concert' },
          h('div', { class: 'hero-emoji huge' }, '🎟️'),
          h('h1', { class: 'hero-title' }, 'Mời cả nhà ngồi xuống nghe con đàn nhé!'),
          h('p', { class: 'lead' }, `Tiết mục hôm nay: ${songEmoji(s)} ${s.titleVi}`),
          h('p', { class: 'lead' }, 'Nghệ sĩ cúi chào khán giả trước khi đàn 🙇'),
          h(
            'div',
            { class: 'end-actions' },
            button({ icon: '←', label: 'Chọn bài khác', onTap: pick }),
            button({ icon: '🎹', label: 'Bắt đầu biểu diễn', kind: 'primary', big: true, onTap: perform }),
          ),
        ),
      );
      void speak(app, 'Mời cả nhà ngồi xuống nghe con đàn nhé!');
    };

    const perform = () => {
      if (!song) return pick();
      cancelSpeech();
      passed = undefined; // kết quả của lượt diễn TRƯỚC (có thể là bài khác — "← Chọn bài khác") không được tính cho lượt này
      // Tốc độ: nhanh nhất bé từng đạt theo nhịp (không ép tốc độ gốc), chưa có thì chậm vừa
      const best = songStats(app.store.get())[song.id]?.b;
      const bpm = best && best >= 40 ? Math.min(best, song.bpm) : Math.min(song.bpm, 50);
      const screen = stageSongScreen(
        app,
        song,
        { level, intro: `Buổi diễn cho cả nhà: ${song.titleVi}.`, bpm },
        {
          // Lượt diễn KHÔNG ghi vào buổi học (buổi đã kết thúc; không ảnh hưởng tiêu chí) — chỉ nhớ đạt hay chưa
          onRun: (r) => {
            if (!r.phrase && !r.hand) passed = r.passed;
          },
          onDone: audience,
          onBack: invite,
        },
      );
      root.replaceChildren();
      stopChild();
      cleanup = screen(root) || null;
    };

    const audience = () => {
      stopChild();
      if (!song) return pick();
      const s = song;
      const counts: Record<ReactionKey, number> = { clap: 0, heart: 0, star: 0 };
      const chosen = new Set<string>();
      app.audio.applause(2.5);
      const fly = h('div', { class: 'concert-fly', 'aria-hidden': 'true' });
      const react = (key: ReactionKey, emoji: string, btn: HTMLElement, num: HTMLElement) => {
        counts[key]++;
        num.textContent = String(counts[key]);
        btn.classList.remove('pop');
        void btn.offsetWidth;
        btn.classList.add('pop');
        if (key === 'clap') app.audio.applause(0.7);
        else void app.audio.playPitch(key === 'heart' ? 'E5' : 'G5', 0.3);
        const p = h('span', { class: 'concert-float', style: { left: `${15 + Math.random() * 70}%` } }, emoji);
        fly.append(p);
        timers.push(window.setTimeout(() => p.remove(), 1600));
      };
      const other = h('input', {
        class: 'concert-input',
        type: 'text',
        maxlength: '80',
        placeholder: 'Ai nữa? (vd: Cô Lan, bạn Minh)',
        'aria-label': 'Tên khán giả khác',
        autocomplete: 'off',
      });
      const save = () => {
        const entry = makeConcert({
          week: hooks.week,
          songId: s.id,
          reactions: counts,
          audience: [...chosen, ...splitAudience(other.value)],
          ...(passed !== undefined ? { passed } : {}),
        });
        const saved = app.store.saveConcert(entry);
        done(saved);
      };
      root.replaceChildren(
        h(
          'div',
          { class: 'screen center concert concert-audience' },
          fly,
          h('h1', { class: 'hero-title' }, '👏 Bravo! Khán giả ơi, thả tim cho nghệ sĩ nhé!'),
          h(
            'div',
            { class: 'concert-reactions' },
            ...REACTIONS.map((r) => {
              const num = h('span', { class: 'concert-count' }, '0');
              const b: HTMLButtonElement = h(
                'button',
                { class: `concert-react react-${r.key}`, type: 'button', 'aria-label': r.label, onClick: () => react(r.key, r.emoji, b, num) },
                h('span', { class: 'concert-emoji', 'aria-hidden': 'true' }, r.emoji),
                num,
              );
              return b;
            }),
          ),
          h('p', { class: 'lead' }, '👪 Ai đã nghe con đàn hôm nay?'),
          h(
            'div',
            { class: 'concert-chips' },
            ...AUDIENCE_CHIPS.map((name) => {
              const c: HTMLButtonElement = h(
                'button',
                {
                  class: 'seg-btn small',
                  type: 'button',
                  'aria-pressed': 'false',
                  onClick: () => {
                    if (chosen.has(name)) chosen.delete(name);
                    else chosen.add(name);
                    c.classList.toggle('on', chosen.has(name));
                    c.setAttribute('aria-pressed', String(chosen.has(name)));
                  },
                },
                name,
              );
              return c;
            }),
          ),
          other,
          h('div', { class: 'end-actions' }, button({ icon: '💾', label: 'Xong buổi diễn', kind: 'primary', big: true, onTap: save })),
        ),
      );
    };

    const done = (saved: boolean) => {
      stopChild();
      const w = hooks.week;
      confetti(70);
      void app.audio.chime();
      root.replaceChildren(
        h(
          'div',
          { class: 'screen center concert' },
          saved
            ? h(
                'div',
                { class: 'concert-sticker' },
                stickerArt({ id: `concert-w${w}`, kind: 'concert', title: `Buổi diễn tuần ${w}`, hint: '', earned: true, week: w }, true),
              )
            : h('div', { class: 'hero-emoji huge' }, '🎤'),
          h('h1', { class: 'hero-title' }, saved ? `Con nhận sticker "Buổi diễn tuần ${w}"!` : 'Buổi diễn tuyệt vời!'),
          saved ? h('p', { class: 'lead' }, 'Đã dán vào sổ sticker 📒 — mục 🎤 Buổi diễn') : null,
          h('div', { class: 'end-actions' }, button({ icon: '▶', label: 'Tiếp', kind: 'primary', big: true, onTap: hooks.onDone })),
        ),
      );
      void speak(app, saved ? 'Bravo! Con nhận được sticker Buổi diễn!' : 'Bravo! Buổi diễn tuyệt vời!');
    };

    if (!choices.length) {
      timers.push(window.setTimeout(hooks.onDone, 0));
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    pick();
    return () => {
      stopChild();
      timers.forEach((t) => window.clearTimeout(t));
      cancelSpeech();
    };
  };
}
