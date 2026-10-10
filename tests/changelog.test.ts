/**
 * (+ 2026-10-10) "🆕 Có gì mới" cho bố mẹ + "📖 Hướng dẫn nhanh": dữ liệu nhật ký đúng dạng, logic lastSeenVersion
 * (cài mới / cập nhật / cùng bản), đích "Mở ngay" của Hướng dẫn có thật.
 */
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { CHANGELOG, CHANGELOG_BASELINE, LATEST_VERSION, compareVersions, isVersion, whatsNew, type ChangelogEntry } from '../src/pwa/changelog';
import { RELEASE_VERSION } from '../src/pwa/release';
import { defaultData, validateAppData } from '../src/progress/schema';
import { migrate } from '../src/progress/migrations';
import {
  GUIDE_SCREENS,
  GUIDE_SECTIONS,
  PARENT_ANCHORS,
  guideSummaryText,
  isParentAnchor,
  type GuideAnchor,
} from '../src/ui/screens/parentGuideData';

describe('changelog — dữ liệu', () => {
  it('bản mới nhất = package.json = RELEASE_VERSION', () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
    expect(LATEST_VERSION).toBe(pkg.version);
    expect(RELEASE_VERSION).toBe(pkg.version);
  });

  it('phiên bản đúng dạng, giảm dần nghiêm ngặt, không trùng; ngày hợp lệ và không tăng', () => {
    for (const e of CHANGELOG) {
      expect(isVersion(e.version), e.version).toBe(true);
      expect(e.date, e.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(e.date)), e.version).toBe(false);
    }
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version), CHANGELOG[i].version).toBeGreaterThan(0);
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date, CHANGELOG[i].version).toBe(true);
    }
  });

  it('đủ các bản 0.16.0 → bản hiện tại, bản cũ nhất mới hơn mốc 0.15.0', () => {
    const vs = CHANGELOG.map((e) => e.version);
    for (const v of ['0.16.0', '0.16.1', '0.17.0', '0.18.0', '0.18.1', '0.18.2', '0.19.0', '0.19.1', '0.20.0', '0.20.1', '0.21.0']) {
      expect(vs, v).toContain(v);
    }
    expect(compareVersions(CHANGELOG[CHANGELOG.length - 1].version, CHANGELOG_BASELINE)).toBeGreaterThan(0);
  });

  it('mỗi bản 2–5 ý, câu ngắn, lời thường (không thuật ngữ kỹ thuật)', () => {
    const jargon = /\b(IndexedDB|localStorage|JSON|API|refactor|bug|cache|service worker|chunk|NNLS|cent|dBFS|gzip|kB)\b/i;
    for (const e of CHANGELOG) {
      expect(e.items.length, e.version).toBeGreaterThanOrEqual(2);
      expect(e.items.length, e.version).toBeLessThanOrEqual(5);
      for (const it of e.items) {
        expect(it.trim().length, it).toBeGreaterThan(10);
        expect(it.length, it).toBeLessThanOrEqual(110);
        expect(it, it).not.toMatch(jargon);
      }
    }
  });
});

