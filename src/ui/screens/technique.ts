import { cancelSpeech, speak } from '../../audio/voice';
import type { TechniqueDrill } from '../../lessons/types';
import { DYN_VOLUME } from '../../music/tune';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import type { ParentResult } from '../../progress/schema';
import type { App } from '../App';
import { confetti } from '../components/celebrate';
import { HandOverlay, playDemo, type DemoEvent } from '../components/demo';
import { backButton, button, h } from '../components/dom';
import { mascot } from '../components/mascot';
import { speakChip } from '../components/speakChip';
import { techniqueArt } from '../components/techniqueArt';

export interface TechniqueHooks {
  title: string;
  drills: TechniqueDrill[];
  /** PARENT_ASSESSMENT — noteId `tech:${drill}`: 'correct' (bố mẹ xác nhận) | 'retry' (làm lại) */
  record(noteId: string, result: ParentResult): void;
  onDone(): void;
  onBack(): void;
}

export const DRILL_INFO: Record<TechniqueDrill, { emoji: string; name: string; how: string; secs: number; times: number }> = {
  'arm-drop': {
    emoji: '🌈',
    name: 'Cầu vồng rơi',
    how: 'Giơ tay vẽ cầu vồng rồi thả tay rơi nhẹ xuống phím — cổ tay mềm như sợi bún.',
    secs: 12,
    times: 3,
  },
  'wrist-circle': { emoji: '🔄', name: 'Xoay cổ tay', how: 'Thả lỏng cổ tay, xoay thành vòng tròn thật chậm.', secs: 12, times: 3 },
  'finger-tap': {
    emoji: '🚪',
    name: 'Ngón gõ cửa',
    how: 'Đặt tay lên nắp đàn, gõ lần lượt ngón 1-2-3-4-5 — đầu ngón cong.',
    secs: 15,
    times: 3,
  },
  'five-finger': {
    emoji: '🪜',
    name: 'Năm ngón leo thang',
    how: 'Đàn Đô Rê Mi Fa Sol lên rồi xuống: lần đầu thật NHỎ, lần sau thật TO.',
    secs: 15,
    times: 2,
  },
  'thumb-under': {
    emoji: '🚇',
    name: 'Ngón cái chui hầm',
    how: 'Ngón cái chui nhẹ dưới lòng bàn tay, chạm phím Fa rồi về chỗ cũ.',
    secs: 12,
    times: 3,
  },
  'hand-shape': {
    emoji: '⚽',
    name: 'Ôm quả bóng',
    how: 'Khum tay tròn như đang ôm quả bóng nhỏ — giữ dáng tay đó khi đặt lên phím.',
    secs: 10,
    times: 3,
  },
};

const FIVE = ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4'];

/** Mẫu "5 ngón leo thang": lượt 1 nhỏ (p), lượt 2 to (f). */
function fiveFingerEvents(): DemoEvent[] {
  const ev: DemoEvent[] = [];
  [DYN_VOLUME.p, DYN_VOLUME.f].forEach((vol, pass) => {
    FIVE.forEach((p, k) => {
      const finger = [1, 2, 3, 4, 5, 4, 3, 2, 1][k];
      ev.push({
        time: pass * 10 + k,
        dur: k === FIVE.length - 1 ? 1.5 : 1,
        notes: [{ pitch: p, finger, hand: 'RH', vol, len: k === FIVE.length - 1 ? 1.4 : 0.9 }],
        caption: `${pass === 0 ? '🐭 Nhỏ' : '🦁 To'} · ngón ${finger}`,
      });
    });
  });
  return ev;
}

/**
 * v5 — KHỞI ĐỘNG KỸ THUẬT (~1 phút): mỗi bài một hoạt hình ngắn + một câu hướng dẫn (đọc to),
 * đồng hồ nhẹ nhàng (~10–15 giây, "Làm 3 lần"), rồi bố mẹ xác nhận "Con làm đúng rồi" / "Làm lại".
 */
