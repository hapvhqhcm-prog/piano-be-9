/**
 * Màn Phụ huynh — mục "⚙️ Nâng cao" (thu gọn): phiên bản, cài đặt, 🎧 Album của con, dữ liệu (sao lưu / nhập / đặt lại).
 */
import { LEFT_HAND_WEEK, MAX_WEEK, POSTURE_CUE, WEEKS, levelOf } from '../../lessons/lessonEngine';
import { sessionCount } from '../../progress/history';
import type { AppData } from '../../progress/schema';
import { button, confirmDialog, h, toast } from '../components/dom';
import { APP_VERSION, checkForUpdate, isUpdateReady } from '../../pwa/updater';
import { startScreen } from './start';
import { cancelSpeech, hasVietnameseVoice, speak } from '../../audio/voice';
import { BACKUP_MESSAGE, exportBackup } from '../../progress/backup';
import { TWO_HAND_DEFAULT } from '../../audio/twoHand';
import { albumParentCard } from './albumParent';
import { diagnosticsScreen, fmtDate, micTestScreen, segmented, type ParentCtx, type ParentUxSettings } from './parentShared';

/** Phiên bản đang chạy + kiểm tra bản mới + 🩺 Kiểm tra iPad */
function versionCard(c: ParentCtx): HTMLElement {
  const { app, say } = c;
  return h(
    'section',
    { class: 'card version-card' },
    h('p', {}, 'Phiên bản đang chạy: ', h('b', {}, APP_VERSION)),
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
  );
}

