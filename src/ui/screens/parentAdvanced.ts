/**
 * Màn Phụ huynh — mục "⚙️ Nâng cao" (thu gọn). (2026-10-17, OWNER duyệt — gọn lại ~5 cài đặt chính):
 *   Cài đặt chính (tên bé · độ dài buổi · giọng đọc · micro · tuần — chọn Cấp rồi Tuần) → 💾 Dữ liệu (sao lưu) → 🆕 Bản mới
 *   → 🧑‍🔧 "Cho người hỗ trợ" (thu gọn, mọi thứ còn lại: tự chuyển nốt, micro tự sang nốt / chấm nhịp / 2 tay, nhạc đệm, tay
 *   trái sớm, tư thế đầy đủ, giới hạn ngày, kiểm tra bản mới, 🩺 Kiểm tra iPad, nhập dữ liệu, đặt lại, chỉnh micro, Album).
 */
import { LEFT_HAND_WEEK, MAX_WEEK, POSTURE_CUE, WEEKS, levelOf } from '../../lessons/lessonEngine';
import { LEVELS } from '../../lessons/curriculum';
import { sessionCount } from '../../progress/history';
import type { AppData } from '../../progress/schema';
import { button, confirmDialog, h, toast } from '../components/dom';
import { APP_VERSION, checkForUpdate, isUpdateReady } from '../../pwa/updater';
import { startScreen } from './start';
import { cancelSpeech, hasVietnameseVoice, speak } from '../../audio/voice';
import { BACKUP_MESSAGE, exportBackup } from '../../progress/backup';
import { TWO_HAND_DEFAULT } from '../../audio/twoHand';
import { albumParentCard } from './albumParent';
import { ALBUM_NOT_IN_BACKUP } from '../../progress/newDevice';
import { diagnosticsScreen, fmtDate, fmtMs, healthCheckScreen, micTestScreen, segmented, storageText, type ParentCtx, type ParentUxSettings } from './parentShared';
import { versionsCard } from './parentHelp';

/** 🔄 Kiểm tra bản mới + 🩺 Kiểm tra iPad + 🩺 Kiểm tra sức khỏe app (cho người hỗ trợ) */
function toolsCard(c: ParentCtx): HTMLElement {
  const { app, say } = c;
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, '🔧 Công cụ'),
    h(
      'div',
      { class: 'row' },
      button({
        icon: '🔄',
        label: 'Kiểm tra bản mới',
        onTap: async () => {
          if (!navigator.onLine) return say('iPad đang không có mạng — bật Wi‑Fi rồi thử lại.');
          say('Đang kiểm tra…');
          await checkForUpdate(true);
          await new Promise((r) => setTimeout(r, 5000));
          say(
            isUpdateReady()
              ? '✅ Đã tải bản mới. Bấm "Về màn của bé" — app sẽ tự khởi động lại bằng bản mới.'
              : 'Đang dùng bản mới nhất (nếu vừa có bản cập nhật, đợi 1–2 phút rồi thử lại).',
          );
        },
      }),
      button({ icon: '🩺', label: 'Kiểm tra iPad (gửi người hỗ trợ)', onTap: () => app.show(diagnosticsScreen(app)) }),
      button({ icon: '🩺', label: 'Kiểm tra sức khỏe app', onTap: () => app.show(healthCheckScreen(app)) }),
      button({ icon: '🎤', label: 'Chỉnh micro (người hỗ trợ)', onTap: () => app.show(micTestScreen(app)) }),
    ),
  );
}

