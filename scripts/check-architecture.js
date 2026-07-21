#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const errors = [];

function source(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function requireScriptOrder(htmlFile, scripts) {
  const html = source(htmlFile);
  let previous = -1;
  for (const script of scripts) {
    const current = html.indexOf(script);
    if (current === -1) {
      errors.push(`${htmlFile}: missing ${script}`);
      return;
    }
    if (current <= previous) {
      errors.push(`${htmlFile}: ${script} loads out of order`);
      return;
    }
    previous = current;
  }
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const html = source(entry.name);
  if (html.includes('ccc-api.js')) {
    requireScriptOrder(entry.name, ['core/ccc-runtime.js', 'ccc-api.js']);
  }
}

requireScriptOrder('chat.html', [
  'core/ccc-runtime.js',
  'ccc-api.js',
  'features/volo-media-status.js',
  'features/volo-music.js',
  'features/volo-chat.js',
  'features/volo-voice.js',
  'features/volo-usage.js',
  'volo.js',
]);

const voloSource = source('volo.js');
const voloLines = voloSource.split('\n').length;
if (voloLines > 600) errors.push(`volo.js grew beyond 600 lines (${voloLines})`);
for (const forbidden of [
  'function createMusicCard',
  'function parseLrcLines',
  'function startMusicPlayback',
  'function analyzeMusic',
  'function startVoiceRecording',
  'function uploadVoice',
  'function renderUsage',
  'function loadUsage',
  'function setUsageOpen',
  'function mergeMessages',
  'function createAssistantMessage',
  'function renderMessages',
  'function loadHistory',
  'function pollSelected',
  'function schedulePoll',
]) {
  if (voloSource.includes(forbidden)) errors.push(`volo.js reclaimed extracted concern: ${forbidden}`);
}

const runtimeStorage = new Map([
  [
    'island-chat.ccc-connection.v1',
    JSON.stringify({ baseUrl: 'https://mcp.canian.top', token: 'test-token' }),
  ],
]);
const context = {
  URL,
  CustomEvent: function CustomEvent(type, options) {
    this.type = type;
    this.detail = options && options.detail;
  },
  document: { cookie: '', dispatchEvent() {} },
  localStorage: {
    getItem(key) { return runtimeStorage.get(key) || null; },
    setItem(key, value) { runtimeStorage.set(key, String(value)); },
    removeItem(key) { runtimeStorage.delete(key); },
  },
};
context.window = {
  location: {
    origin: 'https://mcp.canian.top',
    pathname: '/hui-v40/chat.html',
  },
  addEventListener() {},
};
vm.createContext(context);
vm.runInContext(source('core/ccc-runtime.js'), context, {
  filename: 'core/ccc-runtime.js',
});

assert.equal(
  context.window.CCCRuntime.getConfig().baseUrl,
  'https://mcp.canian.top/hui-api',
  'legacy site origin must migrate to /hui-api',
);
assert.equal(
  JSON.parse(runtimeStorage.get('island-chat.ccc-connection.v1')).baseUrl,
  'https://mcp.canian.top/hui-api',
  'migrated API base must persist',
);

if (errors.length) {
  console.error(`Architecture check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Architecture check passed: API order is explicit; volo.js is ${voloLines} lines.`);