/** Cài đặt: giọng đọc, tư thế, độ dài buổi, tự chuyển nốt, tuần hiện tại, micro, nhạc đệm, tay trái, giới hạn ngày, tên bé */
function settingsCard(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
  const { app, store, set, say } = c;
  const s = d.settings;
  const week = d.progress.currentWeek;
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Cài đặt'),
    h('h3', {}, '🔊 Giọng đọc hướng dẫn'),
    h('p', { class: 'muted' }, 'App đọc to câu hướng dẫn cho bé (bé đọc chậm). Cần giọng tiếng Việt trên iPad: Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt.'),
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
        onTap: () =>
          hasVietnameseVoice()
            ? void speak(app, 'Chào con! Mình cùng học đàn nhé.')
            : toast('iPad chưa có giọng đọc tiếng Việt'),
      }),
    ),
    // v5.2 (OWNER duyệt 2026-10-08): mặc định thẻ tư thế đầy đủ chỉ đầu tuần; bật → mọi buổi
    h('h3', {}, '🧘 Nhắc tư thế đầy đủ mỗi buổi'),
    h('p', { class: 'muted' }, `Tắt (mặc định): mỗi buổi chỉ nhắc một dòng "${POSTURE_CUE}"; 3 thẻ tư thế đầy đủ hiện ở buổi đầu mỗi tuần.`),
    segmented(
      [
        { value: 'off', label: 'Tắt' },
        { value: 'on', label: 'Bật' },
      ],
      (s as ParentUxSettings).postureFull ? 'on' : 'off',
      (v) => set({ postureFull: v === 'on' }),
    ),
    h('h3', {}, 'Độ dài buổi'),
    segmented(
      [10, 15, 20].map((m) => ({ value: m as 10 | 15 | 20, label: `${m} phút` })),
      s.sessionMinutes,
      (v) => set({ sessionMinutes: v }),
    ),
    h('h3', {}, 'Tự chuyển nốt sau khi bấm "Đúng rồi"'),
    segmented(
      [
        { value: 'off', label: 'Tắt' },
        { value: 'on', label: 'Bật' },
      ],
      s.autoAdvance ? 'on' : 'off',
      (v) => set({ autoAdvance: v === 'on' }),
    ),
    s.autoAdvance
      ? segmented(
          [2, 4, 6, 8, 10].map((n) => ({ value: n, label: `${n} giây` })),
          s.autoAdvanceDelaySec,
          (v) => set({ autoAdvanceDelaySec: v }),
        )
      : null,
    h('h3', {}, `Tuần hiện tại (1–${MAX_WEEK}) — chỉ đổi khi cần`),
    (() => {
      const sel = h('select', { class: 'text-in' }) as HTMLSelectElement;
      for (const w of WEEKS) {
        const o = h('option', { value: String(w.week) }, `${levelOf(w.week).name} · Tuần ${w.week} · ${w.islandEmoji} ${w.island}`);
        if (w.week === week) o.setAttribute('selected', '');
        sel.append(o);
      }
      // Đổi tuần phải xác nhận (chạm nhầm ô chọn = bé nhảy cóc / học lại cả tuần)
      sel.addEventListener('change', () => {
        const to = Number(sel.value);
        sel.value = String(week);
        if (to === week) return;
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
      return sel;
    })(),
    h('h3', {}, '🎤 Nghe đàn bằng micro'),
    h(
      'p',
      { class: 'muted' },
      'App nghe đàn cơ và tự chấm từng nốt. Xử lý ngay trên iPad, không gửi đi đâu; chỉ ghi TẠM khi bé đàn để "🎧 Nghe lại" (rời màn là xóa). Nút "Đúng rồi" của bố mẹ vẫn dùng được. Bật bằng "Cài micro (3 bước)".',
    ),
    h(
      'p',
      { class: 'muted' },
      '🎧 "Nghe lại con đàn": khi micro bật, app giữ TẠM tiếng đàn của lượt vừa chơi để bé bấm nghe lại và tự nhận xét. Không gửi đi đâu; chơi lượt mới hoặc rời màn là xóa — TRỪ bản hay nhất của mỗi bài được giữ trong "🎧 Album của con" (chỉ trên iPad này; tắt / xóa ở mục Nâng cao). Micro tắt thì không ghi gì.',
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
    s.micEnabled
      ? h(
          'div',
          {},
          h('h3', {}, 'Micro nghe đúng → tự sang nốt sau'),
          segmented(
            [
              { value: 'on', label: 'Bật' },
              { value: 'off', label: 'Tắt' },
            ],
            s.micAutoNext ? 'on' : 'off',
            (v) => set({ micAutoNext: v === 'on' }),
          ),
        )
      : null,
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
    h('p', { class: 'muted' }, 'Bài hai tay: micro nghe riêng tay phải và tay trái (thiếu tay nào, nhầm phím nào). Tắt = micro chỉ nghe một nốt mỗi lúc như trước. Nút "👪 Bố mẹ: tiếp" luôn còn.'),
    segmented(
      [
        { value: 'on', label: 'Bật' },
        { value: 'off', label: 'Tắt' },
      ],
      (s.micTwoHand ?? TWO_HAND_DEFAULT) ? 'on' : 'off',
      (v) => set({ micTwoHand: v === 'on' }),
    ),
    h('h3', {}, 'Nhạc đệm khi đàn theo nhịp ("bố mẹ đàn cùng")'),
    h('p', { class: 'muted' }, 'Khi micro đang bật, nhạc đệm tự tắt để micro nghe rõ tiếng đàn của bé.'),
    segmented(
      [
        { value: 'on', label: 'Bật' },
        { value: 'off', label: 'Tắt' },
      ],
      s.accompaniment ? 'on' : 'off',
      (v) => set({ accompaniment: v === 'on' }),
    ),
    h('h3', {}, `Tay trái — tự bật từ tuần ${LEFT_HAND_WEEK}`),
    segmented(
      [
        { value: 'auto', label: `Tự động (tuần ${LEFT_HAND_WEEK})` },
        { value: 'on', label: 'Bật ngay' },
      ],
      s.leftHandEnabled ? 'on' : 'auto',
      (v) => set({ leftHandEnabled: v === 'on' }),
    ),
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
    h('h3', {}, 'Tên của bé (hiện ở màn chào)'),
    (() => {
      const input = h('input', { class: 'text-in', type: 'text', value: d.learner.name, maxlength: '20' });
      input.addEventListener('change', () => store.setLearnerName(input.value.trim()));
      return input;
    })(),
  );
}

/** Dữ liệu: sao lưu, nhập JSON (phải xác nhận), đặt lại toàn bộ (2 bước) */
function dataCard(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
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
    h('h2', {}, 'Dữ liệu'),
    h(
      'p',
      { class: 'muted' },
      'Lưu trữ bền vững: ',
      h('b', {}, app.storagePersisted === true ? 'có' : app.storagePersisted === false ? 'không' : 'chưa rõ'),
      app.storagePersisted === false ? ' — nên thêm app vào Màn hình chính và sao lưu thường xuyên.' : '',
    ),
    h('p', { class: 'muted' }, 'Mọi dữ liệu chỉ nằm trên iPad này. Nên bấm “Sao lưu dữ liệu” mỗi tuần (lưu vào Tệp / Ghi chú).'),
    h(
      'div',
      { class: 'row' },
      button({
        icon: '💾',
        label: 'Sao lưu dữ liệu',
        kind: 'primary',
        onTap: () => void exportBackup(store).then((r) => say(BACKUP_MESSAGE[r])),
      }),
      button({ icon: '⬆', label: 'Nhập từ tệp JSON', onTap: () => fileIn.click() }),
      fileIn,
    ),
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

/** Mục "Nâng cao" (thu gọn): phiên bản, cài đặt, Album, dữ liệu */
export function advancedSection(c: ParentCtx, d: Readonly<AppData>): HTMLElement {
  const adv: HTMLElement[] = [];
  adv.push(versionCard(c), settingsCard(c, d));
  // (+ 2026-10-08) 🎧 Album của con: bật/tắt lưu, xoá (KHÔNG nằm trong bản sao lưu)
  const album = albumParentCard();
  adv.push(album, dataCard(c, d), h('p', { class: 'muted foot' }, 'Piano bé · không mạng, không quảng cáo, không thu thập dữ liệu.'));
  const details = h('details', { class: 'adv' }, h('summary', {}, '⚙️ Nâng cao: cài đặt · dữ liệu · phiên bản'), ...adv);
  details.open = c.ui.advOpen;
  details.addEventListener('toggle', () => (c.ui.advOpen = details.open));
  return details;
}
