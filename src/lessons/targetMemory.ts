/**
 * Trí nhớ của bé về từng nốt rời (hộp Leitner) + "Ôn nhanh" (chọn nốt ôn có trọng số).
 */
import type { AppData, Session } from '../progress/schema';
import { hist, memo } from '../progress/history';
import type { Lesson, Segment, Target } from './types';
import { DAY_MS, WEEKS } from './curriculum';

/** Mọi nốt rời (1 phím, không phải nhại lại/khuông) trong các hoạt động Từng nốt của bài. */
export function lessonNoteTargets(lesson: Lesson): Target[] {
  return lesson.activities.flatMap((a) =>
    a.kind === 'notes' ? a.segment.targets.filter((t) => t.keys.length === 1 && !t.sequence && !t.staff) : [],
  );
}

/**
 * Nốt rời dùng cho "Ôn nhanh" — GỒM cả nốt có khuông (thế Sol, khóa Fa, Fa♯…).
 * Lỗi cũ (chuyên gia sư phạm phát hiện 2026-10-05): lọc bỏ nốt có khuông → từ tuần 9 trở đi chỉ ôn mãi việc tìm phím tuần 1–6.
 */
function reviewableTargets(lesson: Lesson): Target[] {
  return lesson.activities.flatMap((a) =>
    a.kind === 'notes' ? a.segment.targets.filter((t) => t.keys.length === 1 && !t.sequence) : [],
  );
}

/** Khoảng ôn kiểu hộp Leitner (ngày) theo số lần ĐÚNG liên tiếp gần nhất: 0 → ôn ngay, 1 → sau 1 ngày, 2 → 3 ngày… */
const LEITNER_DAYS = [0, 1, 3, 7, 14];

export interface TargetMemory {
  /** Số lần sai trong 5 lần gần nhất */
  recentErrors: number;
  /** Số lần đúng liên tiếp tính từ lần gần nhất (hộp Leitner, tối đa 4) */
  box: number;
  /** Lần gần nhất gặp nốt này (ms) */
  lastSeen: number;
}

/**
 * Trí nhớ của bé về từng nốt rời — từ PARENT_ASSESSMENT (note = noteId; retry = sai) và MIC_ASSESSMENT
 * (expected = các phím nối "+"; sai = không đúng ngay lần đầu, trừ khi bố mẹ "Sửa" thành đúng).
 */
export function targetMemory(data: Readonly<AppData>): Map<string, TargetMemory> {
  // (+ 2026-10-06) Ghi nhớ theo phiên bản dữ liệu; trả về BẢN SAO (người gọi được sửa)
  return new Map(memo(data, 'targetMemory', () => computeTargetMemory(data)));
}

/** Mỗi lần gặp một nốt / việc trong buổi: (mã, đúng?, ts) — PARENT trước, MIC sau (thứ tự cũ). */
export function forEachTargetOutcome(s: Session, fn: (key: string, ok: boolean, ts: number) => void): void {
  for (const a of s.parentAssessments) fn(a.note, a.result === 'correct', a.ts);
  for (const a of s.micAssessments) fn(a.expected, a.parentOverride ? a.parentOverride === 'correct' : a.firstTry, a.ts);
}

function computeTargetMemory(data: Readonly<AppData>): Map<string, TargetMemory> {
  const byKey = new Map<string, Array<{ ok: boolean; ts: number }>>();
  // Lịch sử đã gộp: tối đa 5 lần gần nhất mỗi mã (đủ cho hộp Leitner ≤ 4 và "sai trong 5 lần gần nhất")
  for (const [k, list] of Object.entries(hist(data).targets)) byKey.set(k, list.map(([ts, ok]) => ({ ok: ok === 1, ts })));
  // (+ 2026-10-06) push thay cho tạo mảng mới mỗi lần (trước đây O(n²))
  const add = (k: string, ok: boolean, ts: number) => {
    const h = byKey.get(k);
    if (h) h.push({ ok, ts });
    else byKey.set(k, [{ ok, ts }]);
  };
  for (const s of data.sessions) forEachTargetOutcome(s, add);
  const out = new Map<string, TargetMemory>();
  for (const [k, h] of byKey) {
    h.sort((a, b) => a.ts - b.ts);
    let box = 0;
    for (let i = h.length - 1; i >= 0 && h[i].ok && box < 4; i--) box++;
    out.set(k, { recentErrors: h.slice(-5).filter((x) => !x.ok).length, box, lastSeen: h[h.length - 1].ts });
  }
  return out;
}

