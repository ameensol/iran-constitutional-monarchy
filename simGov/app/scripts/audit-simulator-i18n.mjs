import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const directories = ['dashboard', 'institutions', 'bill-lifecycle', 'people', 'processes', 'elections', 'disasters', 'tour', 'shared'];
const failures = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.tsx')) inspect(path);
  }
}

function inspect(path) {
  readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, index) => {
    const directText = line.match(/>\s*([A-Za-z][^<{>]*)\s*</);
    const directAttribute = line.match(/(?:aria-label|placeholder|title)="([A-Za-z][^"]*)"/);
    if (directText && !line.includes('<code') && !line.includes('=>')) failures.push(`${relative(root, path)}:${index + 1}: ${directText[1].trim()}`);
    if (directAttribute) failures.push(`${relative(root, path)}:${index + 1}: ${directAttribute[1]}`);
  });
}

for (const directory of directories) walk(join(root, directory));

if (failures.length) {
  console.error('Hardcoded visitor-facing English found in the simulator:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('Simulator visitor-facing JSX passed the localization audit.');
