#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const coreadRoot = path.resolve(
  process.env.HUI_COREAD_PUBLIC || '/home/ubuntu/hui-coread/public',
);
const errors = [];
const checked = new Set();

const requiredPages = [
  'index.html',
  'chat.html',
  'diary.html',
  'memory.html',
  'dream.html',
  'volo-status.html',
  'world.html',
  'inside.html',
  'reading.html',
  'router.html',
  'connect.html',
];

function exists(file, label) {
  checked.add(label);
  if (!fs.existsSync(file)) errors.push(`missing: ${label}`);
}

function cleanReference(reference) {
  return reference.split('#', 1)[0].split('?', 1)[0];
}

function checkReference(fromFile, rawReference) {
  if (
    !rawReference ||
    rawReference.startsWith('#') ||
    /^(?:https?:|data:|mailto:|tel:|javascript:)/i.test(rawReference)
  ) {
    return;
  }

  let reference = cleanReference(rawReference);
  if (!reference) return;

  if (reference.startsWith('/hui-v40/')) {
    reference = reference.slice('/hui-v40/'.length);
  } else if (reference.startsWith('/')) {
    // API and other site-absolute routes are outside this static bundle.
    return;
  }

  const fromDirectory = path.dirname(path.relative(root, fromFile));
  let relative = path.normalize(path.join(fromDirectory, reference));
  if (relative === '.') return;
  if (relative.endsWith(path.sep)) relative = path.join(relative, 'index.html');

  if (relative === 'reading-app') relative = path.join(relative, 'index.html');

  if (relative.startsWith(`reading-app${path.sep}`)) {
    const coreadRelative = relative.slice(`reading-app${path.sep}`.length);
    exists(path.join(coreadRoot, coreadRelative), `reading-app/${coreadRelative}`);
    return;
  }

  if (relative.startsWith('..')) {
    errors.push(`outside bundle: ${path.relative(root, fromFile)} -> ${rawReference}`);
    return;
  }

  exists(path.join(root, relative), relative);
}

for (const requiredPage of requiredPages) {
  exists(path.join(root, requiredPage), requiredPage);
}

const htmlFiles = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
  .map((entry) => path.join(root, entry.name));

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const referencePattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(referencePattern)) {
    checkReference(htmlFile, match[1]);
  }
}

const serviceWorker = path.join(root, 'sw.js');
exists(serviceWorker, 'sw.js');
if (fs.existsSync(serviceWorker)) {
  const source = fs.readFileSync(serviceWorker, 'utf8');
  const shell = source.match(/const APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!shell) {
    errors.push('sw.js: APP_SHELL list not found');
  } else {
    for (const match of shell[1].matchAll(/["'](\.\/[^"']+)["']/g)) {
      checkReference(serviceWorker, match[1]);
    }
  }
}

const looseBackups = fs
  .readdirSync(root, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      /(?:\.orig|\.rej|\.bak(?:-|$)|\.before-)/.test(entry.name),
  )
  .map((entry) => entry.name);

if (looseBackups.length) {
  errors.push(`loose backup files: ${looseBackups.join(', ')}`);
}

if (errors.length) {
  console.error(`Static bundle check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Static bundle check passed: ${htmlFiles.length} HTML files, ${checked.size} local targets.`,
);
