import { notesToSolfege, parseSolfege, restsFor, stripSeparatorCommas, type SolfegeIssue, type SolfegeNote } from '../../music/solfege';
import { lhTimeline, measureCount, timeline, type Tune } from '../../music/tune';
import { chordName, chordToneNames, chordViName, chordsUsed, parseChordText, suggestChords, type ChordStyle } from '../../music/chords';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToFreq, pitchToMidi, viName, type Pitch } from '../../piano/pitchTable';
import {
  PARENT_TEMPOS,
  PRIVACY_NOTE,
  addTapNote,
  beatsOf,
  buildParentSong,
  newParentSongId,
  parentSongToTune,
  type TimeSig,
} from '../../practice/parentSongs';
import type { ParentSong } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, confirmDialog, h, toast } from '../components/dom';
import { StaffView } from '../components/staffView';
import { lazy } from '../lazy';
import '../../styles/parentSongs.css';
import '../../styles/parentux.css';

/**
 * "📝 Bố mẹ thêm bài" (OWNER 2026-10-06) — màn soạn bài của BỐ MẸ (vào từ màn Phụ huynh, đã qua cổng phụ huynh).
 * - ✍️ Gõ chữ: Đô Rê Mi… (cách gõ ở src/music/solfege.ts), đọc ngay khi gõ, báo lỗi theo dòng, khuông nhạc xem trước
 *   (có số ngón tự ghi) theo chỗ con trỏ đang gõ.
 * - 🎹 Chạm phím: bảng trường độ + bàn phím Đô3–Đô6 (dùng lại trình soạn của trò Sáng tác, không giới hạn số ô).
 * - 🎙️ Đàn để thêm bài (+ 2026-10-10, songRecord.ts): đàn giai điệu trên đàn thật → app chép nốt + trường độ → ô Gõ chữ.
 * - ▶ Nghe thử · 💾 Lưu → Thư viện mục "📝 Bài bố mẹ thêm" (chơi được mọi chế độ như bài hát thường).
 * Bài chỉ lưu trên iPad này (PRIVACY_NOTE) — app công khai không chứa giai điệu có bản quyền.
 */

export interface SongEditorHooks {
  /** Lưu xong / thoát */
  onDone(saved: ParentSong | null): void;
}

/** (+ 2026-11-08) Kiểu đệm tay trái */
const STYLES: Array<{ id: ChordStyle; label: string; sub: string }> = [
  { id: 'root', label: '🎵 Một nốt', sub: 'dễ nhất' },
  { id: 'block', label: '🎹 Hợp âm giữ', sub: '3 ngón, giữ cả ô' },
  { id: 'pulse', label: '🥁 Theo phách', sub: 'đánh lại theo nhịp' },
];
/** Nút chèn nhanh hợp âm hay dùng (giọng Đô trưởng) */
const CHORD_QUICK = ['C', 'Dm', 'Em', 'F', 'G', 'G7', 'Am', '|', '-', '_'];

type Mode = 'text' | 'tap';

/** (+ 2026-10-10) "🎙️ Đàn để thêm bài": ghi giai điệu từ đàn thật → nốt (chép nhạc: src/music/transcribe.ts). */
const recordMod = lazy(() => import('./songRecord'));

const EXAMPLES: Array<{ name: string; ts: TimeSig; text: string }> = [
  {
    name: '⭐ Ngôi sao nhỏ',
    ts: '4/4',
    text: 'Đô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-\nSol Sol Fa Fa | Mi Mi Rê- | Sol Sol Fa Fa | Mi Mi Rê-\nĐô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-',
  },
  {
    name: '🦋 Kìa con bướm vàng',
    ts: '4/4',
    text: "Đô Rê Mi Đô | Đô Rê Mi Đô\nMi Fa Sol- | Mi Fa Sol-\nSol/ La/ Sol/ Fa/ Mi Đô | Sol/ La/ Sol/ Fa/ Mi Đô\nĐô Sol, Đô- | Đô Sol, Đô-",
  },
  {
    name: '🎂 Chúc mừng sinh nhật',
    ts: '3/4',
    text: 'Sol,/. Sol,// | La, Sol, Đô | Si,- Sol,/. Sol,// | La, Sol, Rê | Đô-\nSol,/. Sol,// | Sol Mi Đô | Si, La, Fa/. Fa// | Mi Đô Rê | Đô--',
  },
];

/** Bảng trường độ của chế độ Chạm phím */
const DURS: Array<{ beats: number; label: string; sub: string }> = [
  { beats: 4, label: 'Tròn', sub: '4 phách' },
  { beats: 2, label: 'Trắng', sub: '2 phách' },
  { beats: 1, label: 'Đen', sub: '1 phách' },
  { beats: 0.5, label: 'Móc đơn', sub: '½ phách' },
  { beats: 0.25, label: 'Móc kép', sub: '¼ phách' },
];

