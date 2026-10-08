import {
  EXPR,
  judgeArticulation,
  judgeLoudness,
  noteShapes,
  referenceLevel,
  type ExprFrame,
} from '../../audio/expression';
import type { Activity } from '../../lessons/types';
import { DYN_VOLUME, STAC_FRACTION } from '../../music/tune';
import { fingerOnKeyboard, type Hand } from '../../piano/fingering';
import { PianoKeyboard, type KeyTarget } from '../../piano/PianoKeyboard';
import { keyboardRangeFor, pitchToMidi, viName, type Pitch } from '../../piano/pitchTable';
import type { ParentResult } from '../../progress/schema';
import type { App } from '../App';
import { confetti } from '../components/celebrate';
import { HandOverlay, playDemo, type DemoEvent } from '../components/demo';
import { backButton, button, h } from '../components/dom';
import { mascot } from '../components/mascot';

type DynActivity = Extract<Activity, { kind: 'dynamics' }>;
export type DynRound = DynActivity['rounds'][number];
type Want = DynRound['want'];

export interface DynamicsHooks {
  title: string;
  intro: string;
  mode: DynActivity['mode'];
  rounds: DynRound[];
  /** PARENT_ASSESSMENT (micro hoặc bố mẹ chấm) — noteId `dyn:${mode}:${i}` */
  record(noteId: string, result: ParentResult): void;
  onDone(): void;
  onBack(): void;
}

const WANT: Record<Want, { emoji: string; word: string; sym: string; how: string; ask: string }> = {
  f: { emoji: '🦁', word: 'TO', sym: 'f', how: 'Đàn TO — như sư tử gầm!', ask: 'bé đàn TO chưa?' },
  p: { emoji: '🐭', word: 'NHỎ', sym: 'p', how: 'Đàn NHỎ — rón rén như chuột nhắt', ask: 'bé đàn NHỎ (mà vẫn rõ tiếng) chưa?' },
  stac: { emoji: '🐇', word: 'NGẮT', sym: '•', how: 'Chạm phím rồi nhấc ngay — thỏ nhảy!', ask: 'bé đàn NGẮT (nhấc tay nhanh) chưa?' },
  leg: { emoji: '🐢', word: 'LIỀN', sym: '⌒', how: 'Giữ phím tới khi bấm nốt sau — liền tiếng', ask: 'bé đàn LIỀN (không hở) chưa?' },
};

const PRAISE: Record<Want, string[]> = {
  f: ['🦁 Gầm! To quá đỉnh!', '🦁 Sư tử chính hiệu!', '💥 To và rõ — tuyệt!'],
  p: ['🐭 Nhỏ xíu mà rõ — giỏi quá!', '🤫 Nhẹ như gió thoảng!', '🐭 Chuột nhắt rón rén chuẩn luôn!'],
  stac: ['🐇 Nhảy tưng tưng — đúng kiểu ngắt!', '🐇 Nhấc tay nhanh quá!', '✨ Ngắt gọn gàng!'],
  leg: ['🐢 Liền mượt như dòng sông!', '🌊 Không hở chút nào — hay quá!', '🐢 Liền tiếng tuyệt vời!'],
};

const TRY: Record<Want, string> = {
  f: 'To hơn nữa nào — như sư tử gầm! 🦁',
  p: 'Nhỏ hơn nữa — rón rén như chuột nhắt 🐭',
  stac: 'Nhấc tay nhanh hơn — chạm rồi bật lên như thỏ 🐇',
  leg: 'Giữ phím tới khi bấm nốt sau — đừng để hở nhé 🐢',
};

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const BPM = 72;