describe('changelog — lastSeenVersion', () => {
  const log: ChangelogEntry[] = [
    { version: '1.2.0', date: '2026-10-12', items: ['c1', 'c2'] },
    { version: '1.1.0', date: '2026-10-11', items: ['b1', 'b2'] },
    { version: '1.0.0', date: '2026-10-10', items: ['a1', 'a2'] },
  ];

  it('cài mới (chưa có lastSeenVersion, chưa từng học) → không hiện, báo first-install', () => {
    expect(whatsNew(undefined, false, log)).toEqual({ kind: 'first-install', entries: [] });
  });

  it('dữ liệu cũ (chưa có trường, đã học) → mọi bản sau mốc 0.15.0', () => {
    const r = whatsNew(undefined, true, log);
    expect(r.kind).toBe('update');
    expect(r.entries.map((e) => e.version)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
    const real = whatsNew(undefined, true);
    expect(real.entries.map((e) => e.version)).toEqual(CHANGELOG.map((e) => e.version));
  });

  it('cập nhật → chỉ các bản MỚI HƠN bản đã xem, mới nhất trước', () => {
    const r = whatsNew('1.0.0', true, log);
    expect(r.kind).toBe('update');
    expect(r.entries.map((e) => e.version)).toEqual(['1.2.0', '1.1.0']);
    expect(whatsNew('1.1.0', false, log).entries.map((e) => e.version)).toEqual(['1.2.0']);
    // bản chưa có trong nhật ký (vd bản vá chưa ghi) vẫn so đúng thứ tự số
    expect(whatsNew('1.0.5', true, log).entries.map((e) => e.version)).toEqual(['1.2.0', '1.1.0']);
    // so số, không so chữ: 0.9.0 < 0.10.0
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });

  it('cùng bản (hoặc dữ liệu từ bản mới hơn) → không hiện', () => {
    expect(whatsNew('1.2.0', true, log)).toEqual({ kind: 'same', entries: [] });
    expect(whatsNew('2.0.0', true, log)).toEqual({ kind: 'same', entries: [] });
    expect(whatsNew(LATEST_VERSION, true)).toEqual({ kind: 'same', entries: [] });
  });

  it('giá trị hỏng coi như chưa có', () => {
    expect(whatsNew('abc', false, log).kind).toBe('first-install');
    expect(whatsNew(42, true, log).entries).toHaveLength(3);
  });

  it('dữ liệu mới có lastSeenVersion = bản hiện tại; dữ liệu cũ qua migrate KHÔNG tự có (để còn thấy Có gì mới)', () => {
    const fresh = defaultData();
    expect(fresh.settings.lastSeenVersion).toBe(RELEASE_VERSION);
    expect(validateAppData(fresh)).toEqual([]);
    const old = defaultData() as unknown as { settings: Record<string, unknown> };
    delete old.settings.lastSeenVersion;
    const m = migrate(JSON.parse(JSON.stringify(old)));
    expect(m.settings.lastSeenVersion).toBeUndefined();
    expect(validateAppData(m)).toEqual([]);
  });

  it('validate: lastSeenVersion / guideHintAt tùy chọn nhưng phải đúng kiểu', () => {
    const ok = defaultData();
    ok.settings.guideHintAt = Date.now();
    expect(validateAppData(ok)).toEqual([]);
    const bad1 = defaultData() as unknown as { settings: Record<string, unknown> };
    bad1.settings.lastSeenVersion = 'v1';
    expect(validateAppData(bad1)).toContain('settings.lastSeenVersion');
    const bad2 = defaultData() as unknown as { settings: Record<string, unknown> };
    bad2.settings.guideHintAt = 'hôm qua';
    expect(validateAppData(bad2)).toContain('settings.guideHintAt');
  });
});

describe('📖 Hướng dẫn nhanh cho bố mẹ', () => {
  // Mã nguồn các màn (chuỗi thô) — kiểm mốc data-guide / chỗ dùng thẻ Có gì mới
  const SCREENS = import.meta.glob('../src/ui/screens/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const read = (rel: string) => {
    const src = SCREENS[`../src/${rel}`];
    if (src === undefined) throw new Error(`không thấy ${rel}`);
    return src;
  };
  const screenFiles = Object.keys(SCREENS).map((k) => k.replace('../src/ui/screens/', ''));
  const parentSources = screenFiles
    .filter((f) => /^parent.*\.ts$/.test(f))
    .map((f) => read(`ui/screens/${f}`))
    .join('\n');

  it('đủ 10 mục theo yêu cầu, mỗi mục ≤ 4 dòng ngắn + nút Mở ngay', () => {
    expect(GUIDE_SECTIONS.map((s) => s.title)).toEqual([
      'Bắt đầu một buổi học',
      'Cài micro + Đo micro & gửi báo cáo',
      'Khi micro nghe sai',
      'Sao lưu & khôi phục',
      'Báo cáo tuần & gửi ông bà',
      'Biểu diễn cho cả nhà & Album',
      'Đặt giờ tập',
      'Đổi tuần / giữ tuần',
      'Thêm bài con thích',
      'Mẹo khi bé chán / khó',
    ]);
    const ids = new Set<string>();
    for (const s of GUIDE_SECTIONS) {
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      expect(s.lines.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.lines.length, s.id).toBeLessThanOrEqual(4);
      for (const l of s.lines) expect(l.length, l).toBeLessThanOrEqual(120);
      expect(s.open.go, s.id).toBeTruthy();
    }
  });

  it('mọi đích "Mở ngay" tồn tại: màn riêng có trong GUIDE_SCREENS, mốc màn Phụ huynh có data-guide trong mã', () => {
    const targets = GUIDE_SECTIONS.flatMap((s) => [s.open.go, ...(s.more ? [s.more.go] : [])]);
    for (const t of targets) {
      if (isParentAnchor(t)) continue;
      expect(GUIDE_SCREENS as readonly string[], t).toContain(t);
    }
    for (const a of Object.keys(PARENT_ANCHORS) as GuideAnchor[]) {
      const attr = new RegExp(`'data-guide': '${a}'|tagGuide\\([^;]*'${a}'\\)`);
      expect(attr.test(parentSources), `mốc ${a}`).toBe(true);
    }
    // Màn hướng dẫn xử lý đủ mọi màn riêng (Record<GuideScreen, …>)
    const guide = read('ui/screens/parentGuide.ts');
    for (const s of GUIDE_SCREENS) expect(guide, s).toMatch(new RegExp(`\\b${s}: \\(\\) =>`));
    // Mốc trong "Nâng cao" thật sự nằm ở parentAdvanced.ts; mốc ngoài thì không
    const adv = read('ui/screens/parentAdvanced.ts');
    for (const [a, inAdv] of Object.entries(PARENT_ANCHORS)) expect(adv.includes(`'data-guide': '${a}'`), a).toBe(inAdv);
  });

  it('nút 📖 Hướng dẫn mở màn Hướng dẫn mới (nạp muộn), không còn mở thẳng 4 thẻ lần đầu', () => {
    const parent = read('ui/screens/parent.ts');
    expect(parent).toMatch(/guideButton\(openGuide, guideHint\)/);
    expect(parent).not.toMatch(/onboardingScreen\(/);
    expect(read('ui/screens/parentHelp.ts')).toMatch(/lazy\(\(\) => import\('\.\/parentGuide'\)\)/);
  });

  it('thẻ Có gì mới chỉ ở màn Phụ huynh (không ở màn của bé)', () => {
    const others = screenFiles.filter((x) => !/^parent/.test(x));
    expect(others.length).toBeGreaterThan(20);
    for (const f of others) expect(read(`ui/screens/${f}`), f).not.toMatch(/whatsNewCard|pwa\/changelog/);
  });

  it('bản tóm tắt một trang: có mọi mục, vừa một trang', () => {
    const t = guideSummaryText(GUIDE_SECTIONS, '0.21.0');
    for (const s of GUIDE_SECTIONS) expect(t).toContain(s.title.toUpperCase());
    expect(t).toContain('0.21.0');
    expect(t.split('\n').length).toBeLessThanOrEqual(60);
    expect(t.length).toBeLessThanOrEqual(3600);
  });
});
