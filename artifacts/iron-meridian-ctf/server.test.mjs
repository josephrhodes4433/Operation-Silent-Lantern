import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createIronServer } from './server.mjs';

test('named IRON URL serves its own pages and preserves old links without intercepting Lantern or API', async () => {
  const server = await createIronServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await readFile(new URL('./dist/public/index.html', import.meta.url), 'utf8');
    for (const suffix of ['', 'activity', 'results', 'leaderboard', 'instructor', 'index.html']) {
      for (const end of suffix && suffix !== 'index.html' ? ['', '/'] : ['']) {
        const response = await fetch(`${origin}/iron-meridian/${suffix}${end}?resume=example&flag=5`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-ctf-app'), 'iron-meridian');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(await response.text(), index);
        const legacy = await fetch(`${origin}/${suffix}${end}?resume=example&flag=5`, { redirect: 'manual' });
        assert.equal(legacy.status, 308);
        assert.equal(legacy.headers.get('location'), `/iron-meridian/${suffix}${end}?resume=example&flag=5`);
      }
    }
    const canonical = await fetch(`${origin}/iron-meridian?resume=example`, { redirect: 'manual' });
    assert.equal(canonical.status, 308);
    assert.equal(canonical.headers.get('location'), '/iron-meridian/?resume=example');
    for (const [, asset] of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!asset.startsWith('/')) continue;
      assert.ok(asset.startsWith('/iron-meridian/'));
      const response = await fetch(origin + asset);
      assert.equal(response.status, 200, asset);
      assert.ok((await response.arrayBuffer()).byteLength);
      assert.notEqual(response.headers.get('content-type'), 'text/html; charset=utf-8');
    }
    const health = await fetch(`${origin}/iron-meridian/__site_health`);
    assert.deepEqual(await health.json(), { app: 'iron-meridian', status: 'ok' });
    const head = await fetch(`${origin}/iron-meridian/activity`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const url of ['/silent-lantern/', '/silent-lantern/activity', '/api/ctf/window',
      '/api/lantern/window', '/iron-meridian/not-a-page', '/iron-meridian/assets/missing.js',
      '/iron-meridian/server.mjs']) {
      assert.equal((await fetch(origin + url)).status, 404, url);
    }
    assert.equal((await fetch(`${origin}/iron-meridian/%2e%2e%2fserver.mjs`)).status, 400);
    assert.equal((await fetch(`${origin}/iron-meridian/`, { method: 'POST' })).status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
