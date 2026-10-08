import type { RhythmSymbol } from '../../lessons/types';
import type { ParentResult } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { confetti } from '../components/celebrate';
import { RHYTHM_CHECKS, parentChecklist } from '../components/parentCheck';
import { TIMING_WINDOWS, countBridgeFor, countLine, countWords, gradeTiming, type CountBridgeStage } from '../../music/timing';
import { cancelSpeech, speak } from '../../audio/voice';

/** Từ vựng nhịp: độ dài (phách) và các tiếng vỗ (phách, tính từ đầu ô) — dùng cả để vẽ, đếm số và chấm micro. */
export const SYMBOL: Record<RhythmSymbol, { label: string; emoji: string; beats: number; hits: number[] }> = {
  walk: { label: 'Đi', emoji: '👣', beats: 1, hits: [0] },
  run: { label: 'Chạy-chạy', emoji: '🏃', beats: 1, hits: [0, 0.5] },
  long: { label: 'Đi-i', emoji: '🐢', beats: 2, hits: [0] },
  long3: { label: 'Đi-i-i', emoji: '🐌', beats: 3, hits: [0] },
  // (2026-10-08, OWNER duyệt) nốt tròn — dạy ở tuần 4 (bài theo nhịp tuần 4 đã có nốt 4 phách)
  long4: { label: 'Đi-i-i-i', emoji: '🐘', beats: 4, hits: [0] },
  dotted: { label: 'Đi-chấm chạy', emoji: '🐪', beats: 2, hits: [0, 1.5] },
  rest: { label: 'Suỵt', emoji: '🤫', beats: 1, hits: [] },
  // v5 (tuần 18): móc kép, nghịch phách, dây nối
  run4: { label: 'Chạy-chạy-chạy-chạy', emoji: '🐇', beats: 1, hits: [0, 0.25, 0.5, 0.75] },
  run3: { label: 'Chạy chạy-chạy', emoji: '🐎', beats: 1, hits: [0, 0.5, 0.75] },
  dotted8: { label: 'Tập-tễnh', emoji: '🦘', beats: 1, hits: [0, 0.75] },
  tie: { label: 'Đi‿đi (dấu nối)', emoji: '🔗', beats: 2, hits: [0] },
  sync: { label: 'Chạy-Đi-chạy', emoji: '💃', beats: 2, hits: [0, 0.5, 1.5] },
};

/** Một ô thẻ nhịp (emoji + chữ) — dùng chung cho màn Nhịp và trò "Đố nhịp" (games/rhythmQuiz.ts). */
export function rhythmCell(sym: RhythmSymbol, text: string = SYMBOL[sym].label, counting = false): HTMLElement {
  const s = SYMBOL[sym];
  return h(
    'div',
    { class: `rh-cell rh-${sym}`, style: { flexGrow: String(s.beats) } },
    h('div', { class: 'rh-emoji' }, s.emoji),
    h('div', { class: `rh-label${counting ? ' rh-count' : ''}` }, text),
  );
}

/**
 * (OWNER duyệt 2026-10-08) CẦU NỐI ĐẾM SỐ: ô nhịp có vần (Đi / Chạy-chạy) VÀ dòng đếm số bên dưới ("3-và").
 * Vần rút dần theo tuần (timing.ts COUNT_BRIDGE): tuần 1–5 vần + số · 6–8 số to đậm, vần mờ · 9+ chỉ số.
 */
export function rhythmBridgeCell(sym: RhythmSymbol, count: string, stage: CountBridgeStage): HTMLElement {
  const s = SYMBOL[sym];
  return h(
    'div',
    { class: `rh-cell rh-${sym} rh-bridge`, style: { flexGrow: String(s.beats) } },
    h('div', { class: 'rh-emoji' }, s.emoji),
    stage.syllables === 'none' ? null : h('div', { class: `rh-label${stage.syllables === 'faint' ? ' rh-faint' : ''}` }, s.label),
    h('div', { class: `rh-countline${stage.counts === 'strong' ? ' rh-strong' : ''}` }, count),
  );
}

