'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const word = (...parts) => parts.join('');
const forbidden = [
  word('qi', 'yu'),
  String.fromCodePoint(0x7941, 0x716c),
  word('desktop', '-', 'agent'),
  word('formal', '-', 'chat'),
  word('volc', 'engine'),
  word('C:', '\\', 'Users'),
  word('D:', '\\', 'desktop', '-', 'agent'),
  word('api', 'Key'),
  word('api', '_key'),
  word('se', 'cret'),
  word('Bea', 'rer'),
  word('conver', 'sation'),
  word('mem', 'ory'),
  word('invest', 'ment'),
  word('class', 'room')
].map((value) => new RegExp(value, 'i'));

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

test('public workspace contains none of the blocked private identifiers', () => {
  const matches = [];
  for (const file of filesUnder(root)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) if (pattern.test(content)) matches.push(`${path.relative(root, file)}: ${pattern}`);
  }
  assert.deepEqual(matches, []);
});