/**
 * Trọng số ôn của một nốt (kiểu Leitner): nốt hay sai gần đây và nốt đã "tới hạn" ôn được chọn nhiều hơn;
 * nốt vừa đúng nhiều lần liền, mới gặp hôm qua thì ít hơn (vẫn có thể ra — không bao giờ bằng 0).
 */
export function reviewWeight(t: Target, mem: Map<string, TargetMemory>, now: number): number {
  const m = mem.get(t.noteId) ?? mem.get(t.keys.join('+'));
  if (!m) return 1.5; // chưa gặp lần nào ở dạng nốt rời (vd học trong bài hát) → hơi ưu tiên
  const days = (now - m.lastSeen) / DAY_MS;
  const due = days >= LEITNER_DAYS[m.box];
  return (due ? 2 : 0.5) + 2 * Math.min(m.recentErrors, 3);
}

/**
 * "Ôn nhanh" (v2): 4 nốt xen kẽ lấy từ tuần trước và các bài đã học — gợi nhớ ngắt quãng.
 * v5 (sư phạm): chọn có TRỌNG SỐ — nốt hay sai / lâu chưa gặp ra nhiều hơn (reviewWeight). Chưa có dữ liệu → xáo đều như cũ.
 */
export function reviewSegment(
  lesson: Lesson,
  data: Readonly<AppData>,
  rng: () => number = Math.random,
  now: number = Date.now(),
): Segment | null {
  const mem = targetMemory(data);
  const done = new Set(data.progress.lessonsCompleted);
  const pools: Target[][] = [];
  for (const w of WEEKS) {
    if (w.week > lesson.week) break;
    const ts = w.lessons
      .filter((l) => l.id !== lesson.id && (w.week < lesson.week || done.has(l.id)))
      .flatMap(reviewableTargets);
    if (ts.length) pools.push(ts);
  }
  if (!pools.length) return null;
  const recent = pools[pools.length - 1];
  const older = pools.slice(0, -1).flat();
  const picked: Target[] = [];
  const seen = new Set<string>();
  const take = (from: Target[], n: number) => {
    const weights = from.map((t) => reviewWeight(t, mem, now));
    let arr: Target[];
    if (weights.every((w) => w === weights[0])) {
      // Mọi nốt ngang nhau → xáo trộn đều (Fisher–Yates) như trước
      arr = [...from];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1)) % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } else {
      // Rút KHÔNG hoàn lại theo trọng số (mỗi noteId một lần) — xác định theo rng để test được
      const pool = new Map<string, { t: Target; w: number }>();
      from.forEach((t, i) => pool.has(t.noteId) || pool.set(t.noteId, { t, w: weights[i] }));
      const items = [...pool.values()];
      arr = [];
      while (items.length) {
        const total = items.reduce((s, x) => s + x.w, 0);
        let r = rng() * total;
        let k = 0;
        while (k < items.length - 1 && r >= items[k].w) r -= items[k++].w;
        arr.push(items.splice(k, 1)[0].t);
      }
    }
    for (const t of arr) {
      if (n <= 0) break;
      if (seen.has(t.noteId)) continue;
      seen.add(t.noteId);
      picked.push({ ...t, subtitle: t.hand === 'LH' ? 'Ôn bài cũ — tay trái' : 'Ôn bài cũ' });
      n--;
    }
  };
  take(recent, older.length ? 2 : 4);
  take(older, 4 - picked.length);
  take(recent, 4 - picked.length);
  if (picked.length < 2) return null;
  return {
    id: `review-${lesson.id}`,
    step: 'Ôn nhanh',
    title: 'Ôn nhanh ⚡',
    intro: 'Mình ôn lại vài nốt cũ thật nhanh nhé!',
    targets: picked,
  };
}
