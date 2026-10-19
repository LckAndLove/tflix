import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const ui = new URL('ui/', root);
const androidWeb = new URL('app/android/app/src/main/assets/web/', root);

// Read token from environment variable, falling back to the project default read token
const DEFAULT_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwYTk1NzRmZDcxMjRkNmI5ZTUyNjA4ZWEzNWQ2NzdiNCIsIm5iZiI6MTczNzU5MDQ2NC4zMjUsInN1YiI6IjY3OTE4NmMwZThiNjdmZjgzM2ZhNjM4OCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.kWqK74FSN41PZO7_ENZelydTtX0u2g6dCkAW0vFs4jU';
const token = (process.env.TMDB_TOKEN || '').trim() || DEFAULT_TOKEN;

if (!token || token === '__TMDB_TOKEN__') {
  console.error('Error: TMDB_TOKEN is missing or invalid! App requires a valid TMDB token to load movies.');
  process.exit(1);
}

const targets = [
  { name: 'desktop', base: ui },
  { name: 'android', base: androidWeb }
];

for (const { base } of targets) {
  await mkdir(new URL('stream/', base), { recursive: true });
}

async function processHtml(srcRelative, destRelative) {
  const content = await readFile(new URL(srcRelative, root), 'utf8');
  if (!content.includes('__TMDB_TOKEN__')) {
    console.warn(`Warning: __TMDB_TOKEN__ placeholder not found in ${srcRelative}`);
  }
  const injected = content.replaceAll('__TMDB_TOKEN__', token);
  if (injected.includes('__TMDB_TOKEN__')) {
    throw new Error(`Critical: Failed to replace __TMDB_TOKEN__ in ${destRelative}`);
  }
  for (const { name, base } of targets) {
    await writeFile(new URL(destRelative, base), injected, 'utf8');
    console.log(`[prepare-ui] (${name}) Successfully injected TMDB credentials into ${destRelative}`);
  }
}

await processHtml('index.html', 'index.html');
await processHtml('stream/index.html', 'stream/index.html');

for (const { name, base } of targets) {
  await cp(fileURLToPath(new URL('assets/', root)), fileURLToPath(new URL('assets/', base)), { recursive: true });
  console.log(`[prepare-ui] (${name}) Successfully copied assets.`);
}

console.log('[prepare-ui] Desktop and Android web assets preparation completed successfully.');
