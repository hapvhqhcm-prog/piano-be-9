/**
 * (+ 2026-11-08, OWNER duyệt "Giọng tự nhiên" + "Giọng nữ HoaiMy") GIỌNG ĐỌC TỰ NHIÊN THU SẴN.
 *
 * - Câu hướng dẫn được tạo sẵn trên máy tính (giọng nữ HoaiMy, scripts/voice-gen.py) thành từng file mp3 THEO CÂU,
 *   tên file = mã băm của câu (voiceKey). Danh sách mã: voice/hm/index.json.
 * - speak() (voice.ts): một lời nói = vài câu; CÓ ĐỦ file cho mọi câu → phát qua AudioContext của app;
 *   thiếu câu nào → cả lời dùng giọng iPad như cũ (không trộn hai giọng trong một lời).
 * - Phát qua app (không qua speechSynthesis) → iPad không ngắt tiếng app, micro vẫn bỏ qua nhờ speechBusy().
 * - File KHÔNG nằm trong precache của service worker (sẽ tải lại hàng chục MB mỗi bản mới) — SW giữ chúng trong kho
 *   riêng lâu dài (sw-template.js, VOICE_CACHE); app tải dần lúc rảnh (warmVoiceCache) để dùng được khi mất mạng.
 *
 * Phần thuần (không DOM): splitSentences, voiceKey — scripts/voice-gen.py làm y hệt (tests/voiceClips.test.ts canh mẫu).
 */

export const VOICE_DIR = 'voice/hm/';

/**
 * Tách lời thành câu: cắt sau . ! ? … (một hoặc nhiều dấu) khi theo sau là khoảng trắng.
 * Không dùng lookbehind (Safari 15 không có).
 */
export function splitSentences(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    cur += ch;
    if ('.!?…'.includes(ch) && (i + 1 >= line.length || line[i + 1] === ' ')) {
      // gom dấu liền sau ("!!", "?!")
      const t = cur.trim();
      if (t) out.push(t);
      cur = '';
    }
  }
  const t = cur.trim();
  if (t) out.push(t);
  return out;
}

/** Chuẩn hóa câu trước khi băm: NFC, gộp khoảng trắng. */
export function normSentence(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** FNV-1a 32 bit với cơ số tùy chọn. */
function fnv32(bytes: Uint8Array, basis: number): number {
  let h = basis >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Mã câu: hai FNV-1a 32 bit (hai cơ số) trên UTF-8 của câu đã chuẩn hóa → 16 ký tự hex. Python: scripts/voice-gen.py. */
export function voiceKey(sentence: string): string {
  const bytes = new TextEncoder().encode(normSentence(sentence));
  const hx = (n: number) => n.toString(16).padStart(8, '0');
  return hx(fnv32(bytes, 0x811c9dc5)) + hx(fnv32(bytes, 0x050c5d1f));
}

// ---------------------------------------------------------------- phần chạy trong trình duyệt

let manifest: Set<string> | null = null;
let manifestLoading: Promise<Set<string> | null> | null = null;

/** Nạp danh sách câu có sẵn (một lần). null = không có / lỗi mạng (dùng giọng iPad). */
export function loadVoiceManifest(): Promise<Set<string> | null> {
  if (manifest) return Promise.resolve(manifest);
  if (!manifestLoading) {
    manifestLoading = (async () => {
      try {
        if (typeof fetch !== 'function') return null;
        const r = await fetch(VOICE_DIR + 'index.json');
        if (!r.ok) return null;
        const keys = (await r.json()) as string[];
        manifest = new Set(keys);
        return manifest;
      } catch {
        return null;
      } finally {
        manifestLoading = null;
      }
    })();
  }
  return manifestLoading;
}

/** Danh sách đã nạp (đồng bộ; null nếu chưa). */
export function voiceManifest(): Set<string> | null {
  return manifest;
}

/** Mã của mọi câu trong lời, hoặc null nếu thiếu câu nào trong danh sách. */
export function clipKeysFor(line: string, have: Set<string> | null = manifest): string[] | null {
  if (!have || !line) return null;
  const keys = splitSentences(line).map(voiceKey);
  return keys.length && keys.every((k) => have.has(k)) ? keys : null;
}

const decoded = new Map<string, AudioBuffer>();
const DECODED_MAX = 40;

function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // dạng gọi lại: Safari cũ không trả Promise
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(data, resolve, reject) as unknown as Promise<AudioBuffer> | undefined;
      p?.catch?.(reject);
    } catch (e) {
      reject(e);
    }
  });
}

