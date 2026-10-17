/**
 * (+ 2026-10-17, OWNER duyệt) 🩺 KIỂM TRA SỨC KHỎE APP — hằng tháng, ~3 phút, bố mẹ làm (màn của phụ huynh, nạp muộn).
 * Khi nào mời: đầu tháng / sau ≥ 14 ngày nghỉ / sau khi iPadOS đổi (pwa/healthCheck.ts healthCheckDue) — việc thứ 3 của
 * thẻ "✅ Hôm nay bố mẹ cần".
 *   1) 💾 Sao lưu (chỉ ✓ khi sao lưu THÀNH CÔNG)
 *   2) 🔊 Phát thử tiếng + 🗣️ Nghe thử giọng đọc (bố mẹ trả lời nghe rõ / không)
 *   3) 🎙️ Đo micro 1 phút (dùng lại "Đo micro & tạo báo cáo" — micAutoReport.ts) → so với lần kiểm tra trước: tốt hơn / như
 *      cũ / kém hơn + đổi độ nhạy một chạm (kể cả GIẢM khi phòng ồn)
 *   4) ⏱️ Đo độ trễ loa → micro (> 120 ms → "đang dùng loa / tai nghe Bluetooth?")
 *   5) ✅ Bảng kiểm 5 ý (Tự động khóa ≥ 5 phút, mở từ Màn hình chính, nắp đàn mở, iPad trên giá nhạc, không loa Bluetooth)
 *   6) 📤 Gửi kết quả (MỘT lần chia sẻ: kết quả kiểm tra + thông tin máy + lỗi gần đây + báo cáo micro)
 * Xong → lưu bản tóm tắt làm mốc so sánh tháng sau (localStorage riêng của iPad — saveHealth) + settings.ops.healthAt.
 */
import { MicListener } from '../../audio/MicListener';
import { BLUETOOTH_LIKELY_MS, LATENCY_GAP, LATENCY_MAX, LATENCY_PINGS, estimateLatency } from '../../audio/latency';
import type { MicReport } from '../../audio/micReport';
import { loadMicReport } from '../../audio/micLogStore';
import { SENS_NAME } from '../../audio/micTune';
import { cancelSpeech } from '../../audio/voice';
import { BACKUP_MESSAGE, exportBackup, isStandalone } from '../../progress/backup';
import { deviceText, parseDevice } from '../../pwa/diagnostics';
import { readErrors } from '../../pwa/errorLog';
import {
  HEALTH_LATENCY_BT_MS,
  MIC_TREND_TEXT,
  compareMic,
  loadHealth,
  mergeOps,
  readOps,
  saveHealth,
  type HealthRecord,
} from '../../pwa/healthCheck';
import { APP_VERSION } from '../../pwa/updater';
import type { App } from '../App';
import { actionBar, backButton, button, h, toast } from '../components/dom';
import { createAutoReport } from './micAutoReport';
import { SENS_LABEL, type MicTestCtx } from './micTestShared';
import { parentScreen } from './parent';
import '../../styles/parentux.css';
import '../../styles/diagnostics.css';

export const HEALTH_CHECKLIST = [
  { id: 'autolock', text: 'Cài đặt iPad → Màn hình & Độ sáng → Tự động khóa: 5 phút trở lên (hoặc Không bao giờ)' },
  { id: 'homescreen', text: 'Mở app từ biểu tượng 🎹 trên Màn hình chính (không mở bằng tab Safari)' },
  { id: 'lid', text: 'Nắp đàn (nắp trên / cửa trước) mở để micro nghe rõ' },
  { id: 'stand', text: 'iPad đặt trên giá nhạc, micro (cạnh dưới) hướng về đàn' },
  { id: 'nobt', text: 'Không dùng loa / tai nghe Bluetooth khi tập (tiếng bị trễ)' },
] as const;

