/**
 * (+ 2026-10-17, OWNER duyệt) ✨ ĐÁNH BÓNG bài cũ & 🎤 BUỔI DIỄN NHỎ (hoạt động `musician`).
 *  · Đánh bóng: thang tốc độ (task.ladder — vd 50 → 60 → 72) bằng màn bài hát THEO NHỊP (lượt ghi như bài hát thường:
 *    micro / phiếu bố mẹ); đạt → lên nấc, chưa đạt → thử lại (tối đa POLISH_TRIES lượt mỗi nấc — chưa được thì "mai leo tiếp").
 *    Bài có sắc thái → bố mẹ nghe "to – nhỏ rõ chưa?" (micro chưa chấm sắc thái trong bài). Ghi `polish:<bài>:<nấc cao nhất>`.
 *  · Buổi diễn nhỏ: bé chọn 1–2 bài đã đàn được → mời khán giả → diễn (màn sân khấu stage.ts, KHÔNG huy chương) → lưu nhật ký
 *    buổi diễn (AppData.concerts — mỗi tuần một buổi) → sticker "🎤 Buổi diễn tuần N".
 */
import { concertSongs, makeConcert } from '../../lessons/concert';
import { levelOf } from '../../lessons/curriculum';
import { hasDynamics, polishStep, type MusicianActivity } from '../../lessons/musician';
import type { MusicianTask } from '../../lessons/types';
import { findTune } from '../../music/exercises';
import { songsUpToWeek, type Tune } from '../../music/tune';
import type { SongRun } from '../../progress/schema';
import type { App, Screen } from '../App';
import { confetti } from '../components/celebrate';
import { backButton, button, h } from '../components/dom';
import { mascot } from '../components/mascot';
import { shortTitle, songEmoji } from '../components/songArt';
import { selfStudy } from '../selfStudy';
import type { MusicianHooks } from './musician';
import { songScreen } from './song';
import { stageSongScreen } from './stage';
import '../../styles/musician.css';
import '../../styles/kidux.css';

