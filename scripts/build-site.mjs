import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Only visitor-facing assets belong in the static output. The API and its
// imports are bundled separately by Vercel; docs, SQL, tests and secrets are not.
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && (
    entry.name.endsWith('.html') ||
    ['robots.txt', 'sitemap.xml', 'favicon.ico'].includes(entry.name)
  )) await cp(path.join(root, entry.name), path.join(output, entry.name));
}
for (const directory of ['assets', 'email']) {
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}
console.log('Built visitor-facing files in public/. API source is excluded.');
