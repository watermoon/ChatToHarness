'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'app', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const locales = fs.readFileSync(path.join(root, 'app', 'locales.js'), 'utf8');

test('cloud bootstrap failures use a localized modal instead of inline internal codes', () => {
  assert.match(html, /id="cloud-error-dialog"/);
  assert.match(html, /id="cloud-error-message" role="alert"/);
  assert.match(renderer, /CLOUD_WRANGLER_FAILED_LOGIN:'未能完成 Cloudflare 登录/);
  assert.match(renderer, /cloudErrorDialog\.showModal\(\)/);
  assert.match(renderer, /showCloudError\(result\.error,'云端初始化失败'\)/);
  assert.doesNotMatch(renderer, /remoteLabel\+\(cloud\.error/);
  assert.doesNotMatch(renderer, /result\.error\?'：'\+result\.error/);
  assert.doesNotMatch(renderer, /cloudResetProgress\.textContent=t\('重置未完成，可重试：'\)\+\(result\.error/);
  assert.match(locales, /Cloudflare sign-in did not complete/);
  assert.match(locales, /The cloud operation could not be completed/);
});
