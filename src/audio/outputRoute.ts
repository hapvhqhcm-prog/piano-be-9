/**
 * (+ 2026-10-17, OWNER duyệt — rà soát vận hành thực tế) LOA / TAI NGHE BLUETOOTH.
 *
 * Tai nghe / loa Bluetooth trễ 150–300 ms (iPad: loa trong ~3–20 ms). Bé đàn theo tiếng tích NGHE THẤY → app chấm "trễ nhịp"
 * oan cho bé. Dấu hiệu (không API nào nói thẳng "đang dùng Bluetooth"):
 *  - AudioContext.outputLatency (hoặc baseLatency) > BT_OUTPUT_LATENCY_MS;
 *  - tên thiết bị (track micro / enumerateDevices — chỉ có khi đã cho phép micro) chứa AirPods / Bluetooth / BT…
 * Khi có dấu hiệu: báo MỘT lần cho mỗi lần đổi (App: toast) và TẠM KHÔNG CHẤM NHỊP (songTempo.ts: nốt vẫn tính, nhịp không
 * chấm) cho tới khi về loa iPad hoặc bố mẹ "Đo lại độ trễ" (noteMeasured / độ trễ đã đo là của Bluetooth).
 * Thiếu API nào cũng không sao (không bao giờ ném lỗi). Logic + lớp theo dõi đều nhận "env" để test bằng đồ giả.
 */
import { BLUETOOTH_LIKELY_MS } from './latency';

/** outputLatency trên mức này (ms) → rất có thể là loa / tai nghe không dây */
export const BT_OUTPUT_LATENCY_MS = 100;
/** Hỏi lại độ trễ khi đang ở màn bài hát (ms) — nhẹ: chỉ đọc một số */
export const ROUTE_POLL_MS = 4000;
/** Tên thiết bị không dây hay gặp */
export const WIRELESS_LABEL = /airpods|bluetooth|\bbt\b|beats|wireless|không dây|buds/i;

export const BT_NOTE = 'Đang dùng loa/tai nghe Bluetooth — micro chấm nhịp kém. Dùng loa iPad nhé';
export const BT_PARENT_HINT = 'Bố mẹ: tắt Bluetooth, hoặc vào Cài micro → “Đo lại độ trễ”';
export const BT_RESULT_NOTE = 'chưa chấm nhịp vì loa Bluetooth';

export interface RouteState {
  wireless: boolean;
  reason: 'latency' | 'label' | null;
  /** outputLatency (ms) lần đọc gần nhất; null = trình duyệt không báo / chưa bật âm thanh */
  latencyMs: number | null;
  /** Tên micro đang dùng (track.label) */
  micLabel: string | null;
  /** Tên các thiết bị âm thanh (enumerateDevices) — rỗng khi chưa cho phép micro */
  inputs: string[];
  outputs: string[];
}

export interface DeviceLike {
  kind: string;
  label: string;
}

/** Chấm dấu hiệu "đang dùng không dây" từ số đo. */
export function assessRoute(i: { latencySec: number | null | undefined; labels: ReadonlyArray<string | null | undefined> }): Pick<RouteState, 'wireless' | 'reason'> {
  const ms = typeof i.latencySec === 'number' && Number.isFinite(i.latencySec) ? i.latencySec * 1000 : null;
  if (ms !== null && ms > BT_OUTPUT_LATENCY_MS) return { wireless: true, reason: 'latency' };
  if (i.labels.some((l) => typeof l === 'string' && WIRELESS_LABEL.test(l))) return { wireless: true, reason: 'label' };
  return { wireless: false, reason: null };
}

export interface RouteEnv {
  /** Độ trễ ra loa (giây) — AudioEngine.outputLatency; 0/null = chưa biết */
  latencySec(): number | null;
  /** Tên micro đang dùng */
  micLabel(): string | null;
  /** navigator.mediaDevices.enumerateDevices (null = không có) */
  devices: (() => Promise<DeviceLike[]>) | null;
  /** Gắn 'devicechange' (trả về hàm gỡ); null = không có */
  onDeviceChange: ((fn: () => void) => () => void) | null;
  /** Độ trễ khứ hồi đã đo trong Cài micro (ms; 0 = chưa đo) */
  measuredMs(): number;
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(t: unknown): void;
}

const EMPTY: RouteState = { wireless: false, reason: null, latencyMs: null, micLabel: null, inputs: [], outputs: [] };

export class OutputRouteWatcher {
  private st: RouteState = { ...EMPTY };
  /** Lúc đổi trạng thái không dây gần nhất / lúc bố mẹ đo lại độ trễ */
  private changedAt = -Infinity;
  private measuredAt = -Infinity;
  private listeners = new Set<(s: RouteState) => void>();
  private poll: unknown = null;
  private detach: (() => void) | null = null;
  private labels: { inputs: string[]; outputs: string[] } = { inputs: [], outputs: [] };

