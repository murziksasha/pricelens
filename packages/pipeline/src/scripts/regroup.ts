/** 1.5 one-off regroup after spec-extraction changes. Usage: pnpm --filter @pricelens/pipeline regroup [--apply] */
import { PrismaClient } from '@pricelens/db';
import { regroupListings } from '../regroup';

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const report = await regroupListings(prisma, { dryRun: !apply });
  console.log(JSON.stringify(report, null, 2));
  if (!apply) console.log('\nDry run only. Take a backup, then re-run with --apply.');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
