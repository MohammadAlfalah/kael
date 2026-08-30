'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('artifact build produces a self-contained skeleton-free page', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-artifact.js')]);
  const out = fs.readFileSync(path.join(root, 'dist', 'artifact.html'), 'utf8');
  assert.ok(!/<!DOCTYPE/i.test(out), 'no doctype (artifact supplies the skeleton)');
  assert.ok(!/<html|<\/html>|<body[ >]|<head[ >]/i.test(out), 'no document skeleton tags');
  assert.match(out, /<title>Legendary Occupation System<\/title>/);
  assert.match(out, /LOS_CONTENT/, 'content pack inlined');
  assert.match(out, /LOS_MIND/, 'mind inlined');
  assert.ok(!/src="\.\.\//.test(out), 'no relative script refs remain');
  assert.ok(out.length < 4 * 1024 * 1024, 'well under artifact size limits');
});

test('the dev page and the engine agree on globals', () => {
  const page = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  assert.match(page, /src="\.\.\/src\/content\.js"/);
  assert.match(page, /src="\.\.\/src\/engine\.js"/);
  assert.match(page, /src="\.\.\/src\/mind\.js"/);
  assert.match(page, /window\.LOS\b/);
  assert.match(page, /window\.LOS_MIND\b/);
});
