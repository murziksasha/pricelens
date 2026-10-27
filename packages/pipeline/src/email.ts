import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailListingInput {
  title: string;
  price: number;
  currency: string;
  site: string;
  city?: string | null;
  deal: string;
  url: string;
  listingId: string;
}

export function emailListingMessage(input: EmailListingInput): { subject: string; text: string } {
  const subject = `[PriceLens] ${input.deal}: ${input.title} (${input.price} ${input.currency})`;
  const text = [input.title, `${input.price} ${input.currency}`, input.site, input.city || '', input.deal, input.url]
    .filter(Boolean)
    .join('\n');
  return { subject, text };
}

export function createEmailTransport(
  settings: Record<string, unknown>,
  override?: Transporter,
): Transporter {
  if (override) return override;
  const host = String(settings.smtp_host || '');
  const port = Number(settings.smtp_port) || 587;
  const user = settings.smtp_user ? String(settings.smtp_user) : undefined;
  const pass = settings.smtp_password ? String(settings.smtp_password) : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function dispatchEmailNotifications(
  prisma: any,
  options?: { transport?: Transporter; settings?: Record<string, unknown> },
): Promise<number> {
  const settings =
    options?.settings ??
    (await (async () => {
      const rows = await prisma.setting.findMany();
      const map: Record<string, unknown> = {};
      for (const r of rows) map[r.key] = r.value;
      return map;
    })());

  const enabled = Boolean(settings.email_enabled);
  const host = String(settings.smtp_host || '').trim();
  if (!enabled || !host) return 0;

  const from = String(settings.smtp_from || 'pricelens@localhost');
  const transport = createEmailTransport(settings, options?.transport);

  const notes = await prisma.notification.findMany({
    where: { type: 'template_hit' },
    take: 50,
  });

  let sentCount = 0;
  for (const note of notes) {
    const payload = (note.payload as Record<string, any>) || {};
    if (payload.emailSent) continue;
    if (!payload.listingId) continue;

    const user = await prisma.user.findUnique({ where: { id: note.userId } });
    if (!user || !user.email || !user.emailOptIn) {
      await prisma.notification
        .update({
          where: { id: note.id },
          data: { payload: { ...payload, emailSent: true, emailSkipped: true } },
        })
        .catch(() => undefined);
      continue;
    }

    const msg = emailListingMessage({
      title: payload.title,
      price: Number(payload.price),
      currency: payload.currency,
      site: payload.site,
      city: payload.city,
      deal: payload.deal,
      url: payload.url,
      listingId: payload.listingId,
    });

    try {
      await transport.sendMail({
        from,
        to: user.email,
        subject: msg.subject,
        text: msg.text,
      });
      sentCount++;
      await prisma.notification.update({
        where: { id: note.id },
        data: { payload: { ...payload, emailSent: true } },
      });
    } catch (err) {
      console.error('Email send failed:', err);
    }
  }

  return sentCount;
}