/** Ô chọn tuần: chọn Cấp (4) rồi Tuần trong cấp (≤ 12) — không phải danh sách 43 dòng. Đổi tuần phải xác nhận. */
function weekPicker(c: ParentCtx, week: number): HTMLElement {
  const { store, say } = c;
  const lvSel = h('select', { class: 'text-in week-pick-level', 'aria-label': 'Chọn cấp' }) as HTMLSelectElement;
  const wkSel = h('select', { class: 'text-in week-pick-week', 'aria-label': 'Chọn tuần' }) as HTMLSelectElement;
  const cur = levelOf(week);
  for (const l of LEVELS) {
    const o = h('option', { value: String(l.level), 'data-from': String(l.weeks[0]), 'data-to': String(Math.min(l.weeks[1], MAX_WEEK)) }, l.name);
    if (l.level === cur.level) o.setAttribute('selected', '');
    lvSel.append(o);
  }
  const fillWeeks = (level: number, pick: number | null) => {
    const l = LEVELS.find((x) => x.level === level) ?? cur;
    wkSel.replaceChildren(h('option', { value: '' }, 'Chọn tuần…'));
    for (const w of WEEKS) {
      if (w.week < l.weeks[0] || w.week > l.weeks[1]) continue;
      const o = h('option', { value: String(w.week) }, `Tuần ${w.week} · ${w.islandEmoji} ${w.island}${w.week === week ? ' (đang học)' : ''}`);
      if (w.week === pick) o.setAttribute('selected', '');
      wkSel.append(o);
    }
  };
  fillWeeks(cur.level, week);
  lvSel.addEventListener('change', () => fillWeeks(Number(lvSel.value), null));
  // Đổi tuần phải xác nhận (chạm nhầm ô chọn = bé nhảy cóc / học lại cả tuần)
  wkSel.addEventListener('change', () => {
    const to = Number(wkSel.value);
    lvSel.value = String(cur.level);
    fillWeeks(cur.level, week);
    if (!to || to === week) return;
    confirmDialog({
      title: `Chuyển bé sang tuần ${to}?`,
      text:
        to > week
          ? `Bé sẽ bỏ qua bài của tuần ${week}${to > week + 1 ? `–${to - 1}` : ''}. Chỉ nên làm khi bé đã biết những bài đó. Kết quả cũ vẫn giữ.`
          : `Bé quay lại học tuần ${to}. Kết quả cũ vẫn giữ; app tự sang tuần mới khi bé đạt mục tiêu.`,
      okLabel: `Sang tuần ${to}`,
      onOk: () => {
        store.setCurrentWeek(to);
        // "Ở lại tuần" gắn với tuần cũ — bỏ đi để sau này bé không bị giữ im lặng khi tới lại tuần đó
        if (store.settings.holdWeek != null) store.updateSettings({ holdWeek: null });
        say(`Đã chuyển sang tuần ${to}.`);
      },
    });
  });
  return h('div', { class: 'row week-picker' }, lvSel, wkSel);
}

/** ~5 cài đặt chính: tên bé, độ dài buổi, giọng đọc, micro, tuần */
function mainSettingsCard(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
  const { app, store, set } = c;
  const s = d.settings;
  const week = d.progress.currentWeek;
  return h(
    'section',
    { class: 'card main-settings' },
    h('h2', {}, 'Cài đặt'),
    h('h3', {}, 'Tên của bé (hiện ở màn chào)'),
    (() => {
      const input = h('input', { class: 'text-in', type: 'text', value: d.learner.name, maxlength: '20' });
      input.addEventListener('change', () => store.setLearnerName(input.value.trim()));
      return input;
    })(),
    h('h3', {}, 'Độ dài buổi'),
    segmented(
      [10, 15, 20].map((m) => ({ value: m as 10 | 15 | 20, label: `${m} phút` })),
      s.sessionMinutes,
      (v) => set({ sessionMinutes: v }),
    ),
    h('h3', {}, '🔊 Giọng đọc hướng dẫn'),
    h('p', { class: 'muted' }, 'App đọc to câu hướng dẫn cho bé. Cần giọng tiếng Việt: Cài đặt iPad → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt.'),
    h(
      'div',
      { class: 'row' },
      segmented(
        [
          { value: 'on', label: 'Bật' },
          { value: 'off', label: 'Tắt' },
        ],
        s.voice === false ? 'off' : 'on',
        (v) => {
          if (v === 'off') cancelSpeech();
          set({ voice: v === 'on' });
        },
      ),
      button({
        icon: '🔊',
        label: 'Nghe thử',
        onTap: () => (hasVietnameseVoice() ? void speak(app, 'Chào con! Mình cùng học đàn nhé.') : toast('iPad chưa có giọng đọc tiếng Việt')),
      }),
    ),
    h('h3', { 'data-guide': 'mic' }, '🎤 Nghe đàn bằng micro'),
    h(
      'p',
      { class: 'muted' },
      'App nghe đàn cơ và tự chấm từng nốt — xử lý ngay trên iPad, không gửi đi đâu. Bản thu hay nhất của mỗi bài vào “🎧 Album của con”. Nút “Đúng rồi” của bố mẹ vẫn dùng được.',
    ),
    h(
      'div',
      { class: 'row' },
      segmented(
        [
          { value: 'off', label: 'Tắt' },
          { value: 'on', label: 'Bật' },
        ],
        s.micEnabled ? 'on' : 'off',
        (v) => (v === 'on' && !s.micEnabled ? app.show(micTestScreen(app)) : set({ micEnabled: v === 'on' })),
      ),
      button({ icon: '🎤', label: s.micEnabled ? 'Thử / chỉnh micro' : 'Cài micro (3 bước)', onTap: () => app.show(micTestScreen(app)) }),
    ),
    h('h3', { 'data-guide': 'week' }, `Tuần hiện tại: ${week} — chỉ đổi khi cần`),
    weekPicker(c, week),
  );
}

