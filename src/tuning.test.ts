import { describe, expect, it } from 'vitest';
import {
  TUNING,
  bakeTuningDefaults,
  diskTuningOverrides,
  getTuningValue,
  mergeTuningForSave,
  noteDiskTuningSaved,
  setTuningValue,
} from './tuning';

describe('tuning invariants', () => {
  it('sprint is faster than base swim', () => {
    expect(TUNING.player.sprintSpeed).toBeGreaterThan(TUNING.player.swimSpeed);
  });

  it('zombie speed cap stays below player sprint (always escapable, for air)', () => {
    expect(TUNING.zombies.speedCap).toBeLessThan(TUNING.player.sprintSpeed);
  });

  it('air refills much faster than it drains', () => {
    expect(TUNING.air.refillPerSec).toBeGreaterThan(TUNING.air.drainPerSec * 10);
  });
});

// User bug 2026-08-02: "I changed zombie health to 100 and saved to disk, it
// reverted." Two SAVEs in one tab: the first wrote the file, then bake made
// those rows read as stock, and the second rebuilt the map from the STALE
// page-load import — silently dropping save #1 while reporting "saved ✓".
describe('tuning save-to-disk (panel SAVE map)', () => {
  it('a second save keeps what the first save wrote', () => {
    const hp0 = getTuningValue('zombies.baseHp');
    const spd0 = getTuningValue('zombies.baseSpeed');
    const disk0 = diskTuningOverrides();
    try {
      setTuningValue('zombies.baseHp', 100);
      const first = mergeTuningForSave();
      expect(first['zombies.baseHp']).toBe(100);

      // …the dev server writes it; the panel reports the new file contents
      noteDiskTuningSaved(first);
      bakeTuningDefaults(); // saved values become stock — rows read clean

      setTuningValue('zombies.baseSpeed', 2.5);
      const second = mergeTuningForSave();
      expect(second['zombies.baseSpeed']).toBe(2.5);
      expect(second['zombies.baseHp']).toBe(100); // was dropped before the fix
    } finally {
      setTuningValue('zombies.baseHp', hp0);
      setTuningValue('zombies.baseSpeed', spd0);
      noteDiskTuningSaved(disk0);
      bakeTuningDefaults();
    }
  });

  it('the disk layer is a copy — callers cannot mutate it by accident', () => {
    const disk0 = diskTuningOverrides();
    try {
      noteDiskTuningSaved({ 'zombies.baseHp': 100 });
      const map = diskTuningOverrides();
      map['zombies.baseHp'] = 999;
      expect(diskTuningOverrides()['zombies.baseHp']).toBe(100);
    } finally {
      noteDiskTuningSaved(disk0);
    }
  });
});
