import { meterPct } from '../../audio/MicListener';
import { matchHeard } from '../../audio/match';
import type { Segment, Target } from '../../lessons/types';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import { PianoKeyboard } from '../../piano/PianoKeyboard';
import {
  PracticeStateMachine,
  type ParentResult,
  type PracticeEffect,
  type PracticeEvent,
  type ResultSource,
} from '../../practice/PracticeStateMachine';
import { keyboardRangeFor, midiToPitch, noteLabel, pitchToMidi, samePitch, viName } from '../../piano/pitchTable';
import { SPEECH_TAIL_MS, cancelSpeech, speak, speechBusy, voiceOn } from '../../audio/voice';
import { speakChip } from '../components/speakChip';
import { fingerFor, fingerOnKeyboard } from '../../piano/fingering';
import { leftHandActive } from '../../lessons/lessonEngine';
import { StaffView } from '../components/staffView';
import { HandOverlay, eventsFromTargets, playDemo } from '../components/demo';

/**
 * Lời khen ĐÚNG MỨC (khoa học học tập): nốt đúng bình thường → chuông + câu khen NÓI RÕ kỹ năng
 * ("Đúng Đô — ngón 1!"), không pháo giấy. Pháo giấy dành cho: xong cả phần, 3 nốt liền đúng ngay lần đầu.
 */
const PRAISE = ['Giỏi lắm!', 'Đúng rồi!', 'Con làm được rồi!', 'Chuẩn luôn!', 'Siêu quá!', 'Tuyệt cú mèo!'];
const PRAISE_SUB = [
  'Con tìm đúng rồi',
  'Cứ thế tiếp nhé!',
  '🤖 Rô-bốt cũng phải khen con!',
  '🦸 Siêu nhân piano là con đó!',
  '⚡ Nhanh như tia chớp!',
  '🎯 Trúng phóc!',
];
/** Khen ĐÚNG KỸ NĂNG khi nốt có số ngón (thay cho một câu cố định). */
const FINGER_SUB = (f: number) => [
  'Đúng phím, đúng ngón — cứ thế nhé!',
  `Ngón ${f} làm việc giỏi quá!`,
  'Tay tròn như ôm quả bóng — đẹp lắm!',
  `🦾 Ngón ${f} khỏe như tay rô-bốt!`,
  'Mắt tìm phím nhanh ghê!',
];
const RETRY_SUB = [
  'Mình thử lần nữa nhé',
  'Nhìn kỹ phím đang sáng nhé',
  'Từ từ thôi, con làm được mà',
  'Sai là đang học — thử lại nào!',
  '🤖 Rô-bốt cũng phải thử nhiều lần mới đúng!',
  '🦸 Siêu nhân nào cũng tập lại — mình thử nhé!',
];
/** Cứ 5 nốt đúng LIỀN NHAU → một câu "nạp năng lượng" (hiện + đọc to). */
const POWER_UPS = [
  '🤖 Rô-bốt nạp đầy năng lượng — bíp bíp!',
  '⚡ Siêu sức mạnh ngón tay được kích hoạt!',
  '🦸 Siêu nhân piano bay lên nào!',
  '🚀 Tên lửa âm nhạc rời bệ phóng!',
  '🦖 Khủng long cũng phải nhảy theo!',
  '🛡️ Lá chắn âm nhạc mạnh thêm một cấp!',
];
const POWER_EVERY = 5;
/** Lời chào đầu mỗi phần (trên tiêu đề) — đổi mỗi lần cho đỡ chán. */
const KICKERS = ['🤖 Nhiệm vụ mới!', '🦸 Siêu nhân piano xuất kích!', '🚀 Sẵn sàng cất cánh!', '⚡ Nạp năng lượng nào!', '🎯 Thử thách mới!', '🦖 Khám phá tiếp nào!'];
/** "Ôn nhanh": 6 lời dẫn xoay vòng (lời trong bài học luôn giống nhau). */
const REVIEW_INTROS = [
  'Mình ôn lại vài nốt cũ thật nhanh nhé!',
  'Khởi động ngón tay: vài nốt quen thuộc nào!',
  'Rô-bốt kiểm tra trí nhớ: con còn nhớ các nốt này không?',
  'Siêu nhân ôn bài — nhanh như chớp nhé!',
  'Gặp lại mấy người bạn nốt cũ nào!',
  'Bốn nốt cũ đang chờ con — xuất phát!',
];
const INTRO_MOODS = ['wave', 'happy', 'cheer', 'love'] as const;
/** Đúng → tự sang nốt sau sau ~1,5 giây (khi bố mẹ bật "Tự chuyển"); sai thì luôn chờ bấm "Thử lại". */
const CORRECT_ADVANCE_SEC = 1.5;
/** Buổi đã qua màn "Con sẵn sàng chưa?" — từ phần thứ 2 của cùng buổi thì bỏ qua màn này. */
let readySessionId: string | null = null;
/** Số lần "Thử lại" (bố mẹ) / nốt sai (micro) trên cùng một nốt thì mới cho "Bỏ qua — mai ôn lại". */
const SKIP_AFTER_RETRIES = 3;
const SKIP_AFTER_MIC_WRONG = 5;
/** Micro bật mà gần như im lặng bấy lâu → nhắc "App chưa nghe thấy". */
const SILENCE_HELP_MS = 8000;
const HAND_TAG = { RH: { letter: 'P', name: 'tay phải' }, LH: { letter: 'T', name: 'tay trái' } } as const;
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Chữ "P"/"T" (Phải/Trái) cạnh số ngón — không chỉ dựa vào màu (bé mù màu vẫn phân biệt được tay). */
function handTag(hand: Hand): HTMLElement {
  const t = HAND_TAG[hand];
  return h('span', { class: `hand-tag hand-tag-${hand.toLowerCase()}`, title: t.name, 'aria-label': t.name }, t.letter);
}

