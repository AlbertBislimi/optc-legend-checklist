import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceUrl = 'https://optc-ww.channel.or.jp/wp-json/wp/v2/posts?categories=8&per_page=100&_fields=id,date,link,title,excerpt,content,categories';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, '../data/official-campaign-feed.json');

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 30000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

class FatalFeedError extends Error {}

async function fetchFeed() {
  let lastProblem = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OPTC-Legend-Locker-event-feed/1.0'
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.ok) return response;
      if (response.status < 500) {
        throw new FatalFeedError(`Official OPTC feed returned ${response.status}.`);
      }
      lastProblem = `HTTP ${response.status}`;
    } catch (error) {
      if (error instanceof FatalFeedError) throw error;
      lastProblem = error.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS}ms` : `network error: ${error.message}`;
    }
    console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} failed (${lastProblem}).`);
    if (attempt < MAX_ATTEMPTS) await sleep(2000 * 2 ** (attempt - 1));
  }
  return { unavailable: lastProblem };
}

const response = await fetchFeed();
if (response.unavailable) {
  console.warn(`::warning::Official OPTC feed unavailable (${response.unavailable}); keeping existing ${outputPath} unchanged.`);
  process.exit(0);
}

const posts = await response.json();
if (!Array.isArray(posts)) {
  throw new Error('Official OPTC feed did not return a post list.');
}

const payload = {
  sourceUrl,
  posts: posts.map((post) => ({
    id: post.id,
    date: post.date,
    link: post.link,
    title: post.title?.rendered || '',
    excerpt: post.excerpt?.rendered || '',
    content: post.content?.rendered || '',
    categories: post.categories || []
  }))
};
const next = `${JSON.stringify(payload, null, 2)}\n`;

let previous = '';
try {
  previous = await readFile(outputPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (next === previous) {
  console.log('Official campaign feed is already current.');
  process.exit(0);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, next, 'utf8');
console.log(`Updated ${outputPath} with ${posts.length} official campaign posts.`);
