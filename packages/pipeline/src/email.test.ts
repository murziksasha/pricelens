import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { dispatchEmailNotifications, emailListingMessage } from './email';

describe('email notifications FR-NTF-001', () => {
  it('builds message with same listing fields as telegram', () => {
    const msg = emailListingMessage({
      title: 'Lenovo ThinkPad T480',
      price: 9500,
      currency: 'UAH',
      site: 'OLX',
      city: 'Kyiv',
      deal: 'deal',
      url: 'https://www.olx.ua/d/obyavlenie/t480-12345.html',
      listingId: '00000000-0000-0000-0000-000000000001',
    });

    expect(msg.subject).toContain('Lenovo ThinkPad T480');
    expect(msg.subject).toContain('9500 UAH');
    expect(msg.text).toContain('Lenovo ThinkPad T480');
    expect(msg.text).toContain('9500 UAH');
    expect(msg.text).toContain('OLX');
    expect(msg.text).toContain('Kyiv');
    expect(msg.text).toContain('deal');
    expect(msg.text).toContain('https://www.olx.ua/d/obyavlenie/t480-12345.html');
  });

  it('produces one outbound message when opted in, and none when not opted in', async () => {
    const sentMessages: any[] = [];
    const transport = nodemailer.createTransport({
      jsonTransport: true,
    });
    // Hook sendMail to record message
    const originalSendMail = transport.sendMail.bind(transport);
    transport.sendMail = (async (mail: any) => {
      sentMessages.push(mail);
      return originalSendMail(mail);
    }) as any;

    const mockUsers: Record<string, any> = {
      user1: { id: 'user1', email: 'optin@example.com', emailOptIn: true },
      user2: { id: 'user2', email: 'optout@example.com', emailOptIn: false },
    };

    const notifications = [
      {
        id: 'n1',
        userId: 'user1',
        type: 'template_hit',
        payload: {
          title: 'Dell XPS 13',
          price: 15000,
          currency: 'UAH',
          site: 'Hotline',
          city: null,
          deal: 'deal',
          url: 'https://hotline.ua/item/xps',
          listingId: '11111111-1111-1111-1111-111111111111',
        },
      },
      {
        id: 'n2',
        userId: 'user2',
        type: 'template_hit',
        payload: {
          title: 'MacBook Air M1',
          price: 25000,
          currency: 'UAH',
          site: 'Rozetka',
          city: 'Lviv',
          deal: 'good',
          url: 'https://rozetka.com.ua/item/mac',
          listingId: '22222222-2222-2222-2222-222222222222',
        },
      },
    ];

    const mockPrisma = {
      setting: {
        findMany: async () => [
          { key: 'email_enabled', value: true },
          { key: 'smtp_host', value: 'smtp.example.com' },
          { key: 'smtp_from', value: 'alerts@pricelens.lan' },
        ],
      },
      notification: {
        findMany: async () => notifications,
        update: async ({ where, data }: any) => {
          const n = notifications.find((item) => item.id === where.id);
          if (n) n.payload = { ...n.payload, ...data.payload };
          return n;
        },
      },
      user: {
        findUnique: async ({ where }: any) => mockUsers[where.id] || null,
      },
    };

    const count = await dispatchEmailNotifications(mockPrisma as any, {
      transport,
      settings: {
        email_enabled: true,
        smtp_host: 'smtp.example.com',
        smtp_from: 'alerts@pricelens.lan',
      },
    });

    expect(count).toBe(1);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].to).toBe('optin@example.com');
    expect(sentMessages[0].subject).toContain('Dell XPS 13');

    // Running again should produce zero new messages (already sent)
    const secondCount = await dispatchEmailNotifications(mockPrisma as any, {
      transport,
      settings: {
        email_enabled: true,
        smtp_host: 'smtp.example.com',
        smtp_from: 'alerts@pricelens.lan',
      },
    });
    expect(secondCount).toBe(0);
    expect(sentMessages.length).toBe(1);
  });
});

