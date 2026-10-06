import type { App, Screen } from '../App';
import { P, checkBadge, noteGlyph, sparkle, starPath, svgRoot } from '../components/art/svgKit';
import { append, button, h } from '../components/dom';
import { mascot } from '../components/mascot';
import { postureArt } from '../components/postureArt';
import { whenCorrectBox } from '../components/whenCorrect';
import { installCard } from '../components/installCard';
import '../../styles/parentux.css';

/** THẺ NHẮC NHANH CHO BỐ MẸ (5 ý) — hiện ở Hướng dẫn (thẻ 3) và màn Phụ huynh. [chữ đậm, phần còn lại] */
export const QUICK_TIPS: ReadonlyArray<[string, string]> = [
  ['Ngồi cạnh con 10–15 phút', ', bấm “Học tiếp” — app tự chọn bài, không cần soạn gì.'],
  ['Bấm “Đúng rồi”', ' khi con đàn đúng phím sáng, đúng số ngón; sai thì “Thử lại” — không chê.'],
  ['Con vấp?', ' Nói “Con thử chậm hơn nhé” · “Ngón số mấy nhỉ?” — chậm mà đúng hơn nhanh mà sai.'],
  ['Khen cụ thể', ' (“ngón con cong đẹp quá”), không so sánh với bạn khác.'],
  ['Con mệt hay cáu:', ' “Nghỉ 1 phút rồi làm lại” — hoặc dừng buổi, mai học tiếp.'],
];

export function quickTipsCard(tag: 'section' | 'div' = 'section'): HTMLElement {
  return h(
    tag,
    { class: 'card quick-tips' },
    h('h2', {}, '🗒️ Thẻ nhắc nhanh cho bố mẹ'),
    h('ol', {}, ...QUICK_TIPS.map(([b, t]) => h('li', {}, h('b', {}, b), t))),
  );
}

/**
 * HƯỚNG DẪN NHANH CHO BỐ MẸ (lần đầu mở app; mở lại được ở màn Phụ huynh → "📖 Hướng dẫn").
 * 4 thẻ, ít chữ, tranh to, vuốt ngang hoặc bấm "Tiếp". "Bỏ qua" lúc nào cũng được.
 * Xem xong hoặc bỏ qua → ghi settings.onboardedAt để không hiện lại.
 */

/** Màn hình nhỏ của "Học tiếp" + nút 👪 — để bố mẹ nhận ra nút thật trong app. */
function artSession(): HTMLElement {
  return h(
    'div',
    { class: 'onb-mock' },
    h('div', { class: 'onb-mock-row' }, mascot('wave', 92), h('div', { class: 'onb-mock-btn primary' }, '▶ Học tiếp')),
    h(
      'div',
      { class: 'onb-mock-row' },
      h('div', { class: 'onb-mock-btn good' }, '👪 Đúng rồi'),
      h('div', { class: 'onb-mock-btn plain' }, '↻ Thử lại'),
    ),
  );
}

function artMic(): SVGSVGElement {
  const keys = [0, 1, 2, 3, 4]
    .map((i) => {
      const x = 40 + i * 32;
      return `<rect x="${x}" y="150" width="30" height="46" rx="5" fill="#fff" stroke="${P.stone}" stroke-width="2"/>
        <text x="${x + 15}" y="186" text-anchor="middle" font-size="15" font-weight="800" font-family="'Baloo 2',system-ui,sans-serif" fill="${P.indigo}">${['Đô', 'Rê', 'Mi', 'Fa', 'Sol'][i]}</text>
        ${checkBadge(x + 15, 148, 8)}`;
    })
    .join('');
  return svgRoot(
    '0 0 240 210',
    'onb-art',
    `<circle cx="120" cy="78" r="66" fill="${P.lavender}"/>
     <path d="M62 50 q-12 28 0 56 M44 38 q-20 40 0 80 M178 50 q12 28 0 56 M196 38 q20 40 0 80" fill="none" stroke="${P.violetLight}" stroke-width="5" stroke-linecap="round"/>
     <rect x="100" y="22" width="40" height="74" rx="20" fill="${P.indigo}"/>
     <path d="M108 42 H132 M108 56 H132 M108 70 H132" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
     <path d="M86 76 q0 38 34 38 q34 0 34 -38" fill="none" stroke="${P.ink}" stroke-opacity=".7" stroke-width="6" stroke-linecap="round"/>
     <path d="M120 114 V132 M104 134 H136" stroke="${P.ink}" stroke-opacity=".7" stroke-width="6" stroke-linecap="round"/>
     ${noteGlyph(206, 120, 6, P.coral)}${noteGlyph(30, 126, 5, P.mint)}${sparkle(196, 22, 8, P.sun)}
     ${keys}`,
  );
}

