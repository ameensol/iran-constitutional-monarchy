import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outputDir = resolve(here, '../src/content/generated');

const sources = {
  en: resolve(repoRoot, 'constitution/Constitution.md'),
  fa: resolve(repoRoot, 'constitution/Constitution-fa.md'),
};

function parseConstitution(markdown, locale) {
  const lines = markdown.split(/\r?\n/);
  const partPattern = locale === 'fa' ? /^# بخش\s+(.+?)\s+—\s+(.+)$/ : /^# PART\s+(.+?)\s+—\s+(.+)$/;
  const articlePattern = locale === 'fa' ? /^## اصل\s+([IVX]+\.\d+)\s+—\s+(.+)$/ : /^## Article\s+([IVX]+\.\d+)\s+—\s+(.+)$/;
  const articles = [];
  let part = { id: '', title: '' };
  let current = null;

  const flush = () => {
    if (!current) return;
    current.body = current.lines.join('\n').trim();
    delete current.lines;
    articles.push(current);
  };

  for (const line of lines) {
    const partMatch = line.match(partPattern);
    if (partMatch) {
      part = { id: partMatch[1].trim(), title: partMatch[2].trim() };
      continue;
    }
    const articleMatch = line.match(articlePattern);
    if (articleMatch) {
      flush();
      current = { id: articleMatch[1], title: articleMatch[2].trim(), partId: part.id, partTitle: part.title, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return articles;
}

const english = parseConstitution(await readFile(sources.en, 'utf8'), 'en');
const persian = parseConstitution(await readFile(sources.fa, 'utf8'), 'fa');
const faById = new Map(persian.map((article) => [article.id, article]));
const enIds = new Set(english.map((article) => article.id));
const missingFa = english.filter((article) => !faById.has(article.id)).map((article) => article.id);
const missingEn = persian.filter((article) => !enIds.has(article.id)).map((article) => article.id);

if (english.length !== 66 || persian.length !== 66 || missingFa.length || missingEn.length) {
  throw new Error(`Constitution pairing failed. en=${english.length}, fa=${persian.length}, missingFa=${missingFa.join(',')}, missingEn=${missingEn.join(',')}`);
}

const paired = english.map((article) => ({ id: article.id, en: article, fa: faById.get(article.id) }));
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'constitution.json'), `${JSON.stringify(paired, null, 2)}\n`);
console.log(`Validated and generated ${paired.length} paired constitutional articles.`);
