import { shortSessionSongs } from '../../lessons/shortSession';
import type { App } from '../App';
import { toast } from '../components/dom';
import { homeScreen } from './home';
import { songScreen } from './song';

/**
 * ⏱ BUỔI NGẮN 5 PHÚT (màn chính, khi bé quay lại sau ≥ 3 ngày nghỉ): bài con thích → bài ôn, rồi về màn chính.
 * Kế hoạch: lessons/shortSession.ts (hàm thuần). Dùng ĐÚNG màn bài hát + cách lưu của Thư viện (buổi "-song-":
 * lượt chơi tính cho bài đã thuộc / tiêu chí như chơi ở Thư viện; không tạo trứng bất ngờ). Không đụng buildSessionPlan.
 */
export function startShortSession(app: App): void {
  const store = app.store;
  const songs = shortSessionSongs(store.get());
  if (!songs.length) {
    toast('Con chưa có bài nào — bấm "Học tiếp" nhé!');
    return;
  }
  const week = store.get().progress.currentWeek;
  const session = store.startSession(`w${week}-song-${songs[0].id}`);
  let i = 0;
  let ended = false;
  const finish = (all: boolean) => {
    if (ended) return;
    ended = true;
    app.mic.stop();
    const cur = store.get().sessions.find((x) => x.id === session.id);
    if (cur && cur.songRuns.length) store.finishSession(session.id);
    else store.discardSessionIfEmpty(session.id);
    app.show(homeScreen(app, all ? '🎉 Xong buổi ngắn rồi! Bé Nốt vui lắm — mai mình chơi tiếp nhé!' : undefined));
  };
  const show = (k: number) => {
    const t = songs[k];
    const name = t.titleVi ?? t.title;
    app.show(
      songScreen(
        app,
        t,
        {
          mode: 'wait',
          hints: week >= 8 && (t.week ?? week) < week - 1 ? 'names' : 'full',
          free: true,
          intro: k === 0 ? `🎵 Bài con thích: ${name}` : `🔁 Giờ ôn một bài cũ: ${name}`,
        },
        {
          onRun: (run) => store.addSongRun(session.id, run),
          onDone: () => {
            i = k + 1;
            if (i < songs.length) show(i);
            else finish(true);
          },
          onBack: () => finish(false),
        },
      ),
    );
  };
  show(0);
}