export interface RhythmHooks {
  /** Tuần của bài học (quyết định cách hiện vần/đếm số — COUNT_BRIDGE); không có → tuần hiện tại */
  week?: number;
  title: string;
  intro: string;
  patterns: RhythmSymbol[][];
  /** PARENT_ASSESSMENT: bố mẹ xác nhận bé vỗ đều */
  record(noteId: string, result: ParentResult): void;
  onDone(): void;
  onBack(): void;
}

/**
 * Nhịp Mức 1 (tuần 2 & 4): vỗ tay theo máy gõ nhịp 60, đọc "Đi / Chạy-chạy / Đi-i / Suỵt".
 * Mỗi mẫu 1 ô nhịp, chơi 2 lần liền. App vỗ mẫu trước, rồi đến lượt bé; bố mẹ xác nhận.
 */
export function rhythmScreen(app: App, hooks: RhythmHooks) {
  return (root: HTMLElement) => {
    let i = 0;
    let token = 0;
    let micFails = 0;
    let raf = 0;
    /** Bộ nghe tiếng vỗ đang bật — gỡ khi rời màn */
    let unOnsetCur: () => void = () => undefined;
    const stage = h('div', { class: 'stage scrollable' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));
    const setBar = (...b: (HTMLElement | null)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    /** Số phách mỗi ô của mẫu hiện tại: mẫu 2 phách (nhịp 2/4) → đếm "1 – 2", 3 phách → "1 – 2 – 3" */
    const meterOf = (p: RhythmSymbol[]) => {
      const b = p.reduce((a, sym) => a + SYMBOL[sym].beats, 0);
      return b === 2 || b === 3 ? b : 4;
    };
    /** Mẫu có tiếng vỗ cách nhau dưới nửa phách (móc kép) → chậm lại (48) cho bé vỗ kịp */
    const bpmOf = (p: RhythmSymbol[]) =>
      p.some((sym) => SYMBOL[sym].hits.some((h, k, a) => k > 0 && h - a[k - 1] < 0.5 - 1e-9)) ? 48 : 60;
    let meter = 4;
    let spb = 1;

    /**
     * (OWNER duyệt 2026-10-08) Cầu nối vần → đếm số, theo TUẦN (thay cho xen kẽ mẫu vần / mẫu số của v5):
     * mọi ô đều có dòng đếm số; vần to (tuần 1–5) → mờ (6–8) → không còn (9+). Lời nhắc & giọng đọc theo `bridge.say`.
     */
    const bridge = countBridgeFor(hooks.week ?? app.store.get().progress.currentWeek);
    const counting = () => bridge.say === 'counts';
    /** Mẫu đã đọc to lời nhắc (đọc một lần mỗi mẫu) */
    let spokenFor = -1;

    function cells(p: RhythmSymbol[]): { row: HTMLElement; els: HTMLElement[]; starts: number[] } {
      const els: HTMLElement[] = [];
      const starts: number[] = [];
      const seq = [...p, ...p];
      let b = 0;
      for (const sym of seq) {
        starts.push(b);
        b += SYMBOL[sym].beats;
      }
      const words = countWords(
        seq.map((sym, k) => ({ start: starts[k], beats: SYMBOL[sym].beats, hits: SYMBOL[sym].hits })),
        meterOf(p),
      );
      seq.forEach((sym, k) => els.push(rhythmBridgeCell(sym, countLine(words[k]), bridge)));
      return { row: h('div', { class: 'rh-row' }, ...els), els, starts };
    }

    /** Lời nhắc theo cách đọc của tuần (vần → đếm số) */
    const sayHow = () => {
      const count = Array.from({ length: meterOf(hooks.patterns[i]) }, (_, k) => k + 1).join(' – ');
      if (!counting()) return 'Vỗ tay và đọc to chữ — nhìn cả số đếm bên dưới nhé!';
      return bridge.syllables === 'faint' ? `Vỗ tay và đếm to: ${count} (chữ nhỏ để nhắc thôi)` : `Vỗ tay và đếm to: ${count}`;
    };

    function intro(): void {
      token++;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Nhịp'),
        h('h1', { class: 'title' }, hooks.title),
        h('p', { class: 'lead' }, hooks.intro),
      );
      setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => show() }));
    }

    function show(): void {
      token++;
      micFails = 0;
      cancelAnimationFrame(raf);
      const p = hooks.patterns[i];
      const { row } = cells(p);
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Mẫu ${i + 1} / ${hooks.patterns.length}`),
        h('h1', { class: 'title' }, counting() ? 'Vỗ tay và đếm số 🔢' : 'Vỗ tay và đọc to 🗣️'),
        h('p', { class: 'lead rh-how' }, sayHow()),
        row,
        h('div', { class: 'countin' }, ' '),
      );
      // Đọc to lời nhắc một lần mỗi mẫu (giọng theo cách đọc của tuần)
      if (spokenFor !== i) {
        spokenFor = i;
        void speak(app, sayHow());
      }
      setBar(
        backButton(() => (i > 0 ? ((i -= 1), show()) : intro())),
        button({ icon: '🔊', label: 'Nghe mẫu', onTap: () => void play(true) }),
        button({ icon: '👏', label: 'Con vỗ', kind: 'primary', onTap: () => void play(false) }),
      );
    }

    /**
     * demo=true: app "vỗ" mẫu. false: đến lượt bé — nếu micro bật, app TỰ CHẤM tiếng vỗ tay
     * (sau 4 tiếng đếm vào thì tắt tiếng tích, chỉ còn nhịp nháy trên màn để micro nghe rõ tiếng vỗ).
     */
    async function play(demo: boolean): Promise<void> {
      cancelSpeech(); // giọng đọc không được lẫn vào tiếng vỗ / tiếng mẫu
      if (!demo) {
        // Lần đầu iPad hỏi quyền micro: chờ xong mà bé đã rời màn / bấm nút khác thì thôi
        const tk0 = ++token;
        await app.ensureMic();
        if (tk0 !== token) return;
      }
      const tk = ++token;
      const p = hooks.patterns[i];
      const { row, els, starts } = cells(p);
      const countEl = h('div', { class: 'countin' });
      const useMic = !demo && app.mic.state === 'on';
      stage.replaceChildren(
        h('h1', { class: 'title' }, demo ? '🔊 Nghe mẫu' : useMic ? '👏 Đến lượt con! 🎤 App đang nghe' : '👏 Đến lượt con!'),
        h('p', { class: 'lead rh-how' }, sayHow()),
        row,
        countEl,
      );
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: () => (app.audio.stopAll(), show()) }));
      meter = meterOf(p);
      spb = 60 / bpmOf(p);
      // Đếm vào 1 ô (4 tiếng) — nhịp 2/4 đếm vào 2 ô ("1 2 1 2") cho đủ 4 tiếng
      const countIn = meter === 2 ? 4 : meter;
      const t0 = app.audio.now() + 0.4 + countIn * spb;
      const seq = [...p, ...p];
      const total = starts.length ? starts[starts.length - 1] + SYMBOL[seq[starts.length - 1]].beats : 4;
      // Đếm vào 4 tiếng; khi micro chấm thì phần sau chỉ có nhịp nháy (không tiếng tích)
      for (let b = -countIn; b < (useMic ? 0 : total); b++) app.audio.click(t0 + b * spb, ((b % meter) + meter) % meter === 0);
      if (demo) {
        seq.forEach((sym, k) => {
          for (const hb of SYMBOL[sym].hits) void app.audio.scheduleFreq(196, t0 + (starts[k] + hb) * spb, 0.09, 0.9);
        });
      }
      const claps: number[] = [];
      unOnsetCur();
      const unOnset = useMic ? app.mic.onOnset((at) => claps.push((at - t0) / spb)) : () => undefined;
      unOnsetCur = unOnset;
      const loop = () => {
        if (tk !== token) return void unOnset();
        const beat = (app.audio.now() - t0) / spb;
        // Chỉ ghi khi chữ đổi (tránh cập nhật DOM mỗi khung hình)
        const say = (t: string) => countEl.textContent !== t && (countEl.textContent = t);
        if (beat < 0) say(String(((countIn - Math.ceil(-beat - 1e-6)) % meter) + 1));
        else {
          say(useMic ? (Math.floor(beat) % meter === 0 ? '●' : '•') : ' ');
          els.forEach((e, k) => e.classList.toggle('now', beat >= starts[k] && (k + 1 >= starts.length || beat < starts[k + 1])));
        }
        if (beat < total + 0.4) raf = requestAnimationFrame(loop);
        else {
          unOnset();
          if (demo) show();
          else if (useMic) grade(seq, starts, els, claps);
          else askParent();
        }
      };
      raf = requestAnimationFrame(loop);
    }

    /** Chấm tiếng vỗ tay: mỗi tiếng vỗ cần một tiếng nghe được gần đúng lúc; vỗ thừa nhiều cũng chưa đạt. */
    function grade(seq: RhythmSymbol[], starts: number[], els: HTMLElement[], claps: number[]): void {
      const expected: Array<{ index: number; start: number; midi: number; cell: number }> = [];
      seq.forEach((sym, k) => SYMBOL[sym].hits.forEach((hb) => expected.push({ index: expected.length, start: starts[k] + hb, midi: 0, cell: k })));
      const heard = claps.filter((b) => b > -0.4).map((b) => ({ beat: b, midi: 0 }));
      const w = TIMING_WINDOWS[app.store.settings.timing ?? 'easy'];
      // Móc đơn (chạy-chạy) cách nhau nửa phách → cửa sổ phải hẹp hơn nửa phách
      const v = gradeTiming(expected, heard, Math.min(w.early, 0.24), Math.min(w.late, 0.26));
      const hits = v.filter((x) => x.hit).length;
      const extras = Math.max(0, heard.length - hits);
      const ok = expected.length > 0 && hits / expected.length >= 0.75 && extras <= 1;
      els.forEach((e, k) => {
        const mine = expected.filter((x) => x.cell === k);
        if (!mine.length) return;
        e.classList.add(mine.every((x) => v[x.index].hit) ? 'good' : 'miss');
      });
      const p = hooks.patterns[i];
      hooks.record(`rhythm:${p.join('-')}`, ok ? 'correct' : 'retry');
      if (ok) {
        void app.audio.chime();
        confetti(24);
      }
      stage.append(
        h('p', { class: 'lead' }, ok ? `🎤 Con vỗ đúng ${hits}/${expected.length} — đều lắm!` : `🎤 Đúng ${hits}/${expected.length}${extras > 1 ? `, vỗ thừa ${extras}` : ''} — thử lại nhé!`),
      );
      if (!ok) micFails++;
      setBar(
        backButton(show),
        button({ icon: '↻', label: 'Vỗ lại', onTap: () => void play(false) }),
        // Micro có thể chấm trượt (phòng ồn, vỗ nhỏ) → sau 2 lần, bố mẹ được cho qua — không kẹt bé lại
        !ok && micFails >= 2 ? button({ icon: '👪', label: 'Bố mẹ: qua', onTap: () => askParent() }) : null,
        ok
          ? button({
              icon: '▶',
              label: 'Tiếp',
              kind: 'primary',
              onTap: () => {
                i++;
                if (i >= hooks.patterns.length) done();
                else show();
              },
            })
          : null,
      );
    }

    function askParent(): void {
      const p = hooks.patterns[i];
      const id = `rhythm:${p.join('-')}`;
      // v5 — bố mẹ chấm 2 ý (Đúng tiếng vỗ · Đều nhịp); đạt khi cả hai được tích
      const { row, done: doneBtn } = parentChecklist(RHYTHM_CHECKS, (_v, all) => {
        hooks.record(id, all ? 'correct' : 'retry');
        if (!all) return show();
        void app.audio.chime();
        i++;
        if (i >= hooks.patterns.length) done();
        else show();
      });
      stage.replaceChildren(h('h1', { class: 'title' }, '👪 Bố mẹ: bé vỗ thế nào?'), cells(p).row, h('p', { class: 'lead' }, 'Chạm các ý bé làm được:'), row);
      setBar(backButton(show), doneBtn);
    }

    function done(): void {
      token++;
      stage.replaceChildren(h('div', { class: 'hero-emoji' }, '🥁'), h('h1', { class: 'title' }, 'Con giữ nhịp giỏi quá!'));
      setBar(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    intro();
    return () => {
      token++;
      cancelSpeech();
      cancelAnimationFrame(raf);
      unOnsetCur();
    };
  };
}