const fmtTime = (ms: number) => new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Bản chữ gửi người hỗ trợ (thuần — test được). */
export function healthReportText(r: HealthRecord, extra: { device: string; standalone: boolean; errors: string[]; micText: string | null; prevAt: number | null; trend: string | null }): string {
  const yn = (v: 'yes' | 'no' | null | undefined) => (v === 'yes' ? '✅ nghe rõ' : v === 'no' ? '❌ không nghe thấy' : '— chưa thử');
  const L: string[] = [];
  L.push('🩺 Piano bé — kiểm tra sức khỏe app');
  L.push(`Lúc: ${fmtTime(r.at)} · Bản app: ${APP_VERSION} · ${extra.device} · ${extra.standalone ? 'mở từ Màn hình chính' : 'mở bằng tab trình duyệt'}`);
  if (extra.prevAt) L.push(`Lần kiểm tra trước: ${fmtTime(extra.prevAt)}`);
  L.push('');
  L.push(`1) Sao lưu: ${r.backup ? '✅ đã sao lưu' : '❌ chưa'}`);
  L.push(`2) Tiếng đàn: ${yn(r.sound)} · Giọng đọc: ${yn(r.voice)}`);
  L.push(
    `3) Micro: ${r.mic ? `nghe đúng ${r.mic.hits}/${r.mic.total} nốt, nốt nhẹ ${r.mic.softHits}/${r.mic.softTotal}, độ nhạy ${SENS_NAME[r.mic.sensitivity as keyof typeof SENS_NAME] ?? r.mic.sensitivity}` : '— chưa đo'}${extra.trend ? ` · ${extra.trend}` : ''}`,
  );
  L.push(`4) Độ trễ loa → micro: ${r.latencyMs != null ? `${r.latencyMs} ms${r.latencyMs > HEALTH_LATENCY_BT_MS ? ' (cao — loa Bluetooth?)' : ''}` : '— chưa đo'}`);
  const ck = new Set(r.checklist ?? []);
  L.push(`5) Bảng kiểm: ${HEALTH_CHECKLIST.filter((x) => ck.has(x.id)).length}/${HEALTH_CHECKLIST.length}`);
  for (const x of HEALTH_CHECKLIST) L.push(`   ${ck.has(x.id) ? '✅' : '⬜'} ${x.text}`);
  if (extra.errors.length) {
    L.push('');
    L.push('[🐞 Lỗi gần đây]');
    for (const e of extra.errors) L.push(e);
  }
  if (extra.micText) {
    L.push('');
    L.push('--- Báo cáo micro ---');
    L.push(extra.micText);
  }
  return L.join('\n');
}

