import { describe, expect, it } from 'vitest';
import { duplicateDecision } from './duplicate';

const base = {
  url: 'https://www.olx.ua/item/1',
  siteId: 'olx',
  externalId: '1',
  title: 'Dell Latitude 5490 i5-8350U 16GB 512GB',
  price: 12000,
  imageHash: 'img-a',
};

describe('duplicateDecision FR-VIS-003', () => {
  it('matches the same URL ignoring a trailing slash', () => {
    const decision = duplicateDecision(base, { ...base, url: 'https://www.olx.ua/item/1/' });
    expect(decision).toMatchObject({ duplicate: true, reason: 'same_url' });
  });

  it('matches the same external id on one site', () => {
    const decision = duplicateDecision(base, { ...base, url: 'https://www.olx.ua/d/other' });
    expect(decision.reason).toBe('same_external_id');
  });

  it('matches a repost with a very similar title and price', () => {
    const decision = duplicateDecision(
      { ...base, externalId: '1', url: 'https://www.olx.ua/item/1' },
      {
        ...base,
        externalId: '99',
        url: 'https://www.olx.ua/item/99',
        title: 'Dell Latitude 5490 i5-8350U 16GB 512GB SSD',
        price: 12100,
        imageHash: 'other',
      },
    );
    expect(decision.duplicate).toBe(true);
    expect(decision.reason).toBe('repost');
  });

  it('does not match a different price or a different model', () => {
    expect(
      duplicateDecision(base, {
        ...base,
        url: 'https://www.olx.ua/item/2',
        externalId: '2',
        price: 20000,
      }).duplicate,
    ).toBe(false);
    expect(
      duplicateDecision(base, {
        ...base,
        url: 'https://www.olx.ua/item/3',
        externalId: '3',
        title: 'Apple MacBook Pro 14 M3 16GB 512GB',
        imageHash: 'img-b',
      }).duplicate,
    ).toBe(false);
  });
});