/** Cho người hỗ trợ: các cài đặt ít dùng */
function supportSettingsCard(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
  const { set } = c;
  const s = d.settings;
  const onOff = (cur: boolean, pick: (on: boolean) => void, onFirst = false) =>
    segmented(
      onFirst
        ? [
            { value: 'on', label: 'Bật' },
            { value: 'off', label: 'Tắt' },
          ]
        : [
            { value: 'off', label: 'Tắt' },
            { value: 'on', label: 'Bật' },
          ],
      cur ? 'on' : 'off',
      (v) => pick(v === 'on'),
    );
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Cài đặt khác'),
    h('h3', {}, 'Tự chuyển nốt sau khi bấm "Đúng rồi"'),
    onOff(s.autoAdvance, (on) => set({ autoAdvance: on })),
    s.autoAdvance
      ? segmented(
          [2, 4, 6, 8, 10].map((n) => ({ value: n, label: `${n} giây` })),
          s.autoAdvanceDelaySec,
          (v) => set({ autoAdvanceDelaySec: v }),
        )
      : null,
    h('h3', {}, 'Micro nghe đúng → tự sang nốt sau'),
    onOff(s.micAutoNext, (on) => set({ micAutoNext: on }), true),
    h('h3', {}, 'Micro chấm nhịp: mức độ'),
    h('p', { class: 'muted' }, 'Dễ = cho phép sớm/muộn nhiều hơn (nên dùng lúc đầu). Khó = gần như chính xác tuyệt đối.'),
    segmented(
      [
        { value: 'easy' as const, label: 'Dễ' },
        { value: 'normal' as const, label: 'Vừa' },
        { value: 'strict' as const, label: 'Khó' },
      ],
      s.timing ?? 'easy',
      (v) => set({ timing: v }),
    ),
    h('h3', {}, 'Micro chấm cả 2 tay (thử nghiệm)'),
    h('p', { class: 'muted' }, 'Bài hai tay: micro nghe riêng tay phải và tay trái. Tắt = micro chỉ nghe một nốt mỗi lúc. Nút "👪 Bố mẹ: tiếp" luôn còn.'),
    onOff(s.micTwoHand ?? TWO_HAND_DEFAULT, (on) => set({ micTwoHand: on }), true),
    h('h3', {}, 'Nhạc nền khi đàn theo nhịp ("bố mẹ đàn cùng")'),
    h(
      'p',
      { class: 'muted' },
      'Micro BẬT: chỉ có nhạc nền bộ gõ (trống nhẹ, micro không nghe nhầm thành nốt đàn). Micro TẮT: có thêm nhạc đệm piano (hợp âm theo bài). Tắt mục này = chỉ tiếng tích nhịp.',
    ),
    onOff(s.accompaniment, (on) => set({ accompaniment: on }), true),
    h('h3', {}, `Tay trái — tự bật từ tuần ${LEFT_HAND_WEEK}`),
    segmented(
      [
        { value: 'auto', label: `Tự động (tuần ${LEFT_HAND_WEEK})` },
        { value: 'on', label: 'Bật ngay' },
      ],
      s.leftHandEnabled ? 'on' : 'auto',
      (v) => set({ leftHandEnabled: v === 'on' }),
    ),
    // v5.2 (OWNER duyệt 2026-10-08): mặc định thẻ tư thế đầy đủ chỉ đầu tuần; bật → mọi buổi
    h('h3', {}, '🧘 Nhắc tư thế đầy đủ mỗi buổi'),
    h('p', { class: 'muted' }, `Tắt (mặc định): mỗi buổi chỉ nhắc một dòng "${POSTURE_CUE}"; 3 thẻ tư thế đầy đủ hiện ở buổi đầu mỗi tuần.`),
    onOff(!!(s as ParentUxSettings).postureFull, (on) => set({ postureFull: on })),
    h('h3', {}, 'Giới hạn mỗi ngày (mặc định không giới hạn)'),
    segmented(
      [
        { value: 'none' as const, label: 'Không giới hạn' },
        { value: 15 as const, label: '15 phút' },
        { value: 20 as const, label: '20 phút' },
        { value: 30 as const, label: '30 phút' },
      ],
      s.dailyLimit,
      (v) => set({ dailyLimit: v }),
    ),
  );
}

