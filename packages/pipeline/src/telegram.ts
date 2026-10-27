export interface TelegramButton {
  text: string;
  callback_data: string;
}

export function telegramListingMessage(input: {
  title: string;
  price: number;
  currency: string;
  site: string;
  city?: string | null;
  deal: string;
  url: string;
  listingId: string;
}) {
  const text = [input.title, `${input.price} ${input.currency}`, input.site, input.city || '', input.deal, input.url]
    .filter(Boolean)
    .join('\n');
  const reply_markup = {
    inline_keyboard: [
      [
        { text: 'Interesting', callback_data: `mark:${input.listingId}:interesting` },
        { text: 'Reject', callback_data: `mark:${input.listingId}:rejected` },
      ],
    ],
  };
  return { text, reply_markup };
}

export function parseTelegramCallback(data: string): { listingId: string; status: 'interesting' | 'rejected' } | null {
  const match = data.match(/^mark:([0-9a-f-]{36}):(interesting|rejected)$/i);
  if (!match) return null;
  return { listingId: match[1]!, status: match[2] as 'interesting' | 'rejected' };
}

export function parseStartCode(text: string): string | null {
  const match = text.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9-]{4,40})$/);
  return match?.[1] ?? null;
}