export function techniqueScreen(app: App, hooks: TechniqueHooks) {
  return (root: HTMLElement) => {
    let i = 0;
    let token = 0;
    let stopArt: () => void = () => undefined;
    let timer = 0;
    let demoRun: { cancel: () => void; done: Promise<void> } | null = null;

    // Cùng dải C3–C5 như các màn khác → bàn tay thầy vừa cỡ phím
    const kb = new PianoKeyboard({ low: 'C3', high: 'C5', labels: 'c', onPress: (p) => void app.audio.playPitch(p) });
    const overlay = new HandOverlay(kb);
    const kbWrap = h('div', { class: 'keyboard-wrap tq-kb' }, kb.el);
    const stage = h('div', { class: 'stage scrollable tq-stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, kbWrap, bar));
    const setBar = (...b: (HTMLElement | null | false)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    function halt(): number {
      token++;
      stopArt();
      stopArt = () => undefined;
      window.clearInterval(timer);
      if (demoRun) {
        demoRun.cancel();
        demoRun = null;
      }
      overlay.hide();
      cancelSpeech();
      return token;
    }

    function intro(): void {
      halt();
      kbWrap.hidden = true;
      const said = `${hooks.title}. Mình khởi động tay trước khi đàn nhé!`;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Khởi động tay'),
        h('div', { class: 'hero-mascot' }, mascot('wave', 96)),
        h('h1', { class: 'title' }, hooks.title),
        h(
          'div',
          { class: 'tq-list' },
          ...hooks.drills.map((d) => h('span', { class: 'tq-chip' }, `${DRILL_INFO[d].emoji} ${DRILL_INFO[d].name}`)),
        ),
        h('p', { class: 'lead' }, 'Mình khởi động tay trước khi đàn nhé!', speakChip(app, said)),
      );
      setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => show() }));
      const tk = token;
      window.setTimeout(() => tk === token && void speak(app, said), 400);
    }

    function demoFive(): void {
      if (demoRun) demoRun.cancel();
      const tk = token;
      const cap = stage.querySelector('.tq-caption');
      const run = playDemo(app.audio, kb, overlay, fiveFingerEvents(), {
        bpm: 100,
        onCaption: (t) => cap && (cap.textContent = t),
      });
      demoRun = run;
      void run.done.then(() => {
        if (tk !== token || demoRun !== run) return;
        demoRun = null;
        overlay.hide();
        if (cap) cap.textContent = ' ';
      });
    }

    /** Một bài: hoạt hình + câu hướng dẫn (đọc to) + nút "Con làm nào". */
    function show(): void {
      const tk = halt();
      const d = hooks.drills[i];
      const info = DRILL_INFO[d];
      const five = d === 'five-finger';
      kbWrap.hidden = !five;
      let art: Element;
      if (five) art = h('div', { class: 'tq-caption' }, ' ');
      else {
        const a = techniqueArt(d);
        art = a.el;
        stopArt = a.stop;
      }
      const said = `${info.name}. ${info.how} Làm ${info.times} lần nhé.`;
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Bài ${i + 1} / ${hooks.drills.length}`),
        h('h1', { class: 'title' }, `${info.emoji} ${info.name}`),
        h('div', { class: `tq-art-box${five ? ' five' : ''}` }, art),
        h('p', { class: 'lead tq-how' }, info.how, speakChip(app, said)),
        h('div', { class: 'tq-times' }, `Làm ${info.times} lần`),
      );
      setBar(
        backButton(() => (i > 0 ? ((i -= 1), show()) : intro())),
        five ? button({ icon: '🎬', label: 'Thầy làm mẫu', onTap: () => demoFive() }) : null,
        button({ icon: '▶', label: 'Con làm nào', kind: 'primary', onTap: () => run() }),
      );
      if (five) window.setTimeout(() => tk === token && demoFive(), 500);
      else window.setTimeout(() => tk === token && void speak(app, said), 350);
    }

    /** Bé làm theo: đồng hồ nhẹ nhàng, chấm sáng dần "Làm 3 lần"; hết giờ (hoặc bấm Xong) → bố mẹ xác nhận. */
    function run(): void {
      if (demoRun) {
        demoRun.cancel();
        demoRun = null;
      }
      cancelSpeech();
      const tk = token;
      const info = DRILL_INFO[hooks.drills[i]];
      const dots = Array.from({ length: info.times }, (_, k) => h('i', { class: 'tq-dot' }, String(k + 1)));
      const fill = h('div', { class: 'tq-fill' });
      const box = h('div', { class: 'tq-timer' }, h('div', { class: 'tq-dots' }, ...dots), h('div', { class: 'tq-bar' }, fill));
      stage.querySelector('.tq-times')?.replaceWith(box);
      const t0 = performance.now();
      const ms = info.secs * 1000;
      const tick = () => {
        if (tk !== token) return window.clearInterval(timer);
        const f = Math.min(1, (performance.now() - t0) / ms);
        fill.style.width = `${f * 100}%`;
        dots.forEach((dEl, k) => dEl.classList.toggle('on', f >= (k + 1) / info.times - 0.02));
        if (f >= 1) {
          window.clearInterval(timer);
          ask();
        }
      };
      timer = window.setInterval(tick, 100);
      tick();
      setBar(button({ icon: '✓', label: 'Con xong rồi', kind: 'primary', onTap: () => (window.clearInterval(timer), ask()) }));
    }

    function ask(): void {
      const d = hooks.drills[i];
      const id = `tech:${d}`;
      stage.querySelector('.tq-timer')?.classList.add('done');
      const q = h('p', { class: 'lead tq-ask' }, '👪 Bố mẹ: con làm đúng chưa?');
      stage.querySelector('.tq-ask')?.remove();
      stage.append(q);
      q.scrollIntoView?.({ block: 'nearest' });
      setBar(
        backButton(() => show()),
        button({
          icon: '↻',
          label: 'Làm lại',
          kind: 'retry',
          onTap: () => {
            hooks.record(id, 'retry');
            show();
          },
        }),
        button({
          icon: '👪',
          label: 'Con làm đúng rồi',
          kind: 'good',
          onTap: () => {
            hooks.record(id, 'correct');
            void app.audio.chime();
            i++;
            if (i >= hooks.drills.length) done();
            else show();
          },
        }),
      );
    }

    function done(): void {
      halt();
      kbWrap.hidden = true;
      confetti(28);
      stage.replaceChildren(
        h('div', { class: 'hero-mascot' }, mascot('cheer', 110)),
        h('h1', { class: 'title' }, 'Tay đã sẵn sàng! 💪'),
        h('p', { class: 'lead' }, 'Tay mềm, ngón cong — mình đàn thôi!'),
      );
      setBar(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    if (!hooks.drills.length) done();
    else intro();
    return () => {
      halt();
      overlay.destroy();
      kb.destroy();
    };
  };
}