/** 💾 Dữ liệu: trạng thái + "Sao lưu dữ liệu" + cảnh báo xóa app. Mốc Hướng dẫn: 'data'. */
function dataCard(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
  const { app, store, say } = c;
  const last = d.settings.lastBackupAt ?? 0;
  const storageSpan = h('span', {});
  void storageText(store).then((t) => (storageSpan.textContent = t ? ` · ${t}` : ''));
  return h(
    'section',
    { class: 'card', 'data-guide': 'data' },
    h('h2', {}, '💾 Dữ liệu'),
    h(
      'p',
      { class: 'muted backup-line' },
      last ? `Sao lưu gần nhất: ${fmtMs(last)}` : 'Chưa sao lưu lần nào',
      ' · Lưu trữ bền vững: ',
      h('b', {}, app.storagePersisted === true ? 'có' : app.storagePersisted === false ? 'không' : 'chưa rõ'),
      storageSpan,
    ),
    h(
      'p',
      { class: 'banner warn' },
      '⚠️ Tiến độ của bé chỉ nằm trên iPad này. ',
      h('b', {}, 'Xóa biểu tượng app = mất hết dữ liệu.'),
      ' Sao lưu mỗi tuần (thẻ “Hôm nay”: xem báo cáo tuần → Sao lưu).',
    ),
    button({ icon: '💾', label: 'Sao lưu dữ liệu', kind: 'primary', onTap: () => void exportBackup(store).then((r) => say(BACKUP_MESSAGE[r])) }),
    h('p', { class: 'muted' }, `📀 ${ALBUM_NOT_IN_BACKUP}`),
  );
}

