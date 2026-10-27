import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SITE_CATALOG } from '@pricelens/shared';
import { snapshotHtml } from './fixtures';

const dir = path.join(__dirname, '..', 'snapshots');
mkdirSync(dir, { recursive: true });
for (const site of SITE_CATALOG) {
  writeFileSync(path.join(dir, `${site.key}.html`), snapshotHtml(site.domain, site.key), 'utf8');
}
console.log(`wrote ${SITE_CATALOG.length} snapshots`);