export function healthCheckScreen(app: App, onBack?: () => void) {
  return (root: HTMLElement) => {
    const store = app.store;
    const back = onBack ?? (() => app.show(parentScreen(app)));
    const prev = loadHealth();
    const rec: HealthRecord = { at: Date.now(), backup: false, sound: null, voice: null, mic: null, latencyMs: null, checklist: [] };
    let micReport: MicReport | null = null;
    let disposed = false;

    const steps = h('ol', { class: 'health-steps' });
    const card = (n: number, done: boolean, title: string, ...body: (HTMLElement | null)[]) =>
      h(
        'li',
        { class: `card health-step${done ? ' done' : ''}`, dataset: { step: String(n) } },
        h('h2', {}, h('span', { class: 'health-n', 'aria-hidden': 'true' }, done ? '✓' : String(n)), title),
        ...body,
      );

    // ---------- 1) Sao lưu
    let backupMsg = '';
    const doBackup = () =>
      void exportBackup(store).then((r) => {
        rec.backup = rec.backup || r !== 'failed';
        backupMsg = BACKUP_MESSAGE[r];
        render();
      });

    // ---------- 2) Tiếng + giọng
    const ask = (key: 'sound' | 'voice') =>
      h(
        'div',
        { class: 'diag-ask' },
        h('span', {}, 'Bố mẹ có nghe thấy không?'),
        button({ icon: '👂', label: 'Nghe rõ', kind: rec[key] === 'yes' ? 'good' : 'plain', onTap: () => ((rec[key] = 'yes'), render()) }),
        button({ icon: '🔇', label: 'Không nghe thấy', kind: rec[key] === 'no' ? 'retry' : 'plain', onTap: () => ((rec[key] = 'no'), render()) }),
      );
    let played = false;
    let spoke = false;
    const playTest = () => {
      cancelSpeech();
      void app.audio
        .unlock()
        .catch(() => false)
        .then(() => app.audio.playSequence(['C4', 'E4', 'G4', 'C5'], { duration: 0.55, gap: 0.05 }))
        .catch(() => undefined)
        .then(() => {
          played = true;
          render();
        });
    };
    const speakTest = () => {
      try {
        const sy = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
        const vi = sy?.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('vi')) ?? [];
        if (!sy || !vi.length) {
          toast('iPad chưa có giọng tiếng Việt — Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt', 3600);
          rec.voice = 'no';
        } else {
          app.audio.stopAll();
          if (sy.speaking || sy.pending) sy.cancel();
          const u = new SpeechSynthesisUtterance('Chào con! Mình cùng học đàn nhé.');
          u.lang = 'vi-VN';
          u.voice = vi.find((v) => /linh/i.test(v.name)) ?? vi[0];
          u.rate = 0.95;
          sy.speak(u);
        }
      } catch {
        toast('Chưa đọc được — thử lại nhé.');
      }
      spoke = true;
      render();
    };

    // ---------- 3) Đo micro (dùng lại "Đo micro & tạo báo cáo")
    const s = { checking: -1, stepTimer: undefined as number | undefined, calibrating: false, measuring: false, disposed: false, lastFrame: null };
    const startMic = async (): Promise<boolean> => {
      app.mic.tuningCents = store.settings.micTuningCents;
      app.mic.sensitivity = store.settings.micSensitivity;
      app.mic.latencyMs = store.settings.micLatencyMs;
      if (app.mic.state !== 'on') await app.mic.start();
      return app.mic.state === 'on';
    };
    const ctx = {
      app,
      store,
      s,
      kb: null,
      calib: h('p', {}),
      report: h('div', {}),
      showKb: () => undefined,
      startMic,
      renderSteps: () => undefined,
      renderSens: () => render(),
      stopAuto: () => auto.stop(),
      logState: () => ({ steps: [], freeLog: [], lastFrame: null, autoTune: null }),
    } as unknown as MicTestCtx;
    const auto = createAutoReport(ctx, {
      onReport: (r) => {
        micReport = r;
        const an = r.analysis;
        rec.mic = { hits: an.hits, total: an.total, softHits: an.softHits, softTotal: an.softTotal, sensitivity: store.settings.micSensitivity };
        render();
      },
    });
    app.mic.autoSensitivity = false;
    const unState = app.mic.onState((st) => auto.onState(st));
    const unFrame = app.mic.onFrame((f) => auto.onFrame(f));
    const unNote = app.mic.onNote((n) => {
      if (s.measuring) return;
      const c = app.audio.context?.currentTime;
      auto.onNote(n, n.at !== undefined && c !== undefined ? Math.round((c - n.at) * 1000) : null);
    });
    const sensRow = () =>
      h(
        'div',
        { class: 'row health-sens' },
        h('span', {}, 'Độ nhạy micro:'),
        ...SENS_LABEL.map((o) =>
          button({
            label: o.label,
            kind: o.value === store.settings.micSensitivity ? 'primary' : 'plain',
            onTap: () => {
              store.updateSettings({ micSensitivity: o.value });
              app.mic.sensitivity = o.value;
              if (rec.mic) rec.mic.sensitivity = o.value;
              toast(`🎚️ Độ nhạy: ${SENS_NAME[o.value]}`, 2000);
              render();
            },
          }),
        ),
      );

    // ---------- 4) Độ trễ
    let latencyMsg = '';
    const measureLatency = async () => {
      if (s.measuring) return;
      auto.stop();
      if (!(await startMic())) {
        latencyMsg = '⚠️ Chưa bật được micro — cho phép micro rồi thử lại.';
        return render();
      }
      const ac = app.audio.context;
      if (!ac) return;
      s.measuring = true;
      latencyMsg = '⏱️ Đang đo… giữ yên lặng, app phát 6 tiếng "tinh".';
      render();
      const onsets: number[] = [];
      const unOnset = app.mic.onOnset((at) => onsets.push(at));
      const t0 = ac.currentTime + 0.6;
      const times = Array.from({ length: LATENCY_PINGS }, (_, i) => t0 + i * LATENCY_GAP);
      times.forEach((t) => app.audio.ping(t));
      await new Promise((r) => window.setTimeout(r, (times[times.length - 1] - ac.currentTime + LATENCY_MAX + 0.2) * 1000));
      unOnset();
      s.measuring = false;
      if (disposed) return;
      const est = estimateLatency(times, onsets);
      if (!est) latencyMsg = 'Chưa đo được: micro không nghe rõ tiếng "tinh". Tăng âm lượng iPad, tháo tai nghe, giữ yên lặng rồi đo lại.';
      else {
        store.updateSettings({ micLatencyMs: est.ms });
        app.mic.latencyMs = est.ms;
        rec.latencyMs = est.ms;
        latencyMsg =
          est.ms > Math.min(BLUETOOTH_LIKELY_MS, HEALTH_LATENCY_BT_MS)
            ? `⚠️ Độ trễ ${est.ms} ms — cao. Đang dùng loa / tai nghe Bluetooth? Hãy dùng loa của iPad khi tập.`
            : `✅ Độ trễ ${est.ms} ms — tốt (đã lưu để chấm nhịp).`;
      }
      render();
    };

    // ---------- 6) Gửi kết quả
    let sendMsg = '';
    const finish = () => {
      rec.at = Date.now();
      saveHealth(rec);
      try {
        const ops = mergeOps(readOps(store.settings as { ops?: unknown }), { healthAt: rec.at });
        store.updateSettings({ ops } as never);
      } catch {
        /* bỏ qua */
      }
    };
    const send = async () => {
      finish();
      const errs = (() => {
        try {
          return readErrors()
            .slice(-5)
            .reverse()
            .map((e) => `${fmtTime(e.t)} · ${e.kind}${e.screen ? ` · ${e.screen}` : ''} · ${e.v}: ${e.msg}`);
        } catch {
          return [];
        }
      })();
      const trend = compareMic(rec.mic, prev?.mic);
      const text = healthReportText(rec, {
        device: (() => {
          try {
            return deviceText(parseDevice(navigator.userAgent, navigator.maxTouchPoints || 0));
          } catch {
            return '?';
          }
        })(),
        standalone: isStandalone(),
        errors: errs,
        micText: micReport?.text ?? loadMicReport()?.text ?? null,
        prevAt: prev?.at ?? null,
        trend: trend ? MIC_TREND_TEXT[trend] : null,
      });
      const nav = navigator as Navigator & { share?: (d: { text?: string; title?: string }) => Promise<void> };
      if (typeof nav.share === 'function') {
        try {
          await nav.share({ title: 'Piano bé — kiểm tra sức khỏe app', text });
          sendMsg = '✅ Đã mở bảng Chia sẻ — chọn Zalo / Tin nhắn để gửi người hỗ trợ.';
          return render();
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') {
            sendMsg = 'Đã đóng bảng Chia sẻ — chưa gửi.';
            return render();
          }
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        sendMsg = '✅ Đã sao chép kết quả — dán vào tin nhắn gửi người hỗ trợ.';
      } catch {
        sendMsg = 'Không chia sẻ / sao chép được trên iPad này.';
      }
      render();
    };

    const render = () => {
      if (disposed) return;
      const trend = compareMic(rec.mic, prev?.mic);
      const ck = new Set(rec.checklist);
      steps.replaceChildren(
        card(
          1,
          !!rec.backup,
          '💾 Sao lưu',
          h('p', { class: 'muted' }, 'Bảng Chia sẻ mở ra → “Lưu vào Tệp”. Chỉ đánh dấu xong khi sao lưu thành công.'),
          button({ icon: '💾', label: rec.backup ? 'Sao lưu lại' : 'Sao lưu ngay', kind: rec.backup ? 'plain' : 'primary', onTap: doBackup }),
          backupMsg ? h('p', { class: 'lead' }, backupMsg) : null,
        ),
        card(
          2,
          !!rec.sound && !!rec.voice,
          '🔊 Thử tiếng đàn & giọng đọc',
          h('div', { class: 'row' }, button({ icon: '🔊', label: 'Phát thử tiếng', kind: 'primary', onTap: playTest }), button({ icon: '🗣️', label: 'Nghe thử giọng', kind: 'primary', onTap: speakTest })),
          played ? h('div', {}, h('p', { class: 'muted' }, 'Tiếng đàn:'), ask('sound')) : null,
          spoke ? h('div', {}, h('p', { class: 'muted' }, 'Giọng đọc:'), ask('voice')) : null,
          rec.sound === 'no' ? h('p', { class: 'diag-tip' }, '💡 Bật âm lượng, tắt chế độ Im lặng (gạt / Trung tâm điều khiển), tháo tai nghe; vẫn không được thì đóng hẳn app rồi mở lại.') : null,
          rec.voice === 'no' ? h('p', { class: 'diag-tip' }, '💡 Cài giọng: Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt (chọn “Linh”).') : null,
        ),
        card(
          3,
          !!rec.mic,
          '🎙️ Đo micro (≈ 1 phút)',
          MicListener.supported ? auto.card : h('p', { class: 'muted' }, 'Thiết bị này không dùng được micro — bỏ qua bước này.'),
          rec.mic
            ? h(
                'p',
                { class: 'lead health-trend' },
                trend ? MIC_TREND_TEXT[trend] : prev?.mic ? '' : '📌 Lần đầu đo — app lưu làm mốc để tháng sau so sánh.',
              )
            : null,
          rec.mic || prev?.mic ? sensRow() : null,
        ),
        card(
          4,
          rec.latencyMs != null,
          '⏱️ Đo độ trễ loa → micro',
          h('p', { class: 'muted' }, 'Giữ yên lặng, mở loa iPad vừa đủ nghe. App phát 6 tiếng “tinh” và nghe lại.'),
          button({ icon: '⏱️', label: 'Đo độ trễ', kind: 'primary', onTap: () => void measureLatency() }),
          latencyMsg ? h('p', { class: 'lead' }, latencyMsg) : null,
        ),
        card(
          5,
          ck.size === HEALTH_CHECKLIST.length,
          '✅ Bảng kiểm nhanh',
          h(
            'ul',
            { class: 'health-check' },
            ...HEALTH_CHECKLIST.map((x) =>
              h(
                'li',
                {},
                h(
                  'button',
                  {
                    type: 'button',
                    class: `check${ck.has(x.id) ? ' on' : ''}`,
                    'aria-pressed': String(ck.has(x.id)),
                    onClick: () => {
                      const set = new Set(rec.checklist);
                      if (set.has(x.id)) set.delete(x.id);
                      else set.add(x.id);
                      rec.checklist = [...set];
                      render();
                    },
                  },
                  ck.has(x.id) ? '☑ ' : '☐ ',
                  x.text,
                ),
              ),
            ),
          ),
        ),
        card(
          6,
          !!sendMsg && sendMsg.startsWith('✅'),
          '📤 Gửi kết quả cho người hỗ trợ',
          h('p', { class: 'muted' }, 'MỘT lần chia sẻ: kết quả 5 bước trên + thông tin máy + lỗi gần đây + báo cáo micro. Không có tên bé.'),
          h(
            'div',
            { class: 'row' },
            button({ icon: '📤', label: 'Gửi kết quả', kind: 'primary', onTap: () => void send() }),
            button({
              icon: '✓',
              label: 'Xong (không gửi)',
              onTap: () => {
                finish();
                toast('🩺 Đã lưu kết quả kiểm tra — tháng sau app nhắc lại', 2600);
                back();
              },
            }),
          ),
          sendMsg ? h('p', { class: 'lead' }, sendMsg) : null,
        ),
      );
    };

    root.append(
      h(
        'div',
        { class: 'screen health-screen' },
        h(
          'div',
          { class: 'parent scrollable health' },
          h('header', { class: 'parent-head' }, h('h1', {}, '🩺 Kiểm tra sức khỏe app')),
          h('p', { class: 'muted' }, `Khoảng 3 phút, mỗi tháng một lần. ${prev ? `Lần trước: ${fmtTime(prev.at)}.` : 'Lần đầu kiểm tra.'} Bé ngồi ở đàn cho bước 3.`),
          steps,
        ),
        actionBar(backButton(back)),
      ),
    );
    render();
    auto.render();

    return () => {
      disposed = true;
      s.disposed = true;
      auto.stop();
      auto.dispose();
      unState();
      unFrame();
      unNote();
      app.mic.autoSensitivity = true;
      app.mic.stop();
    };
  };
}

