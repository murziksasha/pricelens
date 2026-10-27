import { describe, expect, it } from 'vitest';
import { parseStartCode, parseTelegramCallback, telegramListingMessage } from './telegram';

describe('telegram payloads FR-NTF', () => {
  it('includes price, site, deal and mark buttons', () => {
    const message = telegramListingMessage({
      title: 'Dell Latitude',
      price: 12000,
      currency: 'UAH',
      site: 'OLX',
      city: 'Odesa',
      deal: 'deal',
      url: 'https://www.olx.ua/item/1',
      listingId: '11111111-1111-1111-1111-111111111111',
    });
    expect(message.text).toContain('12000 UAH');
    expect(message.text).toContain('OLX');
    expect(message.text).toContain('Odesa');
    expect(message.reply_markup.inline_keyboard[0]?.[0]?.callback_data).toContain('interesting');
  });

  it('parses callbacks and link codes', () => {
    expect(parseTelegramCallback('mark:11111111-1111-1111-1111-111111111111:rejected')?.status).toBe('rejected');
    expect(parseStartCode('/start AB12CD')).toBe('AB12CD');
    expect(parseTelegramCallback('nope')).toBeNull();
  });
});
