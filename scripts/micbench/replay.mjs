// (+ 2026-11-09) Đọc tệp "micro nghe sai" bố mẹ gửi (⚙️ Cài đặt › 🙉 Gửi tệp) → in bối cảnh từng lần + cho đoạn tiếng
// chạy lại qua MicAnalyzer (độ nhạy lúc đó và độ nhạy Cao) + ghi từng đoạn ra .wav để nghe.
// Chạy: npx vite-node scripts/micbench/replay.mjs <tệp.json> [thư-mục-ra]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MicAnalyzer } from '../../src/audio/micAnalyzer.ts';

const [file, outDir = 'mic-claims-out'] = process.argv.slice(2);
if (!file) {
  console.log('Cách dùng: npx vite-node scripts/micbench/replay.mjs <tệp.json> [thư-mục-ra]');
  process.exit(1);
}
const doc = JSON.parse(readFileSync(file, 'utf8'));
mkdirSync(outDir, { recursive: true });
const name = (m) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12] + (Math.floor(m / 12) - 1);

function readWav(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sr = v.getUint32(24, true);
  const n = (buf.length - 44) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = v.getInt16(44 + i * 2, true) / 32768;
  return { sr, x };
}

for (const c of doc.claims) {
  const wav = Buffer.from(c.wavBase64, 'base64');
  writeFileSync(join(outDir, `${c.id}.wav`), wav);
  const { sr, x } = readWav(wav);
  const gain = c.info.wavGain || 1;
  for (let i = 0; i < x.length; i++) x[i] /= gain; // về mức micro thật
  const run = (sens) => {
    const a = new MicAnalyzer();
    a.sensitivity = sens;
    a.tuningCents = c.info.tuningCents ?? 0;
    const hop = Math.round(0.025 * sr);
    const notes = [];
    for (let i = 2048; i < x.length; i += hop) {
      const f = a.process(x.subarray(i - 2048, i), sr, i / sr);
      if (f.note) notes.push(`${name(f.note.midi)}@${(i / sr).toFixed(2)}s(${Math.round(f.note.cents)}c)`);
    }
    return notes.join(' ') || '—';
  };
  const s = c.info.summary ?? {};
  console.log(`\n=== ${c.id} ${c.at} · ${c.where}${c.songId ? ' · ' + c.songId : ''} · v${c.info.v}`);
  console.log(`  cần đàn: ${(c.info.expected ?? []).map(name).join('+')} · app đoán: ${s.kind} · tự sửa: ${JSON.stringify(c.info.action)}`);
  console.log(`  micro nghe lúc đó: ${(s.notes ?? []).map(name).join(' ') || '—'} · gõ ${s.onsets} · suýt ${s.nearMisses} · đỉnh/ngưỡng ${(+s.peakOverGate || 0).toFixed(2)} · độ nhạy ${c.info.sensitivity} · lệch dây ${c.info.tuningCents}c`);
  console.log(`  chạy lại (độ nhạy ${c.info.sensitivity}): ${run(c.info.sensitivity ?? 'normal')}`);
  console.log(`  chạy lại (độ nhạy cao):  ${run('high')}`);
}
console.log(`\nĐã ghi ${doc.claims.length} tệp .wav vào ${outDir}`);
