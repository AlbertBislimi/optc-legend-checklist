import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceUrl = 'https://optc-ww.channel.or.jp/wp-json/wp/v2/posts?categories=8&per_page=100&_fields=id,date,link,title,excerpt,content,categories';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, '../data/official-campaign-feed.json');

const response = await fetch(sourceUrl, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'OPTC-Legend-Locker-event-feed/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Official OPTC feed returned ${response.status}.`);
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
