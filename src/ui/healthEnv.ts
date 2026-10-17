/**
 * (+ 2026-10-17) Gom HealthEnv cho "🩺 Kiểm tra sức khỏe app" + "⚠️" trên nút Phụ huynh từ: settings.ops (agent real-world
 * ghi — pwa/healthCheck.ts envFromOps), bản ghi lần kiểm tra trong localStorage (loadHealth), nhật ký lỗi (errorLog).
 * Không bao giờ ném lỗi (màn chính dùng).
 */
import { envFromOps, healthCheckDue, healthFlags, loadHealth, type HealthEnv, type HealthFlag, type HealthReason } from '../pwa/healthCheck';
import { readErrors } from '../pwa/errorLog';
import type { AppData } from '../progress/schema';

export function healthEnvNow(d: Readonly<AppData>, now: number = Date.now()): HealthEnv {
  try {
    const rec = loadHealth();
    const env = envFromOps(d.settings as { ops?: unknown }, now, rec?.at ?? 0);
    const last = Math.max(env.lastCheckAt ?? 0, rec?.at ?? 0);
    let errors = 0;
    try {
      errors = readErrors().filter((e) => e.t > last).length;
    } catch {
      errors = 0;
    }
    return { ...env, lastCheckAt: last || null, errors };
  } catch {
    return { now };
  }
}

export function healthNow(d: Readonly<AppData>, now: number = Date.now()): { flags: HealthFlag[]; due: boolean; reasons: HealthReason[] } {
  try {
    const env = healthEnvNow(d, now);
    const due = healthCheckDue(d, env);
    return { flags: healthFlags(d, env), ...due };
  } catch {
    return { flags: [], due: false, reasons: [] };
  }
}