/** Tiêu đề không kèm tên chữ cái ("Đô / C" → "Đô"). */
const plainTitle = (t: Target) => t.title.split(' / ')[0];

/** Khuông nhỏ hiện một nốt (tuần 7). */
function miniStaff(pitch: string, clef: 'treble' | 'bass' = 'treble'): HTMLElement {
  const sv = new StaffView(
    { id: `mini-${pitch}`, title: '', titleVi: pitch, hand: 'RH', bpm: 60, timeSignature: '4/4', notes: [{ pitch, beats: 4 }] },
    { clef, names: false, fingers: false, measuresPerPage: 1, pxPerBeat: 30 },
  );
  sv.el.classList.add('staff-mini');
  return sv.el;
}
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { FINGER_NAMES, handDiagram } from '../components/handDiagram';
import type { Hand } from '../../piano/fingering';

/** Hình bàn tay sáng đúng ngón + số ngón to + tên ngón. */
function fingerRow(finger: number, hand: Hand): HTMLElement {
  const d = handDiagram(hand);
  d.set(finger);
  return h(
    'div',
    { class: `finger-row hand-${hand.toLowerCase()}` },
    d.el,
    h(
      'div',
      { class: 'finger-text' },
      h('div', { class: 'finger-big' }, `Ngón ${finger}`, handTag(hand)),
      h('div', { class: 'finger-name' }, FINGER_NAMES[finger]),
    ),
  );
}

export interface PracticeHooks {
  record(target: Target, result: ParentResult): void;
  /** MIC_ASSESSMENT — lưu riêng, không trộn với PARENT */
  recordMic(target: Target, info: { firstHeard: string; wrongCount: number }): void;
  amendLast(result: ParentResult, source: ResultSource): void;
  onComplete(): void;
  onExit(): void;
}

/**
 * Màn "Từng nốt" (§4) — điều khiển hoàn toàn bằng PracticeStateMachine (§5).
 * Thứ tự hiển thị: NỐT → NGÓN → ÂM MẪU → HÀNH ĐỘNG. Tối đa 4 nút.
 */
