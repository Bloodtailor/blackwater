import { describe, expect, it } from 'vitest';
import { runChecks } from './validate';

describe('cave layout rules (DESIGN.md §5)', () => {
  const results = runChecks();
  for (const r of results) {
    it(r.name, () => {
      expect(r.pass, r.detail).toBe(true);
    });
  }
});
