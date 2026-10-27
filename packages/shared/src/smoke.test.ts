import { describe, expect, it } from 'vitest';
import { SITE_CATALOG } from './catalog';

describe('shared smoke', () => {
  it('loads the catalogue', () => {
    expect(SITE_CATALOG.length).toBe(16);
  });
});