/** Nút chèn nhanh vào ô chữ (bàn phím iPad gõ ' và | hơi khó) */
const QUICK = ['Đô', 'Rê', 'Mi', 'Fa', 'Sol', 'La', 'Si', '_', '-', '/', '.', '~', "'", ',', '#', 'b', '|'];

export function songEditorScreen(app: App, existing: ParentSong | null, hooks: SongEditorHooks) {
  return (root: HTMLElement) => {
    const store = app.store;
    let mode: Mode = existing && !existing.text ? 'tap' : 'text';
    let ts: TimeSig = existing?.timeSignature ?? '4/4';
    let bpm = existing?.bpm ?? 72;
    let text = existing ? existing.text ?? notesToSolfege(existing.notes, beatsOf(ts), existing.phrases ?? []) : '';
    let tapNotes: SolfegeNote[] = existing && !existing.text ? existing.notes.map(({ pitch, beats, rest }) => (rest ? { rest: true, beats } : { pitch, beats })) : [];
    // Dấu lặng app thêm cho tròn ô cuối — bỏ đi để chạm tiếp nối liền
    while (tapNotes.length && tapNotes[tapNotes.length - 1].rest) tapNotes.pop();
    let tapBeats = 1;
    let tapDot = false;
    let dirty = false;
    let caretNote = -1;
    let playing: { stop(): void } | null = null;
    // (+ 2026-11-08) Tay trái đệm hợp âm — tab riêng; giai điệu vẫn soạn ở tab Gõ chữ / Chạm phím (`mode`)
    let view: 'melody' | 'chords' = 'melody';
    let chordText = existing?.chords ?? '';
    let chordStyle: ChordStyle = existing?.chordStyle ?? 'block';

    const defTitle = () => {
      let n = store.parentSongs().length + 1;
      const names = new Set(store.parentSongs().map((x) => x.title));
      while (names.has(`Bài thêm số ${n}`)) n++;
      return `Bài thêm số ${n}`;
    };
    const titleIn = h('input', {
      class: 'se-title',
      type: 'text',
      maxlength: '60',
      value: existing?.title ?? '',
      placeholder: defTitle(),
      'aria-label': 'Tên bài',
    });
    titleIn.addEventListener('input', () => (dirty = true));

    const area = h('textarea', {
      class: 'se-area',
      autocapitalize: 'off',
      autocorrect: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Nốt nhạc (gõ Đô Rê Mi)',
      placeholder: 'Gõ nốt, cách nhau bằng dấu cách — ví dụ:\nĐô Đô Sol Sol | La La Sol- | Fa Fa Mi Mi | Rê Rê Đô-',
    });
    area.value = text;
    area.setSelectionRange(0, 0); // khuông xem trước mở từ đầu bài

    const top = h('header', { class: 'se-top' });
    const tabs = h('div', { class: 'se-tabs' });
    const body = h('div', { class: 'se-body' });
    const bar = h('div', { class: 'actions' });
    const screen = h('div', { class: 'screen se-screen' }, top, tabs, body, bar);
    root.append(screen);

    const kb = new PianoKeyboard({
      low: 'C3',
      high: 'C6',
      labels: 'all',
      fingerOnPress: false,
      onPress: (p) => {
        void app.audio.playPitch(p);
        if (mode !== 'tap') return;
        const beats = tapBeats * (tapDot ? 1.5 : 1);
        tapNotes = addTapNote(tapNotes, { pitch: p, beats }, beatsOf(ts));
        dirty = true;
        renderTap();
      },
    });

    // ---------------- Kết quả hiện tại (cả hai chế độ) ----------------
    function current(): { notes: SolfegeNote[]; errors: SolfegeIssue[]; warnings: SolfegeIssue[]; notices: SolfegeIssue[]; phrases: number[]; pickupRest: number } {
      if (mode === 'text') return parseSolfege(text, beatsOf(ts));
      return { notes: tapNotes, errors: [], warnings: [], notices: [], phrases: [], pickupRest: 0 };
    }

    function build(id = existing?.id ?? 'preview'): ParentSong | null {
      const r = current();
      if (!r.notes.some((n) => !n.rest)) return null;
      return buildParentSong(r.notes, {
        id,
        title: titleIn.value.trim() || defTitle(),
        createdAt: existing?.createdAt ?? Date.now(),
        timeSignature: ts,
        bpm,
        phrases: r.phrases,
        pickupRest: r.pickupRest,
        text: mode === 'text' ? text : undefined,
        chords: chordText,
        chordStyle,
      });
    }

    function staffBox(tune: Tune | null, cursor: number): HTMLElement {
      if (!tune) {
        return h('div', { class: 'se-staff se-staff-empty' }, mode === 'text' ? '🎼 Khuông nhạc hiện ở đây khi bố mẹ gõ nốt' : '🎼 Chọn trường độ rồi chạm phím đàn để viết nốt');
      }
      const st = new StaffView(tune, { names: true, fingers: true, measuresPerPage: 4 });
      const playable = timeline(tune).filter((n) => !n.rest);
      if (cursor >= 0 && tune.notes.length) st.setCursor(Math.min(cursor, tune.notes.length - 1));
      else if (playable.length) st.setCursor(playable[0].index);
      st.el.classList.add('se-staff');
      staffView = st;
      return st.el;
    }
    let staffView: StaffView | null = null;

    // ---------------- Khung trên: tên bài · nhịp · tốc độ ----------------
    function renderTop(): void {
      const seg = (label: string, on: boolean, onTap: () => void) => {
        const b = h('button', { class: `seg-btn small${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on) }, label);
        b.addEventListener('click', onTap);
        return b;
      };
      top.replaceChildren(
        h('div', { class: 'se-head' }, h('span', { class: 'se-kicker' }, existing ? '✏️ Sửa bài' : '📝 Bài mới'), titleIn),
        h(
          'div',
          { class: 'se-opts' },
          h('span', { class: 'se-lbl' }, 'Nhịp'),
          h('div', { class: 'seg-group' }, ...(['4/4', '3/4', '2/4'] as TimeSig[]).map((x) => seg(x, ts === x, () => ((ts = x), (dirty = true), renderTop(), render())))),
          h('span', { class: 'se-lbl' }, '♩ ='),
          h('div', { class: 'seg-group' }, ...PARENT_TEMPOS.map((x) => seg(String(x), bpm === x, () => ((bpm = x), (dirty = true), renderTop())))),
        ),
      );
    }

    function renderTabs(): void {
      const tab = (m: Mode, label: string) => {
        const on = view === 'melody' && mode === m;
        const b = h('button', { class: `se-tab${on ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(on) }, label);
        b.addEventListener('click', () => switchMode(m));
        return b;
      };
      const chordTab = (() => {
        const on = view === 'chords';
        const b = h(
          'button',
          { class: `se-tab se-chord-tab${on ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(on), 'data-test': 'chord-tab' },
          chordTabLabel(),
        );
        b.addEventListener('click', () => {
          if (view === 'chords') return;
          if (mode === 'text' && parseSolfege(text, beatsOf(ts)).errors.length) return toast('Sửa hết lỗi (chữ đỏ) ở giai điệu trước nhé', 2600);
          stopPlay();
          view = 'chords';
          renderTabs();
          render();
        });
        return b;
      })();
      const rec = h('button', { class: 'se-tab se-rec', type: 'button' }, '🎙️ Đàn để thêm bài');
      rec.addEventListener('click', openRecorder);
      tabs.replaceChildren(
        h('div', { class: 'se-tabset', role: 'tablist' }, tab('text', '✍️ Gõ chữ Đô Rê Mi'), tab('tap', '🎹 Chạm phím'), chordTab),
        rec,
        h('div', { class: 'se-privacy' }, `🔒 ${PRIVACY_NOTE}`),
      );
    }

    // ---------------- 🎙️ Đàn để thêm bài (songRecord.ts — chunk riêng, nạp ngầm khi mở trình soạn) ----------------
    let recClose: (() => void) | null = null;
    function openRecorder(): void {
      stopPlay();
      const go = (m: typeof import('./songRecord')) => {
        recClose = m.openSongRecorder(app, screen, {
          ts,
          bpm,
          onClose: () => (recClose = null),
          onApply: (r) => {
            const take = () => {
              recClose?.();
              recClose = null;
              ts = r.ts;
              bpm = r.bpm;
              text = r.text;
              area.value = text;
              area.setSelectionRange(0, 0);
              mode = 'text';
              dirty = true;
              renderTop();
              renderTabs();
              render();
              toast(`🎙️ Đã chép ${r.notes} nốt — ▶ Nghe thử, sửa chữ nếu cần rồi 💾 Lưu`, 3500);
            };
            const has = mode === 'text' ? !!text.trim() : tapNotes.length > 0;
            if (has) confirmDialog({ title: 'Thay nốt đang có?', text: 'Nốt vừa đàn sẽ THAY cho nốt đang có trong trình soạn.', okLabel: 'Thay', onOk: take });
            else take();
          },
        });
      };
      if (recordMod.loaded) go(recordMod.loaded);
      else recordMod.load().then(go, () => toast('Chưa mở được — thử lại nhé', 2600));
    }

    function switchMode(m: Mode): void {
      if (view === 'chords') {
        stopPlay();
        view = 'melody';
        if (m === mode) {
          renderTabs();
          render();
          return;
        }
      }
      if (m === mode) return;
      stopPlay();
      if (m === 'tap') {
        const r = parseSolfege(text, beatsOf(ts));
        if (r.errors.length) return toast('Sửa hết lỗi (chữ đỏ) trước khi chuyển nhé', 2600);
        tapNotes = [...restsFor(r.pickupRest), ...r.notes];
      } else {
        text = notesToSolfege(tapNotes, beatsOf(ts));
        area.value = text;
      }
      mode = m;
      renderTabs();
      render();
    }

    // ---------------- Chế độ GÕ CHỮ ----------------
    const issuesBox = h('div', { class: 'se-issues', 'aria-live': 'polite' });
    const staffSlot = h('div', { class: 'se-staff-slot' });
    let helpOpen = !existing && !text;

    function caretIndex(): number {
      const upto = parseSolfege(area.value.slice(0, area.selectionStart ?? area.value.length), beatsOf(ts));
      const k = upto.notes.length - 1;
      if (k < 0) return -1;
      return k + restsFor(parseSolfege(area.value, beatsOf(ts)).pickupRest).length;
    }

    function refreshText(): void {
      const r = parseSolfege(text, beatsOf(ts));
      const song = build();
      const tune = song ? parentSongToTune(song) : null;
      caretNote = caretIndex();
      staffSlot.replaceChildren(staffBox(tune, caretNote));
      const items: HTMLElement[] = [];
      // Lỗi có sửa một chạm (vd "Đô, Rê, Mi" → bỏ dấu phẩy) hiện TRƯỚC, kèm nút sửa
      const fixable = r.errors.filter((e) => e.fix === 'commas');
      for (const e of fixable) {
        items.push(
          h(
            'li',
            { class: 'se-err se-fix' },
            `❌ ${e.message} `,
            button({
              icon: '🧹',
              label: 'Bỏ dấu phẩy',
              kind: 'primary',
              onTap: () => {
                text = stripSeparatorCommas(text);
                area.value = text;
                dirty = true;
                refreshText();
              },
            }),
          ),
        );
      }
      const plain = r.errors.filter((e) => !e.fix);
      for (const e of plain.slice(0, 4)) items.push(h('li', { class: 'se-err' }, `❌ Dòng ${e.line}, chữ ${e.word}: ${e.message}`));
      if (plain.length > 4) items.push(h('li', { class: 'se-err' }, `… và ${plain.length - 4} lỗi nữa`));
      for (const w of r.warnings.slice(0, 3)) items.push(h('li', { class: 'se-warn' }, `⚠️ Dòng ${w.line}: ${w.message}`));
      // ℹ️ App đã tự hiểu cách gõ quen tay / gợi ý kiểm tra — không chặn lưu
      for (const n of r.notices.slice(0, 3)) items.push(h('li', { class: 'se-info' }, `ℹ️ ${n.token ? `Dòng ${n.line}: ` : ''}${n.message}`));
      if (!r.errors.length && !r.warnings.length && tune) {
        const notes = r.notes.filter((n) => !n.rest).length;
        items.unshift(
          h(
            'li',
            { class: 'se-ok' },
            `✅ ${notes} nốt · ${measureCount(tune)} ô nhịp${tune.phrases ? ` · ${tune.phrases.length} câu` : ''}${r.pickupRest ? ' · có nhịp lấy đà' : ''} · ${tune.hand === 'BOTH' ? 'hai tay (tay trái hợp âm)' : tune.hand === 'LH' ? 'tay trái' : 'tay phải'} — số ngón app tự ghi`,
          ),
        );
      }
      issuesBox.replaceChildren(...items);
      renderBar();
    }

    let parseTimer = 0;
    area.addEventListener('input', () => {
      text = area.value;
      dirty = true;
      window.clearTimeout(parseTimer);
      parseTimer = window.setTimeout(refreshText, 150);
    });
    const followCaret = () => {
      if (mode !== 'text' || !staffView) return;
      const k = caretIndex();
      if (k >= 0 && k !== caretNote) {
        caretNote = k;
        staffView.setCursor(k);
      }
    };
    area.addEventListener('click', followCaret);
    area.addEventListener('keyup', followCaret);

    function insert(s: string): void {
      const a = area.selectionStart ?? area.value.length;
      const b = area.selectionEnd ?? a;
      const before = area.value.slice(0, a);
      // Tên nốt / vạch nhịp / dấu lặng là một "từ" mới → tự thêm dấu cách; hậu tố (- / . ' , # b) dính vào nốt trước
      const word = /^[A-ZĐa-z_|]/.test(s) && s !== 'b';
      const pre = word && before && !/\s$/.test(before) ? ' ' : '';
      area.setRangeText(pre + s, a, b, 'end');
      area.focus();
      area.dispatchEvent(new Event('input'));
    }

    function renderText(): void {
      const quick = h(
        'div',
        { class: 'se-quick', role: 'group', 'aria-label': 'Chèn nhanh' },
        ...QUICK.map((q) => {
          const b = h('button', { class: `se-q${/^[A-ZĐ]/.test(q) ? ' se-q-note' : ''}`, type: 'button' }, q === '_' ? '_ lặng' : q);
          // Giữ bàn phím iPad và con trỏ trong ô chữ
          b.addEventListener('pointerdown', (e) => e.preventDefault());
          b.addEventListener('click', () => insert(q));
          return b;
        }),
      );
      const help = h(
        'details',
        { class: 'se-help' },
        h('summary', {}, '❓ Cách gõ & ví dụ'),
        h(
          'ul',
          { class: 'se-help-list' },
          h('li', {}, h('b', {}, 'Đô Rê Mi Fa Sol La Si'), ' — có dấu hay không đều được (do re mi…)'),
          h('li', {}, h('b', {}, "Đô'"), ' cao hơn · ', h('b', {}, 'Sol,'), ' thấp hơn · hoặc số: ', h('b', {}, 'Sol3')),
          h('li', {}, h('b', {}, 'Fa#'), ' thăng · ', h('b', {}, 'Sib'), ' giáng'),
          h('li', {}, 'Mặc định 1 phách · ', h('b', {}, 'Mi-'), ' 2 · ', h('b', {}, 'Mi--'), ' 3 · ', h('b', {}, 'Rê/'), ' ½ · ', h('b', {}, 'Rê//'), ' ¼ · ', h('b', {}, 'Mi.'), ' chấm dôi'),
          h('li', {}, h('b', {}, '_'), ' dấu lặng (', h('b', {}, '_-'), ' lặng 2 phách) · ', h('b', {}, '|'), ' vạch nhịp (không bắt buộc) · xuống dòng = câu mới'),
          h('li', {}, h('b', {}, 'Mi-~Mi'), ' dấu nối (giữ tiếng, không đàn lại) · giữa các nốt chỉ cần ', h('b', {}, 'dấu cách'), ' (không cần phẩy)'),
        ),
        h(
          'div',
          { class: 'se-examples' },
          ...EXAMPLES.map((ex) =>
            button({
              label: ex.name,
              kind: 'mint',
              onTap: () => {
                const go = () => {
                  ts = ex.ts;
                  text = ex.text;
                  area.value = text;
                  area.setSelectionRange(0, 0); // khuông xem trước mở từ đầu bài
                  if (!titleIn.value.trim()) titleIn.value = ex.name.replace(/^\S+\s/, '');
                  dirty = true;
                  renderTop();
                  refreshText();
                };
                if (text.trim()) confirmDialog({ title: 'Thay bằng ví dụ?', text: 'Chữ đang gõ sẽ bị thay bằng bài ví dụ.', okLabel: 'Thay', onOk: go });
                else go();
              },
            }),
          ),
        ),
      );
      help.open = helpOpen;
      help.addEventListener('toggle', () => (helpOpen = help.open));
      body.replaceChildren(
        staffSlot,
        h('div', { class: 'se-text' }, h('div', { class: 'se-text-main' }, quick, area), h('div', { class: 'se-side' }, issuesBox, help)),
      );
      refreshText();
    }

    // ---------------- Chế độ CHẠM PHÍM ----------------
    function renderTap(): void {
      const palette = h(
        'div',
        { class: 'iv-palette se-palette', role: 'group', 'aria-label': 'Trường độ' },
        ...DURS.map((d) => {
          const b = h(
            'button',
            { class: `iv-rh se-rh${tapBeats === d.beats ? ' on' : ''}`, type: 'button', 'aria-pressed': String(tapBeats === d.beats) },
            h('span', { class: 'iv-rh-label' }, d.label),
            h('span', { class: 'iv-rh-sub' }, d.sub),
          );
          b.addEventListener('click', () => ((tapBeats = d.beats), renderTap()));
          return b;
        }),
        (() => {
          const b = h('button', { class: `iv-rh se-rh${tapDot ? ' on' : ''}`, type: 'button', 'aria-pressed': String(tapDot) }, h('span', { class: 'iv-rh-label' }, '• Chấm dôi'), h('span', { class: 'iv-rh-sub' }, '×1,5'));
          b.addEventListener('click', () => ((tapDot = !tapDot), renderTap()));
          return b;
        })(),
        (() => {
          const b = h('button', { class: 'iv-rh se-rh se-rest', type: 'button' }, h('span', { class: 'iv-rh-label' }, '_ Lặng'), h('span', { class: 'iv-rh-sub' }, 'thêm dấu lặng'));
          b.addEventListener('click', () => {
            tapNotes = addTapNote(tapNotes, { rest: true, beats: tapBeats * (tapDot ? 1.5 : 1) }, beatsOf(ts));
            dirty = true;
            renderTap();
          });
          return b;
        })(),
      );
      const song = build();
      const tune = song ? parentSongToTune(song) : null;
      const used = tapNotes.reduce((s, n) => s + n.beats, 0);
      const bpb = beatsOf(ts);
      const last = tapNotes[tapNotes.length - 1];
      const info = tapNotes.length
        ? `${tapNotes.filter((n) => !n.rest).length} nốt · ô ${Math.floor(used / bpb - 1e-9) + 1}${last ? ` · vừa thêm: ${last.rest ? 'dấu lặng' : viName(last.pitch as Pitch)}` : ''}`
        : 'Bàn phím Đô3 – Đô6 · phím đen = thăng/giáng';
      body.replaceChildren(
        palette,
        staffBox(tune, tapNotes.length - 1),
        h('div', { class: 'se-tapbar' }, h('p', { class: 'iv-left' }, info), h(
          'div',
          { class: 'row' },
          button({ icon: '↶', label: 'Xóa nốt cuối', disabled: !tapNotes.length, onTap: () => ((tapNotes = tapNotes.slice(0, -1)), (dirty = true), renderTap()) }),
          button({
            icon: '🗑️',
            label: 'Xóa hết',
            disabled: !tapNotes.length,
            onTap: () => confirmDialog({ title: 'Xóa hết nốt?', text: 'Mọi nốt đã chạm sẽ bị xóa.', okLabel: 'Xóa hết', danger: true, onOk: () => ((tapNotes = []), renderTap()) }),
          }),
        )),
        h('div', { class: 'keyboard-wrap short se-kb' }, kb.el),
      );
      renderBar();
    }

    function render(): void {
      stopPlay();
      screen.classList.toggle('se-mode-tap', view === 'melody' && mode === 'tap');
      screen.classList.toggle('se-mode-chords', view === 'chords');
      if (view === 'chords') renderChords();
      else if (mode === 'text') renderText();
      else renderTap();
    }

    // ---------------- (+ 2026-11-08) 🎹🎹 HAI TAY: tay trái đệm hợp âm ----------------
    function chordTabLabel(): string {
      return chordText.trim() ? '🎹🎹 Hai tay ✓' : '🎹🎹 Hai tay: hợp âm';
    }
    const chordArea = h('textarea', {
      class: 'se-area se-chord-area',
      autocapitalize: 'off',
      autocorrect: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
      rows: '3',
      'aria-label': 'Hợp âm tay trái theo ô nhịp',
      'data-test': 'chord-area',
      placeholder: 'Mỗi ô nhịp một hợp âm — ví dụ:\nC | F | G | C   hoặc   Đô | Fa | Sol | Đô',
    });
    chordArea.value = chordText;
    const chordInfo = h('div', { class: 'se-issues', 'aria-live': 'polite' });
    const chordStaff = h('div', { class: 'se-staff-slot' });
    let chordTimer = 0;
    chordArea.addEventListener('input', () => {
      chordText = chordArea.value;
      dirty = true;
      window.clearTimeout(chordTimer);
      chordTimer = window.setTimeout(refreshChords, 200);
    });

    /** Giai điệu hiện tại kèm dấu lặng lấy đà — để app tự chọn hợp âm. */
    function melodyNotes(): SolfegeNote[] {
      const r = current();
      return [...restsFor(r.pickupRest), ...r.notes];
    }

    function refreshChords(): void {
      const song = build();
      const tune = song ? parentSongToTune(song) : null;
      chordStaff.replaceChildren(staffBox(tune, -1));
      const pr = parseChordText(chordText);
      const items: HTMLElement[] = [];
      for (const e of pr.errors.slice(0, 4)) items.push(h('li', { class: 'se-err' }, `❌ ${e.message}`));
      const melodyBars = tune ? measureCount(tune) : 0;
      if (!chordText.trim()) items.push(h('li', { class: 'se-info' }, 'ℹ️ Chưa có hợp âm — bài đang là bài một tay. Chạm ✨ để app tự chọn.'));
      else if (!pr.errors.length && tune) {
        items.push(h('li', { class: 'se-ok' }, `✅ Tay trái ${pr.bars.length} ô · giai điệu ${melodyBars} ô — bài hai tay`));
        if (pr.bars.length < melodyBars) items.push(h('li', { class: 'se-warn' }, `⚠️ Thiếu hợp âm cho ${melodyBars - pr.bars.length} ô cuối — tay trái nghỉ ở đó`));
        if (pr.bars.length > melodyBars) items.push(h('li', { class: 'se-warn' }, `⚠️ Thừa ${pr.bars.length - melodyBars} ô hợp âm — app bỏ bớt`));
      }
      const used = chordsUsed(pr.bars);
      if (used.length)
        items.push(
          h('li', { class: 'se-chord-legend' }, ...used.map((c) => h('span', { class: 'se-chord-chip' }, h('b', {}, chordName(c)), ` = ${chordViName(c)} (${chordToneNames(c)})`))),
        );
      chordInfo.replaceChildren(...items);
      // dấu ✓ trên tab Hai tay (không vẽ lại ô chữ đang gõ)
      const tb = tabs.querySelector('.se-chord-tab');
      if (tb) tb.textContent = chordTabLabel();
      renderBar();
    }

    function insertChord(q: string): void {
      const a = chordArea.selectionStart ?? chordArea.value.length;
      const b = chordArea.selectionEnd ?? a;
      const before = chordArea.value.slice(0, a);
      const pre = before && !/\s$/.test(before) ? ' ' : '';
      chordArea.setRangeText(pre + q + ' ', a, b, 'end');
      chordArea.focus();
      chordArea.dispatchEvent(new Event('input'));
    }

    function renderChords(): void {
      const quick = h(
        'div',
        { class: 'se-quick', role: 'group', 'aria-label': 'Chèn hợp âm' },
        ...CHORD_QUICK.map((q) => {
          const b = h('button', { class: `se-q${/^[A-G]/.test(q) ? ' se-q-note' : ''}`, type: 'button' }, q === '_' ? '_ nghỉ' : q === '-' ? '- giữ' : q);
          b.addEventListener('pointerdown', (e) => e.preventDefault());
          b.addEventListener('click', () => insertChord(q));
          return b;
        }),
      );
      const styleSeg = h(
        'div',
        { class: 'iv-palette se-palette se-style', role: 'group', 'aria-label': 'Kiểu đệm tay trái' },
        ...STYLES.map((st) => {
          const on = chordStyle === st.id;
          const b = h('button', { class: `iv-rh se-rh${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on) }, h('span', { class: 'iv-rh-label' }, st.label), h('span', { class: 'iv-rh-sub' }, st.sub));
          b.addEventListener('click', () => {
            chordStyle = st.id;
            dirty = true;
            renderChords();
          });
          return b;
        }),
      );
      const auto = button({
        icon: '✨',
        label: 'App tự chọn hợp âm',
        kind: 'sun',
        onTap: () => {
          const notes = melodyNotes();
          if (!notes.some((n) => !n.rest)) return toast('Viết giai điệu trước nhé (tab Gõ chữ hoặc Chạm phím)', 2600);
          const go = () => {
            chordText = suggestChords(notes, beatsOf(ts));
            chordArea.value = chordText;
            dirty = true;
            refreshChords();
            toast('✨ App đã chọn hợp âm — ▶ Nghe thử, sửa nếu muốn', 2600);
          };
          if (chordText.trim()) confirmDialog({ title: 'Thay hợp âm đang có?', text: 'App sẽ chọn lại hợp âm cho cả bài.', okLabel: 'Thay', onOk: go });
          else go();
        },
      });
      const clear = button({
        icon: '🗑️',
        label: 'Bỏ tay trái',
        disabled: !chordText.trim(),
        onTap: () =>
          confirmDialog({
            title: 'Bỏ tay trái?',
            text: 'Bài trở lại thành bài một tay (giai điệu giữ nguyên).',
            okLabel: 'Bỏ',
            danger: true,
            onOk: () => {
              chordText = '';
              chordArea.value = '';
              dirty = true;
              renderChords();
            },
          }),
      });
      body.replaceChildren(
        chordStaff,
        h(
          'div',
          { class: 'se-text' },
          h(
            'div',
            { class: 'se-text-main' },
            h('p', { class: 'se-chord-intro' }, '🎹🎹 Tay phải đàn giai điệu, tay trái đệm hợp âm. Gõ hợp âm cho từng ô nhịp (cách nhau bằng ', h('b', {}, '|'), ') hoặc để app tự chọn.'),
            auto,
            styleSeg,
            quick,
            chordArea,
          ),
          h(
            'div',
            { class: 'se-side' },
            chordInfo,
            clear,
            h(
              'details',
              { class: 'se-help' },
              h('summary', {}, '❓ Cách gõ hợp âm'),
              h(
                'ul',
                { class: 'se-help-list' },
                h('li', {}, h('b', {}, 'C D E F G A B'), ' hoặc ', h('b', {}, 'Đô Rê Mi Fa Sol La Si'), ' — hợp âm trưởng'),
                h('li', {}, h('b', {}, 'Am'), ' / ', h('b', {}, 'La thứ'), ' — hợp âm thứ · ', h('b', {}, 'G7'), ' — hợp âm 7 · ', h('b', {}, 'F#'), ' ', h('b', {}, 'Bb'), ' — thăng/giáng'),
                h('li', {}, h('b', {}, 'C | G | Am | F'), ' — mỗi ô một hợp âm · ', h('b', {}, 'F C'), ' trong một ô = mỗi hợp âm nửa ô'),
                h('li', {}, h('b', {}, '_'), ' tay trái nghỉ cả ô · ', h('b', {}, '-'), ' giữ hợp âm trước'),
              ),
            ),
          ),
        ),
      );
      refreshChords();
    }

    // ---------------- Nghe thử ----------------
    function stopPlay(): void {
      if (!playing) return;
      playing.stop();
      playing = null;
      renderBar();
    }

    function play(): void {
      stopPlay();
      const song = build();
      if (!song) return;
      const tune = parentSongToTune(song);
      const spb = 60 / bpm;
      const t0 = app.audio.now() + 0.3;
      const timers: number[] = [];
      const notes = timeline(tune);
      for (const n of notes) {
        if (n.rest || !n.pitch) continue;
        void app.audio.scheduleFreq(midiToFreq(pitchToMidi(n.pitch)), t0 + n.start * spb, n.beats * spb * 0.95);
        timers.push(window.setTimeout(() => {
          staffView?.setCursor(n.index);
          if (mode === 'tap' && view === 'melody') kb.flash(n.pitch!, true), window.setTimeout(() => kb.flash(n.pitch!, false), Math.min(400, n.beats * spb * 900));
        }, 300 + n.start * spb * 1000));
      }
      // (+ 2026-11-08) tay trái (cả hợp âm)
      for (const n of lhTimeline(tune)) {
        if (n.rest || !n.pitch) continue;
        for (const p of [n.pitch, ...(n.also ?? []).map((a) => a.pitch)])
          void app.audio.scheduleFreq(midiToFreq(pitchToMidi(p)), t0 + n.start * spb, n.beats * spb * 0.95);
      }
      const end = notes.reduce((s, n) => s + n.beats, 0);
      timers.push(window.setTimeout(() => stopPlay(), 300 + end * spb * 1000 + 400));
      playing = {
        stop: () => {
          timers.forEach((t) => window.clearTimeout(t));
          app.audio.stopAll();
          kb.clear();
        },
      };
      renderBar();
    }

    // ---------------- Lưu / thoát ----------------
    function save(): void {
      const r = current();
      if (r.errors.length) return toast('Còn lỗi (chữ đỏ) — sửa xong mới lưu được', 2600);
      if (chordText.trim() && parseChordText(chordText).errors.length) return toast('Còn hợp âm app chưa hiểu (chữ đỏ ở tab Hai tay)', 2600);
      const song = build(existing?.id ?? newParentSongId(store.parentSongs()));
      if (!song) return toast('Bài chưa có nốt nào');
      stopPlay();
      if (existing) {
        const { id: _id, createdAt: _c, ...patch } = song;
        // chế độ chạm phím: bỏ chữ cũ (không còn khớp nốt)
        store.updateParentSong(existing.id, { ...patch, text: song.text, phrases: song.phrases, lh: song.lh, chords: song.chords, chordStyle: song.chordStyle });
      } else store.addParentSong(song);
      dirty = false;
      toast(`💾 Đã lưu “${song.title}” — mở ở 🎵 Bài hát › 📝 Bài thêm`, 3000);
      hooks.onDone(store.findParentSong(song.id) ?? song);
    }

    function leave(): void {
      stopPlay();
      if (!dirty) return hooks.onDone(null);
      confirmDialog({ title: 'Bỏ bài đang soạn?', text: 'Những thay đổi chưa lưu sẽ mất.', okLabel: 'Bỏ', danger: true, onOk: () => hooks.onDone(null) });
    }

    function renderBar(): void {
      const r = mode === 'text' ? parseSolfege(text, beatsOf(ts)) : null;
      const has = mode === 'text' ? !!r && r.notes.some((n) => !n.rest) : tapNotes.some((n) => !n.rest);
      const parts: Array<HTMLElement | null> = [
        backButton(leave),
        playing
          ? button({ icon: '■', label: 'Dừng', kind: 'retry', onTap: stopPlay })
          : button({ icon: '▶', label: 'Nghe thử', kind: 'sun', disabled: !has, onTap: play }),
        button({ icon: '💾', label: existing ? 'Lưu thay đổi' : 'Lưu bài', kind: 'primary', disabled: !has || (!!r && r.errors.length > 0), onTap: save }),
        // (+ 2026-11-08) xóa bài ngay trong trình soạn
        existing
          ? button({
              icon: '🗑️',
              label: 'Xóa bài',
              kind: 'danger',
              onTap: () =>
                confirmDialog({
                  title: `Xóa “${existing.title}”?`,
                  text: 'Bài sẽ biến mất khỏi danh sách bài hát (các lượt đã chơi vẫn giữ).',
                  okLabel: 'Xóa bài',
                  okIcon: '🗑️',
                  danger: true,
                  onOk: () => {
                    stopPlay();
                    store.deleteParentSong(existing.id);
                    dirty = false;
                    toast(`Đã xóa “${existing.title}”`, 2200);
                    hooks.onDone(null);
                  },
                }),
            })
          : null,
      ];
      bar.replaceChildren(...(parts.filter(Boolean) as HTMLElement[]));
    }

    renderTop();
    renderTabs();
    render();
    if (mode === 'text' && !text) window.setTimeout(() => area.focus(), 50);
    recordMod.prefetch();
    return () => {
      recClose?.();
      window.clearTimeout(parseTimer);
      window.clearTimeout(chordTimer);
      stopPlay();
      kb.destroy();
    };
  };
}