async function loadClip(ctx: BaseAudioContext, key: string): Promise<AudioBuffer> {
  const hit = decoded.get(key);
  if (hit) {
    decoded.delete(key);
    decoded.set(key, hit);
    return hit;
  }
  const r = await fetch(VOICE_DIR + key + '.mp3');
  if (!r.ok) throw new Error('voice ' + r.status);
  const buf = await decode(ctx, await r.arrayBuffer());
  decoded.set(key, buf);
  while (decoded.size > DECODED_MAX) decoded.delete(decoded.keys().next().value as string);
  return buf;
}

/** Âm lượng giọng đọc so với đàn (master của app 0,72; giọng đi thẳng ra loa). */
const VOICE_GAIN = 0.9;
/** Nghỉ giữa hai câu (giây). */
const GAP_S = 0.22;

export interface ClipPlayback {
  /** Xong (hết câu cuối / bị dừng). */
  done: Promise<void>;
  stop(): void;
}

/**
 * Tải (song song) rồi phát lần lượt các câu. Ném lỗi nếu tải/giải mã hỏng → voice.ts đọc bằng giọng iPad.
 * `cancelled()` kiểm tra trước khi bắt đầu phát (đã có lời khác).
 */
export async function playClips(ctx: AudioContext, keys: string[], cancelled: () => boolean): Promise<ClipPlayback | null> {
  const bufs = await Promise.all(keys.map((k) => loadClip(ctx, k)));
  if (cancelled()) return null;
  if (ctx.state !== 'running') throw new Error('ctx ' + ctx.state);
  const gain = ctx.createGain();
  gain.gain.value = VOICE_GAIN;
  gain.connect(ctx.destination);
  let t = ctx.currentTime + 0.05;
  const srcs: AudioBufferSourceNode[] = [];
  for (const b of bufs) {
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(gain);
    s.start(t);
    srcs.push(s);
    t += b.duration + GAP_S;
  }
  let finish: () => void = () => undefined;
  const done = new Promise<void>((r) => (finish = r));
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearTimeout(guard);
    try {
      gain.disconnect();
    } catch {
      /* bỏ qua */
    }
    finish();
  };
  const last = srcs[srcs.length - 1];
  last.onended = end;
  // phòng khi onended không đến (AudioContext bị ngắt giữa chừng)
  const guard = setTimeout(end, (t - ctx.currentTime) * 1000 + 1500);
  return {
    done,
    stop() {
      for (const s of srcs) {
        try {
          s.onended = null;
          s.stop();
        } catch {
          /* bỏ qua */
        }
      }
      end();
    },
  };
}

/**
 * Tải dần MỌI câu vào kho của service worker (chỉ chạy một lần mỗi lần mở app, nhỏ giọt, nhường mạng cho việc khác)
 * → về sau mất mạng vẫn có giọng tự nhiên. Không có service worker / không có kho → thôi.
 */
export async function warmVoiceCache(opts: { delayMs?: number; gapMs?: number } = {}): Promise<number> {
  try {
    if (typeof caches === 'undefined' || !globalThis.navigator?.serviceWorker?.controller) return 0;
    const have = await loadVoiceManifest();
    if (!have) return 0;
    await new Promise((r) => setTimeout(r, opts.delayMs ?? 20_000));
    const cache = await caches.open(VOICE_CACHE);
    let got = 0;
    for (const k of have) {
      const url = new URL(VOICE_DIR + k + '.mp3', document.baseURI).href;
      if (await cache.match(url)) continue;
      try {
        const r = await fetch(url);
        if (r.ok) got++;
      } catch {
        return got; // mất mạng → lần mở sau tải tiếp
      }
      await new Promise((r) => setTimeout(r, opts.gapMs ?? 250));
    }
    return got;
  } catch {
    return 0;
  }
}

/** Kho riêng của service worker cho file giọng đọc (trùng sw-template.js). Không có tiền tố 'piano-be-9-' → không bị dọn khi cập nhật. */
export const VOICE_CACHE = 'pb9-voice-hm';
