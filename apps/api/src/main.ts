import { seed } from '@pricelens/db';
import { createApp } from './create-app';
import { PrismaService } from './prisma.service';

async function main() {
  const app = await createApp();
  const prisma = app.get(PrismaService);
  if ((await prisma.user.count()) === 0) await seed(prisma);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`api listening on ${port}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
