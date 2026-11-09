/**
 * (+ 2026-11-09, OWNER chọn "Nút 'App nghe sai!'") Bé chạm "🙉 App nghe sai" → đoán kiểu lỗi, tự sửa nếu được, lưu đoạn
 * tiếng 4 giây + bối cảnh trên iPad. Trả về câu cảm ơn cho bé. Không bao giờ ném lỗi (lỗi thì vẫn cho bé đi tiếp).
 * Phần thuần: src/audio/micClaims.ts · kho: src/progress/micClaimStore.ts.
 */
import { claimAction, claimMessage, classifyClaim, downsample, toPcm16, wavBytes, type MicEvent } from '../audio/micClaims';
import { addClaim } from '../progress/micClaimStore';
import { APP_VERSION } from '../pwa/updater';
import type { App } from './App';

/** Hướng lệch nửa cung của các lần báo trong lần mở app này (để bù lệch dây cần 2 lần cùng hướng). */
const recentSemis: Array<1 | -1> = [];

export interface ClaimContext {
  /** Nốt (MIDI) đang chờ bé đàn */
  expected: number[];
  where: string;
  songId?: string;
}

export function reportMicWrong(app: App, c: ClaimContext): string {
  try {
    const mic = app.mic;
    const ctx = app.audio.context;
    const now = ctx?.currentTime ?? 0;
    const events = mic.events.since(now - 6);
    const summary = classifyClaim(c.expected, events, now);
    const st = app.store.settings;
    const action = claimAction(summary, {
      sensitivity: mic.sensitivity,
      tuningCents: st.micTuningCents,
      autoTuned: !!st.micAutoTune,
      recentSemis,
    });
    if (summary.kind === 'semitone' && summary.semitoneDir) recentSemis.push(summary.semitoneDir);
    if (action.type === 'sensitivity') {
      mic.sensitivity = action.to;
      app.store.updateSettings({ micSensitivity: action.to });
    } else if (action.type === 'tuning') {
      mic.tuningCents = action.cents;
      app.store.updateSettings({ micTuningCents: action.cents });
      recentSemis.length = 0;
    } else if (action.type === 'restart-mic') void mic.forceRestart().catch(() => undefined);
    // lưu đoạn tiếng (nền — không chờ)
    const snap = mic.snapshot(4);
    if (snap) {
      const k = snap.sampleRate >= 44100 ? 2 : 1;
      const { pcm, gain } = toPcm16(downsample(snap.pcm, k));
      const rel = (e: MicEvent) => ({ ...e, t: Math.round((e.t - snap.endT) * 1000) });
      // mức tiếng: giữ 1/4 số khung cho gọn
      const ev = events.filter((e, i) => e.kind !== 'level' || i % 4 === 0).map(rel);
      void addClaim({
        id: `c${Date.now().toString(36)}`,
        at: Date.now(),
        where: c.where,
        ...(c.songId ? { songId: c.songId } : {}),
        info: {
          v: APP_VERSION,
          expected: c.expected,
          summary,
          action,
          sensitivity: mic.sensitivity,
          tuningCents: st.micTuningCents,
          autoTune: st.micAutoTune ?? null,
          wavGain: Math.round(gain * 100) / 100,
          sampleRate: snap.sampleRate / k,
          micState: mic.state,
          events: ev,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        },
        wav: wavBytes(pcm, Math.round(snap.sampleRate / k)).buffer as ArrayBuffer,
      });
    }
    return claimMessage(summary, action);
  } catch {
    return '🙉 Cảm ơn con! Mình đi tiếp nhé.';
  }
}