/** Cho người hỗ trợ: nhập JSON (phải xác nhận), đặt lại toàn bộ (2 bước) */
function importResetCard(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
  const { app, store, say, render } = c;
  // Dữ liệu — nhập JSON phải xác nhận trước (thay TOÀN BỘ dữ liệu hiện tại; bản cũ vẫn được lưu dự phòng)
  const doImport = (text: string, force = false) => {
    const r = store.importJSON(text, { force });
    if (r.ok) return say('✅ Đã nhập dữ liệu.');
    // Không cất được bản dự phòng (bộ nhớ đầy) → hỏi lại trước khi ghi đè mà KHÔNG có bản dự phòng
    if ('archiveFailed' in r && r.archiveFailed) {
      return confirmDialog({
        title: 'Không cất được bản dự phòng',
        text: 'Bộ nhớ iPad gần đầy nên không cất được bản dự phòng dữ liệu hiện tại. Nên bấm "💾 Sao lưu" trước. Vẫn nhập và thay dữ liệu?',
        okIcon: '⬆',
        okLabel: 'Vẫn nhập',
        onOk: () => doImport(text, true),
      });
    }
    say(`❌ Không nhập được: ${r.error}`);
  };
  const confirmImport = (text: string) => {
    let incoming: { progress?: { currentWeek?: unknown }; sessions?: unknown } | null = null;
    try {
      incoming = JSON.parse(text);
    } catch {
      return doImport(text); // không phải JSON → importJSON báo lỗi rõ ràng
    }
    const wk = typeof incoming?.progress?.currentWeek === 'number' ? incoming.progress.currentWeek : '?';
    const ns = Array.isArray(incoming?.sessions) ? incoming.sessions.length : '?';
    // (+ 2026-10-08) Ngày học gần nhất trong bản nhập — để bố mẹ biết bản sao lưu cũ hay mới
    const lastDate = Array.isArray(incoming?.sessions)
      ? (incoming.sessions as Array<{ date?: unknown }>).reduce((m, x) => (typeof x?.date === 'string' && x.date > m ? x.date : m), '')
      : '';
    confirmDialog({
      title: 'Thay dữ liệu?',
      text: `Thay dữ liệu hiện tại (tuần ${d.progress.currentWeek}, ${sessionCount(d)} buổi) bằng dữ liệu nhập (tuần ${wk}, ${ns} buổi${lastDate ? `, học gần nhất ${fmtDate(lastDate)}` : ''})?`,
      okIcon: '⬆',
      okLabel: 'Thay dữ liệu',
      danger: true,
      onOk: () => doImport(text),
    });
  };
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden-file' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    if (!f) return;
    const text = await f.text();
    fileIn.value = ''; // chọn lại cùng file vẫn chạy
    confirmImport(text);
  });
  const paste = h('textarea', { class: 'text-in paste', placeholder: 'Hoặc dán nội dung JSON vào đây…' });
  const confirmIn = h('input', { class: 'text-in', type: 'text', placeholder: 'Gõ XOA' });

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, '⬆ Nhập lại dữ liệu (đổi iPad / lỡ xóa app)'),
    h('p', { class: 'muted' }, 'Chọn tệp sao lưu (.json) đã lưu trong Tệp. Dữ liệu hiện tại được cất một bản dự phòng trước khi thay.'),
    h('div', { class: 'row' }, button({ icon: '⬆', label: 'Nhập từ tệp JSON', onTap: () => fileIn.click() }), fileIn),
    paste,
    button({
      icon: '⬆',
      label: 'Nhập từ chữ đã dán',
      onTap: () => confirmImport(paste.value),
    }),
    h('h3', {}, 'Đặt lại toàn bộ dữ liệu'),
    c.ui.resetStep === 0
      ? button({
          icon: '🗑️',
          label: 'Đặt lại toàn bộ dữ liệu…',
          kind: 'danger',
          onTap: () => {
            c.ui.resetStep = 1;
            render();
          },
        })
      : h(
          'div',
          { class: 'reset-box' },
          h('p', {}, 'Bước 2/2: Mọi tiến độ và kết quả sẽ bị xóa. Gõ chữ ', h('b', {}, 'XOA'), ' rồi bấm Xóa hẳn.'),
          confirmIn,
          h(
            'div',
            { class: 'row' },
            button({
              label: 'Hủy',
              onTap: () => {
                c.ui.resetStep = 0;
                render();
              },
            }),
            button({
              icon: '🗑️',
              label: 'Xóa hẳn',
              kind: 'danger',
              onTap: () => {
                if (confirmIn.value.trim().toUpperCase() !== 'XOA') return say('Chưa gõ đúng chữ XOA.');
                const r = store.resetAll();
                if (!r.ok && 'archiveFailed' in r && r.archiveFailed) {
                  // Bộ nhớ đầy: không cất được bản dự phòng → hỏi lần nữa trước khi xóa hẳn
                  return confirmDialog({
                    title: 'Không cất được bản dự phòng',
                    text: 'Bộ nhớ iPad gần đầy nên KHÔNG cất được bản dự phòng. Xóa rồi sẽ không lấy lại được. Vẫn xóa hẳn?',
                    okIcon: '🗑️',
                    okLabel: 'Vẫn xóa',
                    onOk: () => {
                      const f = store.resetAll({ force: true });
                      if (!f.ok) return say(`❌ Chưa xóa được: ${f.error}`);
                      app.show(startScreen(app));
                    },
                  });
                }
                if (!r.ok) return say(`❌ Chưa xóa được: ${r.error}`); // (+ 2026-10-08) ghi lỗi → báo, không giả vờ đã xóa
                app.show(startScreen(app));
              },
            }),
          ),
        ),
  );
}

/** Mục "Nâng cao" (thu gọn): cài đặt chính, dữ liệu, bản mới, "Cho người hỗ trợ" (thu gọn) */
export function advancedSection(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
  const support = h(
    'details',
    { class: 'adv-support' },
    h('summary', {}, '🧑‍🔧 Cho người hỗ trợ (kỹ thuật, ít dùng)'),
    supportSettingsCard(c, d),
    toolsCard(c),
    // (+ 2026-10-08) 🎧 Album của con: bật/tắt lưu, xoá (KHÔNG nằm trong bản sao lưu)
    albumParentCard(),
    importResetCard(c, d),
  );
  support.open = c.ui.supportOpen;
  support.addEventListener('toggle', () => (c.ui.supportOpen = support.open));
  const details = h(
    'details',
    { class: 'adv' },
    h('summary', {}, '⚙️ Nâng cao: cài đặt · dữ liệu · bản mới'),
    mainSettingsCard(c, d),
    dataCard(c, d),
    versionsCard(d),
    support,
    h('p', { class: 'muted foot' }, `Piano bé ${APP_VERSION} · không mạng, không quảng cáo, không thu thập dữ liệu.`),
  );
  details.open = c.ui.advOpen;
  details.addEventListener('toggle', () => (c.ui.advOpen = details.open));
  return details;
}