/**
 * v4 — Trò SẮC THÁI (to/nhỏ) & KIỂU ĐÀN (ngắt/liền): thầy đàn mẫu (bàn tay hoạt hình), bé đàn lại trên đàn thật.
 * Micro bật: to/nhỏ so với tiếng "vừa" của chính bé (đo ở lượt đầu); ngắt/liền đo tiếng ngân (src/audio/expression.ts).
 * Không micro → bố mẹ xác nhận. Micro trượt 2 lần → "Bố mẹ: qua" (không bao giờ kẹt).
 */
export function dynamicsScreen(app: App, hooks: DynamicsHooks) {
  return (root: HTMLElement) => {
    const loudSoft = hooks.mode === 'loud-soft';
    let i = 0;
    let token = 0;
    let micFails = 0;
    let failsRound = -1;
    let calFails = 0;
    /** Tiếng "vừa" của bé (đỉnh âm lượng) — đo một lần cho cả hoạt động */
    let ref: number | null = null;
    /** Micro không đo được tiếng vừa → bố mẹ chấm cả hoạt động */
    let parentOnly = false;
    let unFrame: () => void = () => undefined;
    let demoRun: { cancel: () => void; done: Promise<void> } | null = null;
    let demoTimer = 0;

    const allPitches = hooks.rounds.flatMap((r) => r.pitches);
    const [low, high] = keyboardRangeFor(allPitches.length ? allPitches : ['C4']);
    const kb = new PianoKeyboard({
      low,
      high,
      labels: 'c',
      fingerOnPress: (p) => fingerOf(hooks.rounds[i] ?? hooks.rounds[0], p),
      // Phím ảo chỉ để xem — bé đàn trên đàn thật (không phát tiếng, để micro không nghe lẫn)
      onPress: () => undefined,
    });
    const overlay = new HandOverlay(kb);
    const stage = h('div', { class: 'stage scrollable dyn-stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap dyn-kb' }, kb.el), bar));
    const setBar = (...b: (HTMLElement | null | false)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    function handOf(r: DynRound): Hand {
      return r.hand ?? (pitchToMidi(r.pitches[0]) < 60 ? 'LH' : 'RH');
    }
    function fingerOf(r: DynRound, p: Pitch): { finger: number; hand: Hand } | null {
      const k = r.pitches.findIndex((x) => pitchToMidi(x) === pitchToMidi(p));
      const hand = handOf(r);
      const f = k >= 0 ? r.fingers?.[k] : undefined;
      if (f) return { finger: f, hand };
      return fingerOnKeyboard(p, hand === 'LH');
    }
    function light(r: DynRound): void {
      const ts: KeyTarget[] = [];
      const seen = new Set<number>();
      for (const p of r.pitches) {
        if (seen.has(pitchToMidi(p))) continue;
        seen.add(pitchToMidi(p));
        const f = fingerOf(r, p);
        ts.push({ pitch: p, finger: f?.finger, hand: f?.hand ?? handOf(r) });
      }
      kb.setTargets(ts);
    }

    /** Dừng mọi thứ đang chạy (mẫu, micro) — gọi trước mỗi bước mới. */
    function halt(): number {
      token++;
      window.clearTimeout(demoTimer);
      unFrame();
      unFrame = () => undefined;
      if (demoRun) {
        demoRun.cancel();
        demoRun = null;
      }
      overlay.hide();
      return token;
    }

    const card = (w: Want, big = true) =>
      h(
        'div',
        { class: `dyn-card dyn-${w}${big ? '' : ' small'}` },
        h('div', { class: 'dyn-emoji' }, WANT[w].emoji),
        h('div', { class: 'dyn-word' }, h('span', { class: `dyn-sym sym-${w}` }, WANT[w].sym), ' ', WANT[w].word),
      );

    function intro(): void {
      halt();
      kb.clear();
      // (2026-10-08) trò chỉ có một kiểu (vd "Đàn liền" tuần 5 — chỉ LIỀN) → chỉ hiện thẻ kiểu đó
      const all: Want[] = loudSoft ? ['f', 'p'] : ['stac', 'leg'];
      const pair = all.filter((w) => hooks.rounds.some((r) => r.want === w));
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, loudSoft ? 'To – nhỏ' : pair.length === 1 && pair[0] === 'leg' ? 'Liền' : 'Ngắt – liền'),
        h('h1', { class: 'title' }, hooks.title),
        h('div', { class: 'dyn-pair' }, ...pair.map((w) => card(w, false))),
        h('p', { class: 'lead' }, hooks.intro),
      );
      setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => show() }));
    }

    /** Lượt i: thẻ to (sư tử / chuột / thỏ / rùa), phím sáng kèm số ngón, thầy tự đàn mẫu. */
    function show(autoDemo = true): void {
      halt();
      // Đếm lần micro chấm trượt theo TỪNG LƯỢT — xem thầy đàn mẫu lại không xóa (để vẫn tới được "Bố mẹ: qua")
      if (failsRound !== i) {
        failsRound = i;
        micFails = 0;
      }
      const r = hooks.rounds[i];
      kb.clear();
      light(r);
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Lượt ${i + 1} / ${hooks.rounds.length}`),
        card(r.want),
        h('p', { class: 'lead' }, WANT[r.want].how),
      );
      setBar(
        backButton(() => (i > 0 ? ((i -= 1), show()) : intro())),
        button({ icon: '🎬', label: 'Thầy đàn', onTap: () => demo() }),
        button({ icon: '🎹', label: 'Con đàn', kind: 'primary', onTap: () => void play() }),
      );
      if (autoDemo) {
        const tk = token;
        demoTimer = window.setTimeout(() => tk === token && demo(), 500);
      }
    }

    function eventsOf(r: DynRound): DemoEvent[] {
      const hand = handOf(r);
      const vol = r.want === 'p' ? DYN_VOLUME.p : r.want === 'f' ? DYN_VOLUME.f : DYN_VOLUME.mf;
      const len = r.want === 'stac' ? STAC_FRACTION : r.want === 'leg' ? 1.04 : 0.9;
      return r.pitches.map((p, k) => ({
        time: k,
        dur: 1,
        notes: [{ pitch: p, finger: fingerOf(r, p)?.finger, hand, vol, len }],
        caption: viName(p),
      }));
    }

    function demo(): void {
      const tk = halt();
      const r = hooks.rounds[i];
      kb.setTargets([]);
      overlay.setGhost(false);
      const run = playDemo(app.audio, kb, overlay, eventsOf(r), { bpm: BPM });
      demoRun = run;
      void run.done.then(() => {
        if (tk !== token) return;
        demoRun = null;
        overlay.hide();
        light(r);
      });
    }

    /** Nghe bé đàn: gom khung micro tới khi đủ số lần gõ (+ chờ tiếng ngân), im lâu, hoặc hết giờ. */
    function listen(tk: number, expected: number, settle: number, meter: HTMLElement | null, done: (frames: ExprFrame[]) => void): void {
      const frames: ExprFrame[] = [];
      let count = 0;
      let last = -1;
      // Đồng hồ trang (không phụ thuộc AudioContext — có thể bị tạm dừng)
      const t0 = performance.now() / 1000;
      unFrame();
      const un = app.mic.onFrame((f) => {
        if (tk !== token) return un();
        const t = performance.now() / 1000;
        // Tiếng của chính app (hoặc tiếng tích) không phải bé đàn
        if (f.app === 'sounding' || f.app === 'click') return;
        frames.push({ t, rms: f.rms, onset: f.onset, floor: f.floor });
        if (f.onset && (last < 0 || t - last >= EXPR.MERGE)) {
          count++;
          last = t;
        }
        if (meter) {
          const base = ref ?? f.gate * 4;
          meter.style.width = `${Math.max(2, Math.min(100, (f.rms / Math.max(base, 1e-6)) * 50))}%`;
        }
        const enough = count >= expected && t - last >= settle;
        const quietLong = count > 0 && t - last > 2.5;
        if (enough || quietLong || t - t0 > 12) {
          un();
          done(frames);
        }
      });
      unFrame = un;
    }

    function meterBox(): { box: HTMLElement; fill: HTMLElement } {
      const fill = h('div', { class: 'dyn-meter-fill' });
      const box = h('div', { class: 'dyn-meter' }, fill, h('div', { class: 'dyn-meter-mid' }));
      return { box, fill };
    }

    async function play(): Promise<void> {
      // Lần đầu iPad hỏi quyền micro: chờ xong mà bé đã rời màn / bấm nút khác thì thôi
      const tk0 = halt();
      await app.ensureMic();
      if (tk0 !== token) return;
      if (app.mic.state !== 'on' || parentOnly) return askParent();
      if (loudSoft && ref === null) return calibrate();
      listenRound();
    }

    /** Lượt đầu (to/nhỏ): đo tiếng "vừa" của bé — đàn nốt đầu 2 lần, vừa vừa. */
    function calibrate(): void {
      const tk = halt();
      const p = hooks.rounds[0].pitches[0];
      const r0: DynRound = { pitches: [p], want: 'p', hand: handOf(hooks.rounds[i]) };
      kb.clear();
      light(r0);
      const m = meterBox();
      stage.replaceChildren(
        h('div', { class: 'dyn-card dyn-mf' }, h('div', { class: 'dyn-emoji' }, '🙂'), h('div', { class: 'dyn-word' }, 'VỪA')),
        h('h1', { class: 'title' }, `🎤 Đàn ${viName(p)} vừa vừa — 2 lần`),
        m.box,
      );
      setBar(backButton(() => show(false)));
      listen(tk, 2, 0.35, m.fill, (frames) => {
        if (tk !== token) return;
        const peaks = noteShapes(frames).map((s) => s.peak);
        const level = peaks.length >= 2 ? referenceLevel(peaks) : 0;
        if (level > 0) {
          ref = level;
          calFails = 0;
          stage.replaceChildren(h('div', { class: 'hero-emoji' }, '👂'), h('h1', { class: 'title' }, 'App nhớ tiếng vừa của con rồi!'));
          const tk2 = token;
          window.setTimeout(() => tk2 === token && listenRound(), 1100);
          return;
        }
        calFails++;
        stage.replaceChildren(
          h('div', { class: 'hero-mascot' }, mascot('think', 90)),
          h('h1', { class: 'title' }, 'App chưa nghe rõ — đàn lại nhé!'),
        );
        setBar(
          backButton(() => show(false)),
          button({ icon: '↻', label: 'Đàn lại', kind: 'primary', onTap: () => calibrate() }),
          calFails >= 2
            ? button({
                icon: '👪',
                label: 'Bố mẹ: qua',
                onTap: () => {
                  // Micro không đo được → bố mẹ chấm cả trò này
                  parentOnly = true;
                  askParent();
                },
              })
            : null,
        );
      });
    }

    function listenRound(): void {
      const tk = halt();
      const r = hooks.rounds[i];
      kb.clear();
      light(r);
      const m = meterBox();
      stage.replaceChildren(card(r.want), h('h1', { class: 'title' }, '🎤 Đến lượt con!'));
      if (loudSoft) stage.append(m.box);
      setBar(backButton(() => show(false)));
      // Ngắt/liền: chờ thêm để đo tiếng ngân của nốt cuối
      listen(tk, r.pitches.length, loudSoft ? 0.35 : 0.7, loudSoft ? m.fill : null, (frames) => {
        if (tk === token) grade(r, frames);
      });
    }

    function grade(r: DynRound, frames: ExprFrame[]): void {
      const shapes = noteShapes(frames);
      let ok = false;
      let heardNothing = false;
      let extra: HTMLElement | null = null;
      if (loudSoft) {
        const want = r.want === 'f' ? 'f' : 'p';
        const peaks = shapes.map((s) => s.peak);
        heardNothing = !peaks.length;
        const res = judgeLoudness(peaks, ref ?? 0, want);
        ok = res.ok;
        if (!heardNothing) {
          // Hai cột: tiếng vừa của con ↔ lần này
          const max = Math.max(1, res.ratio) * 1.15;
          const col = (label: string, v: number, cls: string) =>
            h(
              'div',
              { class: 'dyn-col' },
              h('div', { class: 'dyn-col-bar' }, h('div', { class: `dyn-col-fill ${cls}`, style: { height: `${Math.max(4, (v / max) * 100)}%` } })),
              h('div', { class: 'dyn-col-label' }, label),
            );
          extra = h('div', { class: 'dyn-cols' }, col('🙂 vừa', 1, 'mf'), col(`${WANT[want].emoji} con`, res.ratio, want));
        }
      } else {
        const want = r.want === 'stac' ? 'stac' : 'leg';
        heardNothing = shapes.length < (want === 'leg' ? 2 : 1);
        ok = !heardNothing && judgeArticulation(shapes, want).ok;
      }
      hooks.record(`dyn:${hooks.mode}:${i}`, ok ? 'correct' : 'retry');
      if (ok) {
        void app.audio.chime();
        confetti(24);
      } else micFails++;
      const msg = ok
        ? pick(PRAISE[r.want])
        : heardNothing
          ? r.want === 'p'
            ? 'App chưa nghe thấy — nhỏ mà vẫn rõ tiếng nhé 🐭'
            : 'App chưa nghe đủ nốt — đàn lại nhé 🎹'
          : TRY[r.want];
      stage.replaceChildren(h('div', { class: 'hero-mascot' }, mascot(ok ? 'cheer' : 'think', 90)), h('h1', { class: 'title' }, msg));
      if (extra) stage.append(extra);
      setBar(
        backButton(() => show(false)),
        button({ icon: '↻', label: ok ? 'Đàn lại' : 'Thử lại', onTap: () => listenRound() }),
        button({ icon: '🎬', label: 'Thầy đàn', onTap: () => show(true) }),
        // Micro có thể chấm trượt → sau 2 lần, bố mẹ được cho qua — không kẹt bé lại
        !ok && micFails >= 2 ? button({ icon: '👪', label: 'Bố mẹ: qua', onTap: () => askParent() }) : null,
        ok ? button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: next }) : null,
      );
    }

    function askParent(): void {
      halt();
      const r = hooks.rounds[i];
      const id = `dyn:${hooks.mode}:${i}`;
      kb.clear();
      light(r);
      stage.replaceChildren(card(r.want, false), h('h1', { class: 'title' }, `👪 Bố mẹ: ${WANT[r.want].ask}`));
      setBar(
        backButton(() => show(false)),
        button({
          icon: '👪',
          label: 'Đúng rồi',
          kind: 'good',
          onTap: () => {
            hooks.record(id, 'correct');
            void app.audio.chime();
            next();
          },
        }),
        button({
          icon: '↻',
          label: 'Thử lại',
          kind: 'retry',
          onTap: () => {
            hooks.record(id, 'retry');
            show(false);
          },
        }),
      );
    }

    function next(): void {
      i++;
      if (i >= hooks.rounds.length) done();
      else show();
    }

    function done(): void {
      halt();
      kb.clear();
      confetti();
      stage.replaceChildren(
        h('div', { class: 'hero-emoji' }, loudSoft ? '🦁🐭' : '🐇🐢'),
        h('h1', { class: 'title' }, loudSoft ? 'Con đàn to – nhỏ rõ ràng quá!' : 'Ngắt – liền, con làm được hết!'),
      );
      setBar(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    if (!hooks.rounds.length) done();
    else intro();
    return () => {
      halt();
      overlay.destroy();
      kb.destroy();
    };
  };
}