function artParent(): SVGSVGElement {
  return svgRoot(
    '0 0 240 210',
    'onb-art',
    `<!-- nút Phụ huynh đang nhấn giữ (vòng đếm 2 giây) -->
     <rect x="10" y="34" width="140" height="66" rx="33" fill="#fff" stroke="${P.stone}" stroke-width="2.5"/>
     <rect x="10" y="34" width="96" height="66" rx="33" fill="${P.lavender}"/>
     <text x="80" y="62" text-anchor="middle" font-size="21" font-weight="800" font-family="'Baloo 2',system-ui,sans-serif" fill="${P.ink}">Phụ huynh</text>
     <!-- ngón tay nhấn giữ -->
     <g transform="rotate(-12 104 120)">
       <rect x="90" y="76" width="30" height="92" rx="15" fill="${P.skin}" stroke="${P.skinDark}" stroke-width="2.4"/>
       <path d="M96 88 q9 -9 18 0 v6 q-9 5 -18 0 Z" fill="#fff" opacity=".75"/>
       <path d="M92 124 q12 6 24 0" fill="none" stroke="${P.skinDark}" stroke-width="2" stroke-linecap="round"/>
     </g>
     <path d="M60 22 l-5 -9 M80 18 v-11 M100 22 l5 -9" stroke="${P.violet}" stroke-width="3.5" stroke-linecap="round"/>
     <g transform="translate(190 66)">
       <circle r="26" fill="#fff" stroke="${P.stone}" stroke-width="4"/>
       <path d="M0 -26 A26 26 0 1 1 -22.5 13" fill="none" stroke="${P.violet}" stroke-width="5" stroke-linecap="round"/>
       <text y="8" text-anchor="middle" font-size="22" font-weight="800" font-family="'Baloo 2',system-ui,sans-serif" fill="${P.indigo}">2s</text>
     </g>
     <!-- tệp JSON sao lưu -->
     <g transform="translate(140 112)">
       <path d="M0 0 H62 L80 18 V74 H0 Z" fill="#fff" stroke="${P.indigo}" stroke-width="3" stroke-linejoin="round"/>
       <path d="M62 0 V18 H80" fill="${P.lavender}" stroke="${P.indigo}" stroke-width="3" stroke-linejoin="round"/>
       <rect x="10" y="30" width="60" height="22" rx="6" fill="${P.sun}"/>
       <text x="40" y="47" text-anchor="middle" font-size="16" font-weight="800" font-family="'Baloo 2',system-ui,sans-serif" fill="#8a5a00">JSON</text>
     </g>
     <g transform="translate(214 178)">
       <circle r="20" fill="${P.mint}" stroke="#fff" stroke-width="3"/>
       <path d="M0 -12 V10 M-10 1 L0 11 L10 1" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
     </g>
     <path d="${starPath(36, 150, 10)}" fill="${P.sun}"/>${sparkle(52, 186, 7, P.coral)}`,
  );
}

interface Card {
  art: () => Element;
  title: string;
  lines: Array<[string, string]>;
  chain?: string[];
  /** Khối thêm dưới các dòng (vd chuẩn chấm "Đúng rồi") */
  extra?: () => HTMLElement | null;
}