  constructor(private readonly env: RouteEnv) {}

  get state(): Readonly<RouteState> {
    return this.st;
  }

  /**
   * TẠM KHÔNG CHẤM NHỊP: đang có dấu hiệu không dây, chưa đo lại độ trễ từ lúc đổi, và độ trễ đã lưu không phải đo qua
   * Bluetooth (> BLUETOOTH_LIKELY_MS = đã đo khi đang nối Bluetooth → bù đúng).
   */
  get timingPaused(): boolean {
    if (!this.st.wireless) return false;
    if (this.measuredAt >= this.changedAt) return false;
    let measured = 0;
    try {
      measured = this.env.measuredMs() || 0;
    } catch {
      measured = 0;
    }
    return !(measured > BLUETOOTH_LIKELY_MS);
  }

  /** Báo khi trạng thái không dây ĐỔI (không báo lại khi vẫn như cũ). */
  onChange(fn: (s: RouteState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Gắn 'devicechange' (một lần). */
  start(): void {
    if (this.detach || !this.env.onDeviceChange) return;
    try {
      this.detach = this.env.onDeviceChange(() => void this.refresh());
    } catch {
      this.detach = null;
    }
  }

  /** Đọc lại NGAY (đồng bộ): độ trễ + tên micro (tên thiết bị lấy từ lần đọc gần nhất). */
  check(): Readonly<RouteState> {
    let lat: number | null = null;
    let mic: string | null = null;
    try {
      const v = this.env.latencySec();
      lat = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      lat = null;
    }
    try {
      mic = this.env.micLabel() || null;
    } catch {
      mic = null;
    }
    const a = assessRoute({ latencySec: lat, labels: [mic, ...this.labels.inputs, ...this.labels.outputs] });
    const prev = this.st.wireless;
    this.st = { ...a, latencyMs: lat === null ? null : Math.round(lat * 1000), micLabel: mic, inputs: this.labels.inputs, outputs: this.labels.outputs };
    if (a.wireless !== prev) {
      this.changedAt = this.env.now();
      this.listeners.forEach((fn) => {
        try {
          fn(this.st);
        } catch {
          /* bỏ qua */
        }
      });
    }
    return this.st;
  }

  /** Đọc lại cả danh sách thiết bị (bất đồng bộ — 'devicechange', mở 🩺). */
  async refresh(): Promise<Readonly<RouteState>> {
    const list = this.env.devices;
    if (list) {
      try {
        const ds = (await list()) ?? [];
        const names = (k: string) => ds.filter((d) => d && d.kind === k && typeof d.label === 'string' && d.label.trim()).map((d) => d.label.trim());
        this.labels = { inputs: names('audioinput'), outputs: names('audiooutput') };
      } catch {
        /* giữ danh sách cũ */
      }
    }
    return this.check();
  }

  /** Màn bài hát đang mở → hỏi lại độ trễ nhẹ nhàng mỗi ROUTE_POLL_MS; rời màn → dừng. */
  setActive(on: boolean): void {
    if (on && this.poll === null) {
      this.check();
      this.poll = this.env.setInterval(() => this.check(), ROUTE_POLL_MS);
    } else if (!on && this.poll !== null) {
      this.env.clearInterval(this.poll);
      this.poll = null;
    }
  }

  /** Bố mẹ vừa "Đo lại độ trễ" → chấm nhịp lại (con số đo mới đã gồm độ trễ của thiết bị đang dùng). */
  noteMeasured(): void {
    this.measuredAt = this.env.now();
  }

  dispose(): void {
    this.setActive(false);
    this.detach?.();
    this.detach = null;
  }
}

/** Gắn vào trình duyệt thật (thiếu API nào thì bỏ phần đó). */
export function browserRouteEnv(o: { latencySec: () => number | null; micLabel: () => string | null; measuredMs: () => number }): RouteEnv {
  const md = (() => {
    try {
      return (globalThis.navigator?.mediaDevices as MediaDevices | undefined) ?? null;
    } catch {
      return null;
    }
  })();
  return {
    latencySec: o.latencySec,
    micLabel: o.micLabel,
    measuredMs: o.measuredMs,
    devices: md && typeof md.enumerateDevices === 'function' ? () => md.enumerateDevices() : null,
    onDeviceChange:
      md && typeof md.addEventListener === 'function'
        ? (fn) => {
            md.addEventListener('devicechange', fn);
            return () => md.removeEventListener('devicechange', fn);
          }
        : null,
    now: () => Date.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (t) => clearInterval(t as ReturnType<typeof setInterval>),
  };
}
