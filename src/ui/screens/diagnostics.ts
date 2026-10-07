/**
 * 🩺 KIỂM TRA IPAD (màn của phụ huynh — chỉ mở từ màn Phụ huynh, đã qua cổng phụ huynh).
 *
 * Bảng kiểm sống ✅/⚠️/❌ cho 7 mục: Thiết bị · Âm thanh · Giọng đọc · Micro · Lưu trữ · Không cần mạng · Hiệu năng.
 * Mỗi dòng: một câu giải thích + cách khắc phục. Bố mẹ bấm "Phát thử" / "Nghe thử" rồi trả lời nghe rõ hay không,
 * viết góp ý (không bắt buộc), bấm "📤 Gửi kết quả" → bảng Chia sẻ (Zalo / Tin nhắn…) → không có thì sao chép
 * → không được nữa thì hiện đoạn chữ để tự chọn và sao chép.
 *
 * Mọi phép đo đều bọc try/catch + kiểm tra tính năng (iPadOS 15: không có permissions 'microphone',
 * outputLatency; danh sách giọng nạp ngầm — chờ tối đa 1,5 giây). Logic thuần: src/pwa/diagnostics.ts.
 */
import { loadMicLog } from '../../audio/micLogStore';
import { cancelSpeech } from '../../audio/voice';
import { buildSessionPlan, weekPlan } from '../../lessons/lessonEngine';
import { isStandalone } from '../../progress/backup';
import { completedSessionCount, parentStats, sessionCount } from '../../progress/history';
import {
  STATUS_ICON,
  composeReport,
  countStatus,
  diagSections,
  micCheckFromLog,
  type DiagRow,
  type DiagSection,
  type DiagSnapshot,
} from '../../pwa/diagnostics';
import { APP_VERSION, isUpdateReady } from '../../pwa/updater';
import type { App, Screen } from '../App';
import { actionBar, backButton, button, h, toast } from '../components/dom';
import { lazy, lazyScreen } from '../lazy';
import { parentScreen } from './parent';
import { readiness, tonightPlan } from './tonight';
import '../../styles/parentux.css';
import '../../styles/diagnostics.css';

const micTestMod = lazy(() => import('./micTest'));
const micTestScreen = (app: App): Screen => lazyScreen(micTestMod, (m) => m.micTestScreen(app));

const VOICE_WAIT_MS = 1500;
const PERM_WAIT_MS = 1200;
const CACHE_PREFIX = 'piano-be-9-';

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Mọi phép đo: lỗi bất ngờ → giá trị dự phòng (màn không bao giờ hỏng vì một mục). */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function synth(): SpeechSynthesis | null {
  return safe(() => (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null), null);
}

const isVi = (v: SpeechSynthesisVoice) => safe(() => v.lang.toLowerCase().replace('_', '-').startsWith('vi'), false);

/** Danh sách giọng: Safari nạp ngầm → hỏi lại mỗi 250 ms, tối đa 1,5 giây. */
async function loadVoices(): Promise<{ list: SpeechSynthesisVoice[]; loaded: boolean }> {
  const s = synth();
  if (!s) return { list: [], loaded: true };
  const get = () => safe(() => s.getVoices() ?? [], [] as SpeechSynthesisVoice[]);
  const t0 = Date.now();
  let list = get();
  while (!list.length && Date.now() - t0 < VOICE_WAIT_MS) {
    await wait(250);
    list = get();
  }
  return { list, loaded: true };
}

type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

/** Quyền micro — iPadOS < 16 không cho hỏi 'microphone' (ném lỗi) → 'unknown'. */
async function micPermission(onChange: (p: PermState) => void): Promise<PermState> {
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms || typeof perms.query !== 'function') return 'unknown';
    const r = await Promise.race([perms.query({ name: 'microphone' as PermissionName }), wait(PERM_WAIT_MS).then(() => null)]);
    if (!r) return 'unknown';
    const norm = (x: string): PermState => (x === 'granted' || x === 'denied' || x === 'prompt' ? x : 'unknown');
    try {
      r.onchange = () => onChange(norm(r.state));
    } catch {
      /* bỏ qua */
    }
    return norm(r.state);
  } catch {
    return 'unknown';
  }
}

