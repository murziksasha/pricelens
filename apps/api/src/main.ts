import { seed, syncBuiltinSites } from '@pricelens/db';
import { createApp } from './create-app';
import { startDiscoveryBeacon } from './discovery';
import { PrismaService } from './prisma.service';

async function main() {
  const app = await createApp();
  const prisma = app.get(PrismaService);
  if ((await prisma.user.count()) === 0) await seed(prisma);
  // Built-in sites still on an old search URL get the current one (hand-edited URLs are kept).
  for (const change of await syncBuiltinSites(prisma)) {
    console.log(`site ${change.key} updated: ${change.fields.join(', ')}`);
  }
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  startDiscoveryBeacon(port);
  console.log(`api listening on ${port}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