export function polishScreen(app: App, a: MusicianActivity, task: Extract<MusicianTask, { type: 'polish' }>, hooks: MusicianHooks): Screen {
  return (root) => {
    const tune = findTune(task.songId);
    const ladder = task.ladder.length ? task.ladder : [60];
    if (!tune) {
      window.setTimeout(hooks.onDone, 0);
      return;
    }
    let cleanup: (() => void) | null = null;
    let rung = 0;
    let tries = 0;
    let lastPassed = false;
    /** Nấc cao nhất đã đạt (−1 = chưa) */
    let top = -1;
    const mount = (screen: Screen) => {
      cleanup?.();
      root.replaceChildren();
      cleanup = screen(root) || null;
    };
    const page = (...children: Array<HTMLElement | null>) => (actions: HTMLElement[]) =>
      mount((r) => {
        r.append(h('div', { class: 'screen center' }, h('div', { class: 'stage mu-stage' }, ...children), h('div', { class: 'end-actions' }, ...actions)));
      });

    const intro = () =>
      page(
        h('div', { class: 'step-tag' }, 'Đánh bóng'),
        h('div', { class: 'hero-emoji' }, '✨'),
        h('h1', { class: 'title' }, a.title),
        h(
          'ul',
          { class: 'mu-steps' },
          h('li', {}, `🪜 Leo thang tốc độ: ${ladder.join(' → ')}`),
          hasDynamics(tune) ? h('li', {}, '🎚️ To – nhỏ thật rõ') : null,
          h('li', {}, '🎙️ Rồi thu một bản biểu diễn'),
        ),
      )([backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', big: true, onTap: () => run() })]);

    const run = () => {
      const bpm = ladder[rung];
      tries++;
      lastPassed = false;
      mount(
        songScreen(
          app,
          tune,
          {
            mode: 'tempo',
            level: 2,
            hints: 'names',
            bpm,
            intro: `🪜 Nấc ${rung + 1}/${ladder.length}: tốc độ ${bpm}${tries > 1 ? ' — thử lại nhé!' : ''}`,
          },
          {
            onRun: (r: Omit<SongRun, 'ts'>) => {
              hooks.onRun(r);
              if (!r.phrase && !r.hand) lastPassed = r.passed;
            },
            onDone: next,
            onBack: intro,
          },
        ),
      );
    };

    const next = () => {
      if (lastPassed) top = Math.max(top, rung);
      const st = polishStep(ladder, rung, tries, lastPassed);
      if (st.next === 'up') {
        rung = st.rung;
        tries = 0;
        return climbed();
      }
      if (st.next === 'again') return run();
      return ladderDone();
    };

    const climbed = () =>
      page(h('div', { class: 'hero-emoji' }, '🪜'), h('h1', { class: 'title' }, `Lên nấc ${rung + 1}! Tốc độ ${ladder[rung]}`), h('p', { class: 'lead' }, 'Nhanh hơn một chút — vẫn đều nhé!'))([
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', big: true, onTap: run }),
      ]);

    const ladderDone = () => {
      hooks.record(`polish:${task.songId}:${top >= 0 ? ladder[top] : 0}`, top >= 0 ? 'correct' : 'retry');
      if (top >= 0) confetti(20);
      const text =
        top === ladder.length - 1
          ? `Lên tới đỉnh thang — tốc độ ${ladder[top]}! 🏔️`
          : top >= 0
            ? `Con đạt tốc độ ${ladder[top]} — mai leo tiếp nhé!`
            : 'Bài này cần đánh bóng thêm — mai mình thử lại nhé!';
      const after = hasDynamics(tune) ? dynamics : hooks.onDone;
      page(h('div', { class: 'hero-mascot' }, mascot(top >= 0 ? 'cheer' : 'encourage', 96)), h('h1', { class: 'title' }, text))([
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', big: true, onTap: after }),
      ]);
    };

    const dynamics = () => {
      const by = selfStudy(app) ? 'Con' : '👪 Bố mẹ';
      const answer = (ok: boolean) => {
        hooks.record(`polish:dyn:${task.songId}`, ok ? 'correct' : 'retry');
        hooks.onDone();
      };
      page(
        h('div', { class: 'hero-emoji' }, '🎚️'),
        h('h1', { class: 'title' }, `${by}: lượt vừa rồi, to – nhỏ nghe rõ chưa?`),
        h('p', { class: 'lead' }, 'Chỗ p đàn NHỎ, chỗ f đàn TO — như kể chuyện.'),
      )([
        button({ icon: '↻', label: 'Chưa rõ lắm', kind: 'retry', onTap: () => answer(false) }),
        button({ icon: selfStudy(app) ? '✋' : '👪', label: 'Rõ rồi!', kind: 'good', onTap: () => answer(true) }),
      ]);
    };

    intro();
    return () => cleanup?.();
  };
}

/** Số bài tối đa của buổi diễn nhỏ (ngắn — không phải buổi hòa nhạc cuối cấp) */
const RECITAL_MAX = 2;
const SUGGEST = 6;

export function recitalScreen(app: App, a: MusicianActivity, hooks: MusicianHooks): Screen {
  return (root) => {
    const data = app.store.get();
    const week = hooks.week;
    const level = levelOf(week).level;
    let choices: Tune[] = concertSongs(data, week);
    // Chưa có bài nào chơi đạt (dữ liệu mới / bố mẹ cho qua tuần): gợi ý bài mới nhất đã mở
    if (!choices.length) choices = [...songsUpToWeek(week)].sort((x, y) => (y.week ?? 0) - (x.week ?? 0));
    choices = choices.slice(0, SUGGEST);
    const picked: Tune[] = [];
    const program = a.task.type === 'recital' ? (a.task.program ?? []) : [];
    let cleanup: (() => void) | null = null;
    const show = (screen: Screen) => {
      cleanup?.();
      root.replaceChildren();
      cleanup = screen(root) || null;
    };
    const plain = (...children: Array<HTMLElement | null>) => (actions: HTMLElement[]) =>
      show((r) => {
        r.append(h('div', { class: 'screen center' }, h('div', { class: 'stage mu-stage scroll-y scrollable' }, ...children), h('div', { class: 'end-actions' }, ...actions)));
      });

    const pick = () =>
      plain(
        h('div', { class: 'step-tag' }, 'Buổi diễn nhỏ'),
        h('h1', { class: 'title' }, picked.length ? `Đã chọn ${picked.length}/${RECITAL_MAX} bài` : a.title),
        h('p', { class: 'lead' }, 'Con chọn 1 hoặc 2 bài con đàn hay nhất!'),
        h(
          'div',
          { class: 'stage-picks' },
          ...choices.map((s) => {
            const i = picked.indexOf(s);
            return h(
              'button',
              {
                class: `stage-pick${i >= 0 ? ' on' : ''}`,
                type: 'button',
                'aria-pressed': String(i >= 0),
                onClick: () => {
                  if (i >= 0) picked.splice(i, 1);
                  else if (picked.length < RECITAL_MAX) picked.push(s);
                  pick();
                },
              },
              i >= 0 ? h('span', { class: 'stage-pick-n' }, String(i + 1)) : null,
              h('span', { class: 'stage-pick-emoji', 'aria-hidden': 'true' }, songEmoji(s)),
              h('span', { class: 'stage-pick-title' }, shortTitle(s)),
            );
          }),
        ),
      )([
        backButton(hooks.onBack),
        button({ icon: '🎟️', label: 'Mời khán giả', kind: 'primary', disabled: !picked.length, onTap: invite }),
      ]);

    const invite = () =>
      plain(
        h('div', { class: 'hero-emoji huge' }, '🎟️'),
        h('h1', { class: 'hero-title' }, 'Mời cả nhà ngồi nghe nhé!'),
        h('p', { class: 'lead' }, 'Chương trình: ' + picked.map((s, i) => `${i + 1}. ${s.titleVi}`).join(' · ')),
        h('p', { class: 'lead' }, 'Nghệ sĩ cúi chào trước khi đàn 🙇'),
      )([button({ icon: '←', label: 'Chọn lại', onTap: pick }), button({ icon: '🎹', label: 'Bắt đầu biểu diễn', kind: 'primary', big: true, onTap: () => perform(0) })]);

    let passedAny = false;
    const perform = (k: number) => {
      if (k >= picked.length) return bravo();
      show(
        stageSongScreen(
          app,
          picked[k],
          { level, intro: `🎤 Bài ${k + 1}/${picked.length}: ${picked[k].titleVi}.` },
          {
            onRun: (r) => {
              hooks.onRun(r);
              passedAny ||= r.passed;
            },
            onDone: () => perform(k + 1),
            onBack: invite,
          },
        ),
      );
    };

    const bravo = () => {
      app.audio.applause(3);
      const songId = picked[0]?.id ?? program[0];
      const saved = !!songId && app.store.saveConcert(
        makeConcert({ week, songId, reactions: { clap: 1, heart: 0, star: 0 }, audience: [], passed: passedAny }),
      );
      confetti(40);
      plain(
        h('div', { class: 'hero-emoji huge' }, '👏'),
        h('h1', { class: 'hero-title' }, 'Bravo! Buổi diễn nhỏ thật tuyệt!'),
        h('p', { class: 'lead' }, saved ? `🎤 Sticker "Buổi diễn tuần ${week}" đã vào sổ của con!` : '🎤 Tuần này con đã có sticker Buổi diễn rồi — vẫn tuyệt vời!'),
      )([button({ icon: '▶', label: 'Tiếp', kind: 'primary', big: true, onTap: hooks.onDone })]);
    };

    // Tuần ôn: chương trình cố định — các bài đã diễn là các hoạt động bài hát đứng trước (lessons/musician.ts recitalLesson)
    if (program.length) {
      passedAny = true;
      bravo();
    } else pick();
    return () => cleanup?.();
  };
}
