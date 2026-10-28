import { describe, expect, it } from 'vitest';
import { expandSearchTemplate, templateFromResultsUrl } from './constructor';

describe('constructor query template FR-CON-001', () => {
  it('turns a percent-encoded OLX path into {query}', () => {
    const found = templateFromResultsUrl('https://www.olx.ua/uk/list/q-%D0%BD%D0%BE%D1%83%D1%82%D0%B1%D1%83%D0%BA/', 'ноутбук');
    expect(found.param).toBe('path');
    expect(found.template).toBe('https://www.olx.ua/uk/list/q-{query}/');
  });

  it('keeps a template that already has {query}', () => {
    const found = templateFromResultsUrl('https://www.olx.ua/uk/list/q-{query}/', 'test123');
    expect(found.param).toBe('path');
    expect(found.template).toBe('https://www.olx.ua/uk/list/q-{query}/');
  });

  it('does not pretend the default probe word was found', () => {
    const found = templateFromResultsUrl('https://www.olx.ua/uk/list/q-%D0%BD%D0%BE%D1%83%D1%82%D0%B1%D1%83%D0%BA/', 'test123');
    expect(found.param).toBeNull();
    expect(found.template).toContain('q-%D0%BD');
  });

  it('fills the placeholder before a preview fetch', () => {
    expect(expandSearchTemplate('https://www.olx.ua/uk/list/q-{query}/', 'ноутбук')).toBe(
      'https://www.olx.ua/uk/list/q-%D0%BD%D0%BE%D1%83%D1%82%D0%B1%D1%83%D0%BA/',
    );
  });
});
