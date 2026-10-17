import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createLanternServer } from './server.mjs';

test('production serves only SILENT LANTERN pages, assets and health under its full mount path', async () => {
  const server = await createLanternServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await readFile(new URL('./dist/public/index.html', import.meta.url), 'utf8');
    for (const suffix of ['', 'activity', 'results', 'leaderboard', 'instructor', 'index.html']) {
      for (const ending of suffix && suffix !== 'index.html' ? ['', '/'] : ['']) {
        const response = await fetch(`${origin}/silent-lantern/${suffix}${ending}?resume=test`);
        assert.equal(response.status, 200, suffix + ending);
        assert.equal(response.headers.get('x-ctf-app'), 'silent-lantern');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(await response.text(), index);
      }
    }
    const redirect = await fetch(`${origin}/silent-lantern?resume=test`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/silent-lantern/?resume=test');
    for (const [, asset] of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!asset.startsWith('/')) continue;
      const response = await fetch(origin + asset);
      assert.equal(response.status, 200, asset);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
      assert.notEqual(response.headers.get('content-type'), 'text/html; charset=utf-8');
    }
    const health = await fetch(`${origin}/silent-lantern/__site_health`);
    assert.deepEqual(await health.json(), { app: 'silent-lantern', status: 'ok' });
    const head = await fetch(`${origin}/silent-lantern/instructor`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const pathname of ['/', '/activity', '/api/ctf/activity', '/api/lantern/activity',
      '/silent-lantern-other/', '/silent-lantern/assets/missing.js',
      '/silent-lantern/not-a-page', '/silent-lantern/server.mjs']) {
      const response = await fetch(origin + pathname);
      assert.equal(response.status, 404, pathname);
      assert.ok(!(await response.text()).includes('<html'));
    }
    const post = await fetch(`${origin}/silent-lantern/`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
    // Encoded traversal must not expose files or serve a different page.
    const traversal = await fetch(`${origin}/silent-lantern/%2e%2e%2fserver.mjs`);
    assert.equal(traversal.status, 400);
    await assert.rejects(createLanternServer({ basePath: '/wrong-base/' }), /wrong BASE_PATH/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