export function practiceScreen(app: App, seg: Segment, hooks: PracticeHooks) {
  return (root: HTMLElement) => {
    const settings = app.store.settings;
    const sm = new PracticeStateMachine(seg.targets.length, {
      autoAdvance: settings.autoAdvance,
      autoAdvanceDelaySec: settings.autoAdvanceDelaySec,
      micAutoNext: settings.micAutoNext,
    });

    // --- Micro: theo dõi lượt hiện tại ---
    let heardKeys = new Set<string>();
    let seqPos = 0;
    let firstHeard: string | null = null;
    let wrongCount = 0;
    let micForIndex = -1;
    const micOn = () => app.mic.state === 'on';
    /** Đã đọc gợi ý cho nốt thứ mấy (chỉ đọc khi sang nốt MỚI) */
    let spokenIndex = -1;
    /** Đếm im lặng khi micro đang chờ bé đàn */
    let quietSince = Date.now();
    let silenceShown = false;
    let lastHintSpokenAt = 0;
    /** Số nốt liên tiếp đúng ngay lần đầu (để mừng mốc 3, 6, 9…) */
    let firstTryRun = 0;
    /** Số nốt đúng liền nhau (kể cả sau khi thử lại) — mốc 5, 10… = câu "nạp năng lượng" */
    let correctRun = 0;
    /** Câu "nạp năng lượng" đang đọc — tự chuyển nốt chờ đọc xong */
    let powerSpeech: Promise<void> | null = null;
    // Buổi học đang mở (chưa xong) — để biết đây có phải phần đầu tiên của buổi không
    const openSession = [...app.store.get().sessions].reverse().find((s) => !s.completed) ?? null;
    const skipReady = !!openSession && readySessionId === openSession.id;
    const reviewIntro = seg.step === 'Ôn nhanh' ? pick(REVIEW_INTROS) : null;
    const segIntro = reviewIntro ?? seg.intro;
    const resetMicTurn = (index: number) => {
      if (micForIndex === index) return;
      micForIndex = index;
      heardKeys = new Set();
      seqPos = 0;
      firstHeard = null;
      wrongCount = 0;
    };
    /**
     * Đọc to rồi "xóa trí nhớ" micro: micro KHÔNG tự bỏ qua giọng đọc (chỉ bỏ qua tiếng đàn của app) →
     * nốt nghe được trong lúc đọc bị bỏ qua (speechBusy) và bộ theo dõi nốt được đặt lại sau khi đọc xong.
     */
    const say = (text: string): Promise<void> =>
      speak(app, text).then(() => {
        if (micOn()) window.setTimeout(() => app.mic.resetTracker(), SPEECH_TAIL_MS);
      });
    const micHint = (text: string, kind: 'listen' | 'wrong' | 'good' = 'listen', spoken = false) => {
      const el = stage.querySelector<HTMLElement>('.mic-hint');
      if (!el) return;
      el.textContent = text;
      el.dataset.kind = kind;
      // Lời nhắc khi đàn nhầm: đọc to (bé đọc chậm), nhưng không dồn dập — tối đa 1 câu / 5 giây
      if (spoken && Date.now() - lastHintSpokenAt > 5000) {
        lastHintSpokenAt = Date.now();
        void say(text);
      }
    };
    const lhOn = leftHandActive(app.store.get());
    const [kbLow, kbHigh] = keyboardRangeFor(seg.targets.flatMap((t) => t.keys));
    const segFingers = new Map<number, { finger: number; hand: Hand }>();
    for (const t of seg.targets) {
      t.keys.forEach((k, i) => {
        const f = t.fingers?.[i] ?? (t.keys.length === 1 ? t.finger : undefined);
        if (f && !segFingers.has(pitchToMidi(k))) segFingers.set(pitchToMidi(k), { finger: f, hand: t.hand ?? 'RH' });
      });
    }
    const kb = new PianoKeyboard({
      low: kbLow,
      high: kbHigh,
      labels: 'c',
      // Số ngón theo chính bài này (thế Sol, thế Rê…), nếu không có thì theo thế Đô
      fingerOnPress: (p) => segFingers.get(pitchToMidi(p)) ?? fingerOnKeyboard(p, lhOn),
      onPress: (p) => void app.audio.playPitch(p),
    });
    const overlay = new HandOverlay(kb);
    /** Số lần "Thử lại" cho từng nốt — để biết khi nào cần thầy đàn mẫu lại */
    const retries = new Map<number, number>();
    /** Micro nghe sai 3 lần → bàn tay mờ hiện đúng chỗ (không phát tiếng, để micro vẫn nghe bé) */
    const showHelpHand = (t: Target) => {
      t.keys.forEach((k, i) => {
        const f = fingerOf(t, k, i);
        if (f) overlay.place(t.hand ?? 'RH', k, f, true);
      });
      overlay.setGhost(true);
      const first = t.keys[0];
      const f0 = fingerOf(t, first, 0);
      if (f0) overlay.press(t.hand ?? 'RH', f0, 1500);
      micHint('🎤 Nhìn bàn tay mờ: ngón này đặt ở phím đang sáng nhé', 'wrong');
    };
    /** Micro bật mà im lặng lâu: có thể đàn quá nhỏ / micro xa → chỉ cách, không để bé ngồi chờ mãi */
    const showSilenceHelp = () => {
      micHint('🎤 App chưa nghe thấy — con đàn to hơn, hoặc nhờ bố mẹ bấm 👪 Đúng rồi', 'wrong');
      lastHintSpokenAt = Date.now();
      void say('App chưa nghe thấy. Con đàn to hơn, hoặc nhờ bố mẹ bấm Đúng rồi nhé.');
    };
    /** Câu đọc khi sang nốt mới — thật ngắn: "Đô, ngón 1". */
    const noteSpeech = (t: Target): string => {
      const f = t.keys.length === 1 && !t.sequence ? t.finger : undefined;
      if (f) return `${viName(t.keys[0])}, ngón ${f}${t.hand === 'LH' ? ', tay trái' : ''}`;
      return `${plainTitle(t)}. ${t.subtitle ?? ''}`;
    };
    /** Lời khen nói rõ con vừa làm đúng điều gì. */
    const praiseTitle = (t: Target): string => {
      if (t.keys.length === 0) return pick(PRAISE);
      if (t.keys.length === 1 && !t.sequence) {
        return t.finger ? `Đúng ${viName(t.keys[0])} — ngón ${t.finger}!` : `Đúng ${viName(t.keys[0])}!`;
      }
      return `Đúng rồi — ${plainTitle(t)}!`;
    };
    const skipOffered = (index: number) =>
      (retries.get(index) ?? 0) >= SKIP_AFTER_RETRIES || (micForIndex === index && wrongCount >= SKIP_AFTER_MIC_WRONG);
    const skipButton = () => button({ icon: '⏭', label: 'Bỏ qua — mai ôn lại', onTap: () => send('SKIP') });
    /** Đúng một nốt: chuông; 3 nốt liền đúng ngay lần đầu → pháo giấy + câu mừng riêng. */
    const celebrateCorrect = (firstTry: boolean) => {
      void app.audio.chime();
      firstTryRun = firstTry ? firstTryRun + 1 : 0;
      correctRun++;
      if (firstTryRun > 0 && firstTryRun % 3 === 0) {
        confetti(30);
        const title = stage.querySelector('.title');
        if (title) title.textContent = `${firstTryRun} nốt đúng liền! 🎉`;
      }
      // Mỗi 5 nốt đúng liền nhau: Bé Nốt "nạp năng lượng" — một câu vui (hiện + đọc to)
      if (correctRun % POWER_EVERY === 0) {
        const line = pick(POWER_UPS);
        const lead = stage.querySelector('.lead');
        if (lead) {
          lead.textContent = line;
          lead.classList.add('power-up');
        }
        stage.querySelector('.hero-mascot')?.classList.add('powered');
        powerSpeech = say(line.replace(/^\P{L}+/u, ''));
      }
    };
    let demo: { cancel: () => void; done: Promise<void> } | null = null;
    const fingerOf = (t: Target, pitch: string, i = t.keys.indexOf(pitch)) =>
      t.fingers?.[i] ?? fingerFor(pitch, t.hand ?? 'RH', true);
    const stage = h('div', { class: 'stage scrollable' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, h('div', { class: 'keyboard-wrap' }, kb.el), bar));

    /** Tăng mỗi lần vẽ lại → mọi tác vụ async cũ tự hủy. */
    let token = 0;
    const target = () => seg.targets[sm.snapshot.index];
    const send = (type: PracticeEvent['type']) => sm.send({ type });
    const later = (fn: () => void, ms = 0) => {
      const tk = token;
      window.setTimeout(() => tk === token && fn(), ms);
    };

    const progress = () =>
      h('div', { class: 'progress' }, `${sm.snapshot.index + 1} / ${sm.snapshot.total}`);

    const micRow = (t: Target) =>
      micOn() && t.keys.length > 0
        ? h(
            'div',
            { class: 'mic-row' },
            h('div', { class: 'mic-level' }, h('span', { class: 'mic-level-bar' })),
            h('div', { class: 'mic-hint', dataset: { kind: 'listen' } }, '🎤 Nghe mẫu xong rồi con đàn nhé'),
          )
        : null;

    const fingerView = (t: Target) =>
      t.sequence
        ? h(
            'div',
            { class: `finger-big hand-${(t.hand ?? 'RH').toLowerCase()}` },
            'Ngón ' + t.keys.map((k) => fingerOf(t, k) ?? '?').join(' – '),
            handTag(t.hand ?? 'RH'),
          )
        : t.finger
          ? t.staff
            ? h('div', { class: `finger-big hand-${(t.hand ?? 'RH').toLowerCase()}` }, `Ngón ${t.finger}`, handTag(t.hand ?? 'RH'))
            : fingerRow(t.finger, t.hand ?? 'RH')
          : t.emoji
            ? h('div', { class: 'finger-big' }, t.emoji)
            : null;

    const noteView = (t: Target) =>
      t.staff
        ? // Tuần 7: khuông nhạc bên trái, tên + ngón bên phải
          h(
            'div',
            { class: 'note-view staff-row' },
            progress(),
            miniStaff(t.keys[0], t.clef ?? (t.hand === 'LH' ? 'bass' : 'treble')),
            h(
              'div',
              { class: 'staff-text' },
              h('div', { class: 'note-big' }, t.title, speakChip(app, () => noteSpeech(t))),
              fingerView(t),
              t.subtitle ? h('div', { class: 'note-sub' }, t.subtitle) : null,
              micRow(t),
            ),
          )
        : h(
            'div',
            { class: 'note-view' },
            progress(),
            h('div', { class: 'note-big' }, t.title, speakChip(app, () => noteSpeech(t))),
            fingerView(t),
            t.subtitle ? h('div', { class: 'note-sub' }, t.subtitle) : null,
            micRow(t),
          );

    const showTargetOnKeyboard = (t: Target) => {
      kb.setResult(null, null);
      kb.setTargets(
        t.keys.map((pitch) => ({
          pitch,
          hand: t.hand ?? 'RH',
          finger: t.keys.length === 1 ? t.finger : t.sequence || t.fingers ? fingerOf(t, pitch) : undefined,
        })),
      );
      kb.setGuides(t.guides ?? []);
    };

    function render(): void {
      token++;
      cancelSpeech(); // đổi bước → thôi đọc câu cũ (không nói chồng lên âm mẫu / lời khen)
      if (demo) {
        demo.cancel();
        demo = null;
      }
      overlay.hide();
      const snap = sm.snapshot;
      stage.replaceChildren();
      bar.replaceChildren();
      const back = backButton(() => send('BACK'));

      switch (snap.state) {
        case 'INTRO': {
          kb.clear();
          const events = eventsFromTargets(seg.targets);
          const caption = h('div', { class: 'demo-caption' }, events.length ? '🎬 Xem thầy đàn mẫu…' : '');
          const introText = `${seg.title}. ${segIntro}`;
          stage.append(
            h(
              'div',
              { class: 'intro-kicker-row' },
              h('div', { class: 'intro-mascot' }, mascot(pick([...INTRO_MOODS]), 64)),
              // Ôn nhanh không phải điều MỚI → bỏ các câu "… mới!"
              h('div', { class: 'intro-kicker' }, pick(seg.step === 'Ôn nhanh' ? KICKERS.filter((k) => !k.includes('mới')) : KICKERS)),
              h('div', { class: 'step-tag' }, seg.step),
            ),
            h('h1', { class: 'title' }, seg.title),
            h('p', { class: 'lead' }, segIntro, speakChip(app, introText)),
            caption,
          );
          // "Video minh họa": bàn tay hoạt hình đàn mẫu cả phần bài này, tự phát khi mở
          let introStarted = false;
          const playIntro = () => {
            introStarted = true;
            cancelSpeech();
            demo?.cancel();
            kb.clear();
            overlay.setGhost(false);
            const tk = token;
            demo = playDemo(app.audio, kb, overlay, events, { onCaption: (t) => (caption.textContent = `🎬 ${t}`) });
            void demo.done.then(() => {
              if (tk !== token) return;
              demo = null;
              caption.textContent = '✅ Xem xong — đến lượt con!';
            });
          };
          // Đọc lời giới thiệu trước, xong mới đàn mẫu (không nói chồng lên tiếng đàn)
          const startDemo = () => {
            if (events.length && !introStarted) playIntro();
          };
          if (voiceOn(app)) {
            const tk = token;
            void say(introText).then(() => tk === token && later(startDemo, 300));
          } else later(startDemo, 500);
          bar.append(back);
          if (events.length) bar.append(button({ icon: '🎬', label: 'Xem lại', onTap: playIntro }));
          bar.append(
            button({
              icon: '▶',
              label: skipReady ? 'Bắt đầu' : 'Tiếp',
              kind: 'primary',
              // Phần thứ 2 trở đi của buổi: bỏ màn "Con sẵn sàng chưa?" — chạm này cũng là thao tác bật micro
              onTap: skipReady
                ? async () => {
                    await app.ensureMic();
                    if (sm.snapshot.state !== 'INTRO') return;
                    send('NEXT');
                    send('NEXT');
                  }
                : () => send('NEXT'),
            }),
          );
          break;
        }

        case 'READY':
          if (openSession) readySessionId = openSession.id;
          kb.clear();
          stage.append(
            h('div', { class: 'hero-emoji' }, '🙌'),
            h('h1', { class: 'title' }, 'Con sẵn sàng chưa?'),
            h('p', { class: 'lead' }, 'Ngồi thẳng, tay tròn, nhìn lên iPad'),
          );
          bar.append(
            back,
            button({
              icon: '▶',
              label: 'Bắt đầu',
              kind: 'primary',
              // Chạm "Bắt đầu" = thao tác người dùng → được phép bật micro
              onTap: async () => {
                await app.ensureMic();
                send('NEXT');
              },
            }),
          );
          break;

        case 'SHOW_NOTE':
        case 'PLAY_SAMPLE':
        case 'WAIT_PARENT': {
          const t = target();
          // Mỗi lần vào lại một nốt (kể cả sau "Thử lại"/"Sửa") đều bắt đầu lượt nghe mới
          if (snap.state === 'SHOW_NOTE') micForIndex = -1;
          resetMicTurn(snap.index);
          showTargetOnKeyboard(t);
          stage.append(noteView(t));
          const waiting = snap.state === 'WAIT_PARENT';
          if (waiting && micOn() && t.keys.length > 0) {
            app.mic.resetTracker();
            micHint(t.keys.length > 1 ? '🎤 Đang nghe… đàn từng phím đang sáng' : '🎤 Đang nghe… con đàn đi!');
            quietSince = Date.now();
            silenceShown = false;
          }
          // Nốt khó (nhiều lần thử): cho phép bỏ qua, nốt được ghi "Thử lại" để buổi sau ôn
          if (waiting && skipOffered(snap.index)) stage.append(h('div', { class: 'skip-row' }, skipButton()));
          const hasSample = (t.sample?.length ?? 0) > 0;
          bar.append(back);
          if (hasSample) {
            bar.append(button({ icon: '🔊', label: 'Nghe lại', disabled: !waiting, onTap: () => send('REPLAY') }));
          }
          bar.append(
            button({ icon: '👪', label: 'Đúng rồi', kind: 'good', disabled: !waiting, onTap: () => send('CORRECT') }),
            button({ icon: '↻', label: 'Thử lại', kind: 'retry', disabled: !waiting, onTap: () => send('RETRY') }),
          );
          if (snap.state === 'SHOW_NOTE') {
            // Nốt MỚI: đọc "Đô, ngón 1" trước, rồi mới phát âm mẫu
            if (spokenIndex !== snap.index && voiceOn(app)) {
              spokenIndex = snap.index;
              const tk = token;
              void say(noteSpeech(t)).then(() => tk === token && later(() => send('SHOWN'), 200));
            } else later(() => send('SHOWN'), 450);
          }
          break;
        }

        case 'RESULT': {
          const ok = snap.lastResult === 'correct';
          const byMic = snap.lastSource === 'mic';
          const countdown = h('div', { class: 'countdown' });
          const tries = retries.get(snap.index) ?? 0;
          const needHelp = !ok && tries >= 2;
          const t0 = target();
          stage.append(
            // Đúng: Bé Nốt nhảy cẫng lên. Thử lại: Bé Nốt gãi đầu suy nghĩ (không buồn, không nhíu mày) — sai là một phần của học
            h('div', { class: `hero-mascot ${ok ? 'react-bounce' : 'react-scratch'}` }, mascot(ok ? 'cheer' : 'think', 110)),
            h('h1', { class: 'title' }, ok ? praiseTitle(t0) : needHelp ? 'Mình xem thầy làm nhé!' : 'Thử lại nhé'),
            h(
              'p',
              { class: 'lead' },
              ok
                ? byMic
                  ? pick(['🎤 App nghe con đàn đúng rồi!', '🎤 Tai rô-bốt nghe rõ: đúng rồi!'])
                  : t0.finger && t0.keys.length === 1
                    ? pick(FINGER_SUB(t0.finger))
                    : pick(PRAISE_SUB)
                : needHelp
                  ? 'Nhìn ngón tay của thầy, rồi con làm theo'
                  : // Một nốt: nói rõ tìm phím nào, ngón nào (thay vì câu chung chung lặp lại tiêu đề)
                    t0.keys.length === 1 && t0.finger && !t0.staff
                    ? `Tìm ${plainTitle(t0)} — phím đang sáng, ngón ${t0.finger} nhé`
                    : pick(RETRY_SUB),
            ),
            countdown,
          );
          // Trợ giúp thích ứng: sai từ 2 lần trở lên → thầy đàn mẫu lại nốt này (không mờ)
          if (needHelp) {
            const t = target();
            const events = eventsFromTargets([t]);
            if (events.length) {
              later(() => {
                overlay.setGhost(false);
                demo = playDemo(app.audio, kb, overlay, events, { onCaption: (c) => (countdown.textContent = `🎬 ${c}`) });
              }, 600);
            }
          }
          bar.append(
            back,
            button({ icon: '👪', label: 'Bố mẹ sửa', onTap: () => send('EDIT') }),
            // (`tries` chưa tính lần "Thử lại" vừa bấm — hiệu ứng ghi chạy sau khi vẽ)
            !ok && tries + 1 >= SKIP_AFTER_RETRIES ? skipButton() : '',
            ok
              ? button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => send('CONTINUE') })
              : button({ icon: '↻', label: 'Thử lại', kind: 'primary', onTap: () => send('CONTINUE') }),
          );
          break;
        }

        case 'NEXT_NOTE':
          later(() => send('NEXT'));
          break;

        case 'COMPLETE':
        case 'EXIT':
          break;
      }
    }

    async function runEffect(ef: PracticeEffect): Promise<void> {
      switch (ef.type) {
        case 'playSample': {
          const t = seg.targets[ef.index];
          const tk = token;
          if (t.sample?.length) {
            // Âm mẫu kèm bàn tay hoạt hình (mờ) nhấn đúng ngón — như một video ngắn cho từng nốt
            overlay.setGhost(true);
            const d = playDemo(app.audio, kb, overlay, eventsFromTargets([{ ...t, keys: t.sample }]));
            demo = d;
            await d.done;
            if (demo === d) demo = null;
            if (tk === token) {
              overlay.hide();
              showTargetOnKeyboard(t);
            }
          }
          if (tk === token && sm.snapshot.state === 'PLAY_SAMPLE') send('SAMPLE_END');
          break;
        }
        case 'stopAudio':
          app.audio.stopAll();
          break;
        case 'record':
          hooks.record(seg.targets[ef.index], ef.result);
          if (ef.result === 'retry') {
            retries.set(ef.index, (retries.get(ef.index) ?? 0) + 1);
            firstTryRun = 0;
            correctRun = 0;
          }
          if (ef.result === 'correct') celebrateCorrect(!retries.get(ef.index) && wrongCount === 0);
          break;
        case 'recordMic':
          hooks.recordMic(seg.targets[ef.index], { firstHeard: firstHeard ?? '', wrongCount });
          celebrateCorrect(!retries.get(ef.index) && wrongCount === 0);
          break;
        case 'amendLast':
          hooks.amendLast(ef.result, ef.source);
          break;
        case 'startAutoAdvance': {
          // Chỉ đếm sau khi âm mẫu kết thúc (§5).
          const tk = token;
          await app.audio.whenIdle();
          // Câu "nạp năng lượng" đang đọc → đọc xong mới sang nốt
          if (powerSpeech) {
            const p = powerSpeech;
            powerSpeech = null;
            await p;
          }
          // Đúng → ~1,5 giây là sang nốt (bé không phải chờ / bấm "Tiếp" sau mỗi nốt đúng)
          const total = sm.snapshot.lastResult === 'correct' ? Math.min(ef.delaySec, CORRECT_ADVANCE_SEC) : ef.delaySec;
          let left = total;
          while (left > 0) {
            if (tk !== token) return;
            const el = stage.querySelector('.countdown');
            if (el) el.textContent = total < 2 ? 'Sang nốt tiếp…' : `Tự chuyển sau ${Math.ceil(left)} giây…`;
            const step = Math.min(1, left);
            await new Promise((r) => setTimeout(r, step * 1000));
            left -= step;
          }
          if (tk === token) send('AUTO_ADVANCE');
          break;
        }
        case 'cancelAutoAdvance':
          break; // token đã tăng khi vẽ lại → bộ đếm cũ tự dừng
        case 'complete':
          // Xong cả phần → đây mới là lúc pháo giấy
          if (seg.targets.length >= 3) confetti(40);
          window.setTimeout(hooks.onComplete, 0);
          break;
        case 'exit':
          window.setTimeout(hooks.onExit, 0);
          break;
      }
    }

    // Micro nghe được một nốt trên đàn cơ
    const unNote = app.mic.onNote((n) => {
      if (sm.snapshot.state !== 'WAIT_PARENT') return;
      // Giọng đọc đang phát (hoặc vừa dứt): micro có thể "nghe" giọng nói thành nốt → bỏ qua
      if (speechBusy()) return;
      const t = target();
      if (t.keys.length === 0) return;
      const heard = midiToPitch(n.midi);
      firstHeard ??= heard;
      if (t.sequence) {
        // Nhại lại: phải đúng THỨ TỰ; sai giữa chừng thì làm lại từ đầu (nhẹ nhàng)
        const want = t.keys[seqPos];
        if (samePitch(heard, want)) {
          seqPos++;
          kb.setResult(heard, 'good');
          if (seqPos >= t.keys.length) send('HEARD');
          else micHint(`🎤 Đúng rồi! Tiếp theo…`, 'good');
        } else {
          wrongCount++;
          if (wrongCount === 3) showHelpHand(t);
          if (wrongCount === SKIP_AFTER_MIC_WRONG) offerSkipInline();
          seqPos = samePitch(heard, t.keys[0]) ? 1 : 0;
          kb.setResult(heard, 'heard');
          micHint(`🎤 Gần đúng! Đàn lại từ ${noteLabel(t.keys[0]).split(' / ')[0]} nhé`, 'wrong', true);
        }
        return;
      }
      if (t.keys.length >= 2) {
        // HỢP ÂM: hỏi micro trong tiếng vừa đàn có ĐỦ các nốt không (kiểm tra theo nốt cần đàn) —
        // mỗi lần gõ phím chỉ hỏi một lần; không kết luận được (tiếng nhỏ / ồn) → cách cũ (micChordLegacy)
        const at = n.at ?? -1;
        if (at >= 0 && Math.abs(at - chordAskedAt) < 0.05) return;
        chordAskedAt = at;
        const tk = token;
        void app.mic.verifyChord(t.keys.map(pitchToMidi), at >= 0 ? at : undefined).then((r) => {
          if (tk !== token || sm.snapshot.state !== 'WAIT_PARENT' || target() !== t) return;
          if (!r || !r.conclusive) return micChordLegacy(t, n.midi);
          if (r.missing.length === 0) {
            t.keys.forEach((k) => heardKeys.add(k));
            send('HEARD');
            return;
          }
          // Thiếu nốt: chỉ ra phím đã nghe được + nhắc nhẹ nốt bị quên (không tính là sai)
          r.present.forEach((m) => kb.setResult(midiToPitch(m), 'good'));
          const names = r.missing.map((m) => noteLabel(midiToPitch(m)).split(' / ')[0]).join(', ');
          micHint(`🎤 Con quên nốt ${names} — đàn cùng lúc cả ${t.keys.length} phím nhé`, 'wrong', true);
        });
        return;
      }
      micChordLegacy(t, n.midi);
    });
    /** Lần gõ phím đã hỏi kiểm tra hợp âm (đồng hồ AudioContext) — một lần gõ có thể cho nhiều nốt nghe được */
    let chordAskedAt = -1;
    /** Cách cũ: so nốt micro nghe được với các phím cần đàn (hợp âm: nốt trầm "chung" cũng tính — match.ts). */
    function micChordLegacy(t: Target, midi: number): void {
      const heard = midiToPitch(midi);
      const match = t.keys.find((k) => samePitch(k, heard));
      if (!match && matchHeard(midi, t.keys.map(pitchToMidi)) === 'chord') {
        // Bấm cả hợp âm cùng lúc: micro nghe ra nốt trầm chung của hợp âm → tính là đủ các phím
        t.keys.forEach((k) => heardKeys.add(k));
        send('HEARD');
        return;
      }
      if (match) {
        heardKeys.add(match);
        kb.setResult(heard, 'good');
        if (t.keys.every((k) => heardKeys.has(k))) send('HEARD');
        else micHint(`🎤 Đúng rồi! Còn ${t.keys.length - heardKeys.size} phím nữa`, 'good');
      } else {
        // Hợp âm: micro hay nghe lẫn khi các nốt chưa đều tay → không tính là sai
        if (t.keys.length < 2) wrongCount++;
        kb.setResult(heard, 'heard');
        if (wrongCount === 3) showHelpHand(t);
        if (wrongCount === SKIP_AFTER_MIC_WRONG) offerSkipInline();
        // Không có âm thanh/chữ tiêu cực — chỉ nhắc nhẹ phím vừa nghe (§10); đọc to vài lần đầu
        const want = t.keys.length === 1 ? noteLabel(t.keys[0]).split(' / ')[0] : 'phím đang sáng';
        micHint(`🎤 Con vừa đàn ${noteLabel(heard).split(' / ')[0]} — tìm ${want} nhé`, 'wrong', wrongCount <= 3);
      }
    }
    // Thanh âm lượng: cho bé/bố mẹ thấy app "đang nghe"
    const unFrame = app.mic.onFrame((f) => {
      const pct = meterPct(f);
      const bar = stage.querySelector<HTMLElement>('.mic-level-bar');
      if (bar) bar.style.width = `${pct}%`;
      // Đếm im lặng: chỉ khi đang chờ bé đàn; tiếng app / giọng đọc / tiếng đàn đủ to đều đặt lại đồng hồ
      if (sm.snapshot.state !== 'WAIT_PARENT' || target().keys.length === 0) return;
      const now = Date.now();
      if (pct >= 30 || f.app !== 'quiet' || speechBusy()) quietSince = now;
      else if (!silenceShown && now - quietSince > SILENCE_HELP_MS) {
        silenceShown = true;
        showSilenceHelp();
      }
    });
    /** Micro nghe sai nhiều lần ngay khi đang chờ → hiện nút "Bỏ qua" (không cần vẽ lại cả màn) */
    function offerSkipInline(): void {
      if (stage.querySelector('.skip-row')) return;
      stage.append(h('div', { class: 'skip-row' }, skipButton()));
    }

    const unsub = sm.subscribe((_s, effects) => {
      render();
      effects.forEach((ef) => void runEffect(ef));
    });
    render();

    return () => {
      token++;
      cancelSpeech();
      unsub();
      unNote();
      unFrame();
      demo?.cancel();
      overlay.destroy();
      kb.destroy();
    };
  };
}
