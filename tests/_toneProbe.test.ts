import { it } from 'vitest';
import { spectralCentroid, partialDecayRate, rmsLevel, nodesPerNote } from '../src/audio/voiceAnalysis';
import { warmVoiceParams } from '../src/audio/pianoVoice';
const notes: Array<[string, number]> = [['C2', 65.41], ['C3', 130.81], ['C4', 261.63], ['C5', 523.25], ['C6', 1046.5], ['C7', 2093]];
it('probe', () => {
  const rows: string[] = [];
  for (const m of ['classic', 'warm'] as const) for (const [n, f] of notes) {
    const c0 = spectralCentroid(m, f, 1, 10, 0.01), c3 = spectralCentroid(m, f, 1, 10, 0.3), c1 = spectralCentroid(m, f, 1, 10, 1);
    const cp = spectralCentroid(m, f, 0.3, 10, 0.01), cf = spectralCentroid(m, f, 1.2, 10, 0.01);
    const d1 = partialDecayRate(m, f, 1, 0.05, 0.5), d3 = partialDecayRate(m, f, 3, 0.05, 0.5), d6 = partialDecayRate(m, f, 6, 0.05, 0.5);
    const rms = 20 * Math.log10(rmsLevel(m, f, 1, 0.8, 0, 0.5));
    rows.push(`${m} ${n} c0/f=${(c0/f).toFixed(2)} c.3/f=${(c3/f).toFixed(2)} c1/f=${(c1/f).toFixed(2)} drop=${(c1/c0).toFixed(2)} vel f/p=${(cf/cp).toFixed(2)} dec1=${d1.toFixed(1)} dec3=${d3.toFixed(1)} dec6=${d6.toFixed(1)} rms=${rms.toFixed(1)}dB nodes=${nodesPerNote(m, f, 1, 0.5, false)}`);
  }
  for (const [n, f] of notes) { const p = warmVoiceParams(f, 1, 0.5); rows.push(`${n} bright=${p.brightGain.toFixed(2)} tau=${p.brightTau.toFixed(3)} cents=${p.brightCents.toFixed(1)} damper=${p.damperGain.toFixed(4)} pan=${p.pan.toFixed(2)}`); }
  console.log(rows.join('\n'));
});