const CARDS: Card[] = [
  {
    art: () => postureArt('all'),
    title: 'Chuẩn bị chỗ học',
    lines: [
      ['📱', 'Đặt iPad trên giá nhạc của đàn'],
      ['🪑', 'Bé ngồi thẳng lưng, chân đặt vững'],
      ['⏱️', '10–15 phút/ngày · 4–5 buổi/tuần'],
    ],
  },
  {
    art: artSession,
    title: 'Mỗi buổi: bấm “Học tiếp”',
    lines: [
      ['▶', 'App tự chọn bài — không cần soạn gì'],
      ['👪', 'Bố mẹ ngồi cạnh, bấm nút 👪 khi app hỏi'],
    ],
    extra: () => whenCorrectBox('div'),
  },
  {
    art: () => mascot('wave', 150),
    title: 'Ngồi cạnh con thế nào?',
    lines: [],
    extra: () => quickTipsCard('div'),
  },
  {
    art: artMic,
    title: 'Micro nghe đàn (tuỳ chọn)',
    lines: [['🎤', 'App tự nghe và chấm nốt bé đàn']],
    chain: ['Phụ huynh', '🎤 Cài micro (3 bước)', 'Kiểm tra 5 nốt', '✅ Dùng micro cho các buổi học'],
  },
  {
    art: artParent,
    title: 'Khu vực bố mẹ',
    lines: [
      ['🔢', 'Nhấn giữ nút “Phụ huynh” 2 giây + tính một phép nhân'],
      ['💾', 'Sao lưu mỗi tuần: Phụ huynh → nút “💾 Sao lưu” trên cùng'],
    ],
    // Mở bằng tab trình duyệt → nhắc thêm vào Màn hình chính (null khi đã cài)
    extra: () => installCard(),
  },
];

export function onboardingScreen(app: App, o: { onDone(): void }): Screen {
  return (root: HTMLElement) => {
    let i = 0;
    const finish = () => {
      if (!app.store.settings.onboardedAt) app.store.updateSettings({ onboardedAt: Date.now() });
      o.onDone();
    };
    const stage = h('div', { class: 'onb-stage' });
    const dots = h('div', { class: 'onb-dots', 'aria-hidden': 'true' });
    const bar = h('div', { class: 'actions onb-actions' });

    const render = (dir = 0) => {
      const c = CARDS[i];
      const art = c.art();
      stage.replaceChildren(
        h(
          'section',
          { class: `onb-card${dir > 0 ? ' from-right' : dir < 0 ? ' from-left' : ''}`, 'aria-live': 'polite' },
          h('div', { class: 'onb-art-wrap' }, art),
          h(
            'div',
            { class: 'onb-text' },
            h('div', { class: 'onb-step' }, `${i + 1}/${CARDS.length}`),
            h('h1', { class: 'onb-title' }, c.title),
            h(
              'ul',
              { class: 'onb-lines' },
              ...c.lines.map(([ic, t]) => h('li', {}, h('span', { class: 'onb-ic', 'aria-hidden': 'true' }, ic), h('span', {}, t))),
            ),
            c.chain
              ? h(
                  'ol',
                  { class: 'onb-chain', 'aria-label': 'Các bước bật micro' },
                  ...c.chain.map((t, k) => h('li', {}, h('b', {}, String(k + 1)), t)),
                )
              : null,
            c.extra?.() ?? null,
          ),
        ),
        dots,
      );
      dots.replaceChildren(...CARDS.map((_, k) => h('span', { class: `dot${k === i ? ' on' : ''}` })));
      const last = i === CARDS.length - 1;
      const skip = button({ label: 'Bỏ qua', onTap: finish });
      skip.classList.add('btn-back');
      bar.replaceChildren();
      append(bar, [
        skip,
        i > 0 ? button({ icon: '←', label: 'Trước', onTap: () => go(-1) }) : null,
        button({
          icon: last ? '✓' : '▶',
          label: last ? 'Bắt đầu học' : 'Tiếp',
          kind: 'primary',
          big: true,
          onTap: () => (last ? finish() : go(1)),
        }),
      ]);
    };
    const go = (d: number) => {
      const n = i + d;
      if (n < 0 || n >= CARDS.length) return;
      i = n;
      render(d);
    };

    // Vuốt ngang để chuyển thẻ
    let x0: number | null = null;
    let y0 = 0;
    stage.addEventListener('pointerdown', (e) => {
      x0 = e.clientX;
      y0 = e.clientY;
    });
    stage.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    });
    stage.addEventListener('pointercancel', () => (x0 = null));

    root.append(
      h(
        'div',
        { class: 'screen onboarding' },
        h('header', { class: 'topbar onb-top' }, h('div', { class: 'topbar-title' }, '📖 Hướng dẫn nhanh cho bố mẹ')),
        stage,
        bar,
      ),
    );
    render();
  };
}
