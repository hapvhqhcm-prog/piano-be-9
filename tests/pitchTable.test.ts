import { describe, expect, it } from 'vitest';
import { KEYBOARD_PITCHES, noteLabel, pitchFreq, pitchInfo, pitchToMidi } from '../src/piano/pitchTable';

// Bảng tần số chuẩn A4 = 440 Hz (equal temperament).
const REFERENCE_HZ: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, 'C#4': 277.18, D4: 293.66, 'D#4': 311.13, E4: 329.63, F4: 349.23, G4: 392.0,
  A4: 440.0, B4: 493.88, C5: 523.25,
};

describe('pitchTable', () => {
  it('C4 là MIDI 60', () => {
    expect(pitchToMidi('C4')).toBe(60);
  });

  it.each(Object.entries(REFERENCE_HZ))('%s đúng tần số ±1 Hz', (pitch, hz) => {
    expect(Math.abs(pitchFreq(pitch) - hz)).toBeLessThan(1);
  });

  it('bàn phím C3–C5 có 25 phím: 15 trắng, 10 đen', () => {
    expect(KEYBOARD_PITCHES).toHaveLength(25);
    expect(KEYBOARD_PITCHES[0].pitch).toBe('C3');
    expect(KEYBOARD_PITCHES[24].pitch).toBe('C5');
    expect(KEYBOARD_PITCHES.filter((p) => !p.isBlack)).toHaveLength(15);
    expect(KEYBOARD_PITCHES.filter((p) => p.isBlack)).toHaveLength(10);
  });

  it('phím đen đúng vị trí trong mỗi quãng tám', () => {
    const blacks = KEYBOARD_PITCHES.filter((p) => p.isBlack).map((p) => p.pitch);
    expect(blacks).toEqual(['C#3', 'D#3', 'F#3', 'G#3', 'A#3', 'C#4', 'D#4', 'F#4', 'G#4', 'A#4']);
  });

  it('nhãn song song tiếng Việt / chữ cái', () => {
    expect(noteLabel('C4')).toBe('Đô / C');
    expect(noteLabel('G4')).toBe('Sol / G');
    expect(noteLabel('C#4')).toBe('Đô thăng / C♯');
    expect(pitchInfo('E4').isBlack).toBe(false);
  });
});