async function persisted(): Promise<boolean | null> {
  try {
    const st = (navigator as Navigator & { storage?: StorageManager }).storage;
    if (typeof st?.persisted !== 'function') return null;
    return await Promise.race([st.persisted(), wait(PERM_WAIT_MS).then(() => null)]);
  } catch {
    return null;
  }
}

async function cacheNames(): Promise<string[] | null> {
  try {
    if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return null;
    const keys = await Promise.race([caches.keys(), wait(PERM_WAIT_MS).then(() => null)]);
    return keys ? keys.filter((k) => k.startsWith(CACHE_PREFIX)) : null;
  } catch {
    return null;
  }
}

export function diagnosticsScreen(app: App) {
  return (root: HTMLElement) => {
    const store = app.store;
    let alive = true;

    const audioInfo = (): DiagSnapshot['audio'] => {
      const ctx = safe(() => app.audio.context as (AudioContext & { baseLatency?: number; outputLatency?: number }) | null, null);
      const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
      return {
        supported: safe(() => 'AudioContext' in window || 'webkitAudioContext' in window, false),
        state: ctx ? safe(() => String(ctx.state), null) : null,
        sampleRate: ctx ? num(safe(() => ctx.sampleRate, null)) : null,
        baseLatency: ctx ? num(safe(() => ctx.baseLatency, null)) : null,
        outputLatency: ctx ? num(safe(() => ctx.outputLatency, null)) : null,
        heard: snap?.audio.heard ?? null,
      };
    };
    const micInfo = (): DiagSnapshot['mic'] => {
      const st = store.settings;
      return {
        getUserMedia: safe(() => typeof navigator.mediaDevices?.getUserMedia === 'function', false),
        secure: safe(() => window.isSecureContext !== false, true),
        permission: snap?.mic.permission,
        state: safe(() => app.mic.state, 'off'),
        enabled: st.micEnabled,
        sensitivity: st.micSensitivity,
        tuningCents: st.micTuningCents,
        latencyMs: st.micLatencyMs,
        lastCheck: safe(() => micCheckFromLog(loadMicLog()), null),
      };
    };
    const storageInfo = (): DiagSnapshot['storage'] => {
      const d = store.get();
      const ss = safe(() => store.storageStatus(), null);
      return {
        text: ss?.text ?? 'không đọc được',
        percent: ss?.percent ?? 0,
        ok: ss?.ok ?? true,
        full: ss?.full ?? false,
        persisted: snap?.storage.persisted,
        lastBackupAt: d.settings.lastBackupAt ?? 0,
        sessions: safe(() => sessionCount(d), 0),
        completed: safe(() => completedSessionCount(d), 0),
        curriculumRev: d.curriculumRev,
        week: d.progress.currentWeek,
      };
    };

    let snap: DiagSnapshot | null = null;
    snap = {
      at: Date.now(),
      appVersion: APP_VERSION,
      ua: safe(() => navigator.userAgent, ''),
      maxTouchPoints: safe(() => navigator.maxTouchPoints || 0, 0),
      standalone: safe(isStandalone, false),
      screen: safe(
        () => ({ w: screen.width, h: screen.height, vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio || 1 }),
        { w: 0, h: 0, vw: 0, vh: 0, dpr: 1 },
      ),
      language: safe(() => navigator.language, ''),
      updateReady: safe(isUpdateReady, false),
      audio: audioInfo(),
      voice: {
        supported: !!synth(),
        loaded: false,
        viVoices: [],
        total: 0,
        enabled: store.settings.voice !== false,
        heard: null,
      },
      mic: micInfo(),
      storage: storageInfo(),
      offline: {
        swSupported: safe(() => 'serviceWorker' in navigator, false),
        controller: safe(() => !!navigator.serviceWorker?.controller, false),
        caches: undefined,
        online: safe(() => navigator.onLine !== false, true),
      },
      perf: {
        planMs: undefined,
        homeMs: undefined,
        cores: safe(() => navigator.hardwareConcurrency || null, null),
        memoryGB: safe(() => (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null, null),
      },
    };
    const s: DiagSnapshot = snap;

    // ---------- vẽ
    const summary = h('p', { class: 'diag-summary', 'aria-live': 'polite' });
    const rowLists = new Map<DiagSection['id'], HTMLElement>();

    const renderRow = (r: DiagRow): HTMLElement =>
      h(
        'li',
        { class: `diag-row ${r.status}`, dataset: { id: r.id } },
        h('span', { class: 'diag-icon', 'aria-hidden': 'true' }, STATUS_ICON[r.status]),
        h(
          'div',
          { class: 'diag-main' },
          h('p', { class: 'diag-head' }, h('b', {}, r.label), h('span', { class: 'diag-value' }, r.value)),
          h('p', { class: 'diag-explain' }, r.explain),
          r.tip ? h('p', { class: 'diag-tip' }, '💡 ' + r.tip) : null,
          r.steps ? h('ol', { class: 'diag-steps' }, ...r.steps.map((x) => h('li', {}, x))) : null,
        ),
      );

    const refresh = () => {
      if (!alive) return;
      s.audio = audioInfo();
      s.mic = micInfo();
      s.storage = storageInfo();
      s.offline.online = safe(() => navigator.onLine !== false, true);
      s.offline.controller = safe(() => !!navigator.serviceWorker?.controller, false);
      const sections = diagSections(s);
      for (const sec of sections) rowLists.get(sec.id)?.replaceChildren(...sec.rows.map(renderRow));
      const n = countStatus(sections);
      summary.textContent =
        `Tóm tắt: ${n.ok} ✅ ổn · ${n.warn} ⚠️ nên xem · ${n.bad} ❌ cần sửa` + (n.wait ? ` · ${n.wait} ⏳ đang kiểm tra…` : '');
    };

    /** Câu hỏi "Nghe rõ / Không nghe thấy" — hiện sau lần phát/đọc thử đầu tiên. */
    const askHeard = (set: (v: 'yes' | 'no') => void): HTMLElement => {
      const box = h(
        'div',
        { class: 'diag-ask' },
        h('span', {}, 'Bố mẹ có nghe thấy không?'),
        button({ icon: '👂', label: 'Nghe rõ', kind: 'good', onTap: () => (set('yes'), refresh()) }),
        button({ icon: '🔇', label: 'Không nghe thấy', kind: 'retry', onTap: () => (set('no'), refresh()) }),
      );
      box.hidden = true;
      return box;
    };

    // 🔊 Phát thử: Đô–Mi–Son–Đô
    const audioAsk = askHeard((v) => (s.audio.heard = v));
    let playing = false;
    const playTest = () => {
      if (playing) return;
      playing = true;
      cancelSpeech();
      // unlock() phải bắt đầu ngay trong thao tác chạm (iOS)
      void app.audio
        .unlock()
        .catch(() => false)
        .then(() => {
          refresh();
          return app.audio.playSequence(['C4', 'E4', 'G4', 'C5'], { duration: 0.55, gap: 0.05 });
        })
        .catch(() => undefined)
        .then(() => {
          playing = false;
          audioAsk.hidden = false;
          refresh();
        });
    };

    // 🗣️ Nghe thử giọng đọc (đọc thẳng bằng giọng tiếng Việt — kể cả khi bố mẹ đang tắt giọng đọc trong app)
    const voiceAsk = askHeard((v) => (s.voice.heard = v));
    const speakTest = () => {
      const sy = synth();
      if (!sy) return toast('iPad này không có giọng đọc');
      const vi = safe(() => sy.getVoices().filter(isVi), [] as SpeechSynthesisVoice[]);
      if (!vi.length) {
        toast('iPad chưa có giọng tiếng Việt — xem hướng dẫn cài ở mục Giọng đọc', 3200);
        return;
      }
      try {
        app.audio.stopAll();
        if (sy.speaking || sy.pending) sy.cancel();
        const u = new SpeechSynthesisUtterance('Chào con! Mình cùng học đàn nhé.');
        u.lang = 'vi-VN';
        u.voice = vi.find((v) => /linh/i.test(v.name)) ?? vi[0];
        u.rate = 0.95;
        sy.speak(u);
      } catch {
        toast('Chưa đọc được — thử lại nhé.');
      }
      voiceAsk.hidden = false;
    };

    const card = (id: DiagSection['id'], title: string, ...extra: (HTMLElement | null)[]): HTMLElement => {
      const list = h('ul', { class: 'diag-rows' });
      rowLists.set(id, list);
      return h('section', { class: 'card diag-card', dataset: { sec: id } }, h('h2', {}, title), list, ...extra);
    };

    // 📝 Góp ý + gửi
    const feedback = h('textarea', {
      class: 'diag-feedback',
      rows: '5',
      placeholder: 'Bé thích…\nBé thấy khó…\nMicro…\nGiọng đọc / âm thanh…',
      'aria-label': 'Góp ý của bố mẹ',
    }) as HTMLTextAreaElement;
    const childName = store.get().learner.name.trim();
    const nameBox = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const sendResult = h('div', { class: 'diag-send-result', 'aria-live': 'polite' });

    const send = async () => {
      s.at = Date.now();
      refresh();
      const text = composeReport(s, {
        feedback: feedback.value,
        childName: nameBox.checked ? childName : undefined,
        micLog: safe(loadMicLog, null),
      });
      const say = (t: string) => sendResult.replaceChildren(h('p', { class: 'lead' }, t));
      const nav = navigator as Navigator & { share?: (d: { text?: string; title?: string }) => Promise<void> };
      if (typeof nav.share === 'function') {
        try {
          await nav.share({ title: 'Piano bé — kiểm tra iPad', text });
          say('✅ Đã mở bảng Chia sẻ — chọn Zalo / Tin nhắn / Mail để gửi cho người hỗ trợ.');
          return;
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') {
            say('Đã đóng bảng Chia sẻ — chưa gửi. Bấm lại khi sẵn sàng.');
            return;
          }
          // lỗi khác → thử sao chép
        }
      }
      try {
        if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('no clipboard');
        await navigator.clipboard.writeText(text);
        say('✅ Đã sao chép kết quả — dán vào tin nhắn gửi người hỗ trợ.');
        return;
      } catch {
        /* hiện đoạn chữ */
      }
      const ta = h('textarea', { class: 'diag-report', readonly: '' }) as HTMLTextAreaElement;
      ta.value = text;
      sendResult.replaceChildren(h('p', { class: 'lead' }, 'Hãy chọn hết đoạn chữ bên dưới, bấm Sao chép rồi dán vào tin nhắn gửi người hỗ trợ.'), ta);
      try {
        ta.focus();
        ta.select();
      } catch {
        /* bỏ qua */
      }
    };
    const sendButton = () => button({ icon: '📤', label: 'Gửi kết quả cho người hỗ trợ', kind: 'primary', onTap: () => void send() });

    const scroller = h(
      'div',
      { class: 'parent scrollable diag' },
      h(
        'header',
        { class: 'diag-top' },
        h('h1', {}, '🩺 Kiểm tra iPad'),
        h('p', { class: 'muted' }, 'Bấm thử từng mục, rồi “📤 Gửi kết quả” cho người hỗ trợ. App không tự gửi gì đi đâu.'),
        summary,
      ),
      card('device', '📱 Thiết bị'),
      card('audio', '🔊 Âm thanh', h('div', { class: 'row' }, button({ icon: '🔊', label: 'Phát thử', kind: 'primary', onTap: playTest })), audioAsk),
      card('voice', '🗣️ Giọng đọc', h('div', { class: 'row' }, button({ icon: '🗣️', label: 'Nghe thử', kind: 'primary', onTap: speakTest })), voiceAsk),
      card(
        'mic',
        '🎤 Micro',
        h('div', { class: 'row' }, button({ icon: '🎤', label: 'Mở Cài micro (3 bước)', kind: 'primary', onTap: () => app.show(micTestScreen(app)) })),
      ),
      card('storage', '💾 Lưu trữ'),
      card('offline', '📶 Không cần mạng'),
      card('perf', '⚡ Hiệu năng'),
      h(
        'section',
        { class: 'card diag-card diag-send' },
        h('h2', {}, '📝 Góp ý của bố mẹ'),
        h('p', { class: 'muted' }, 'Không bắt buộc — vài dòng về bé và app (bé thích gì, chỗ nào khó, micro / giọng đọc có ổn không).'),
        feedback,
        childName
          ? h('label', { class: 'diag-name' }, nameBox, h('span', {}, `Kèm tên bé (“${childName}”) trong kết quả`))
          : null,
        h('p', { class: 'muted small' }, 'Kết quả chỉ gồm những gì hiện trên màn này + số liệu kỹ thuật; không có tên bé (trừ khi bố mẹ tích ô trên).'),
        h('div', { class: 'row' }, sendButton()),
        sendResult,
      ),
    );
    root.append(h('div', { class: 'screen diag-screen' }, scroller, actionBar(backButton(() => app.show(parentScreen(app))), sendButton())));
    refresh();

    // ---------- đo bất đồng bộ (mỗi phép đo xong là cập nhật dòng của nó)
    void loadVoices().then(({ list }) => {
      s.voice.loaded = true;
      s.voice.total = list.length;
      s.voice.viVoices = [...new Set(list.filter(isVi).map((v) => safe(() => v.name, '?')))];
      refresh();
    });
    const setPerm = (p: PermState) => {
      s.mic.permission = p;
      refresh();
    };
    void micPermission(setPerm).then(setPerm);
    void persisted().then((p) => {
      s.storage.persisted = p ?? app.storagePersisted ?? null; // compat-ok (thuộc tính của bảng đo, không phải API)
      refresh();
    });
    void cacheNames().then((c) => {
      s.offline.caches = c;
      refresh();
    });
    // Hiệu năng: đo sau khi màn đã vẽ (không làm chậm lúc mở)
    window.setTimeout(() => {
      if (!alive) return;
      try {
        const d = store.get();
        const lesson = weekPlan(d.progress.currentWeek).lessons[0];
        const t0 = performance.now();
        const runs = 3;
        for (let i = 0; i < runs; i++) buildSessionPlan(lesson, d, { now: Date.now() });
        s.perf.planMs = Math.round(((performance.now() - t0) / runs) * 10) / 10;
      } catch {
        s.perf.planMs = null;
      }
      try {
        const d = store.get();
        const now = new Date();
        const t0 = performance.now();
        tonightPlan(d, now);
        readiness(d, now);
        parentStats(d);
        s.perf.homeMs = Math.round((performance.now() - t0) * 10) / 10;
      } catch {
        s.perf.homeMs = null;
      }
      refresh();
    }, 350);

    // ---------- cập nhật sống
    const unAudio = safe(() => app.audio.onStateChange(() => refresh()), () => undefined);
    const unMic = safe(() => app.mic.onState(() => refresh()), () => undefined);
    const onNet = () => refresh();
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    // Bố mẹ sang Cài đặt của iPad (cài giọng, mở quyền micro) rồi quay lại → đo lại
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void loadVoices().then(({ list }) => {
        s.voice.total = list.length;
        s.voice.viVoices = [...new Set(list.filter(isVi).map((v) => safe(() => v.name, '?')))];
        refresh();
      });
      void micPermission(setPerm).then(setPerm);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      unAudio();
      unMic();
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
      document.removeEventListener('visibilitychange', onVisible);
      try {
        const sy = synth();
        if (sy && (sy.speaking || sy.pending)) sy.cancel();
      } catch {
        /* bỏ qua */
      }
    };
  };
}
