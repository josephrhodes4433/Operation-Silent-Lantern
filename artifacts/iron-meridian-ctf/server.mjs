import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const pages = new Set(['', 'activity', 'results', 'leaderboard', 'instructor', 'index.html']);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4',
};

export async function createIronServer({
  publicDir = path.join(appDir, 'dist/public'), basePath = '/iron-meridian/',
} = {}) {
  if (!basePath.startsWith('/') || !basePath.endsWith('/')) throw new Error('Invalid BASE_PATH.');
  const root = await realpath(publicDir);
  const index = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!index.includes('<title>IRON MERIDIAN CTF</title>')) throw new Error('Wrong activity build.');
  for (const [, asset] of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (asset.startsWith('/') && !asset.startsWith(basePath)) throw new Error('Wrong build BASE_PATH.');
  }
  return createServer(async (req, res) => {
    const reply = (status, text) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return reply(405, 'Method not allowed');
    }
    const queryAt = (req.url ?? '/').indexOf('?');
    const rawPath = queryAt < 0 ? req.url ?? '/' : req.url.slice(0, queryAt);
    const query = queryAt < 0 ? '' : req.url.slice(queryAt);
    let pathname;
    try { pathname = decodeURIComponent(rawPath); } catch { return reply(400, 'Invalid path'); }
    if (pathname.includes('\\') || pathname.includes('\0') ||
        pathname.split('/').some(part => part === '..' || part === '.')) return reply(400, 'Invalid path');
    const redirect = target => {
      res.writeHead(308, { Location: target + query, 'Cache-Control': 'no-store' });
      res.end();
    };
    if (basePath !== '/') {
      if (pathname === basePath.slice(0, -1)) return redirect(basePath);
      // Preserve old learner resume links and instructor bookmarks, including queries.
      const oldPage = pathname.startsWith('/') && pages.has(pathname.slice(1).replace(/\/$/, ''));
      if (oldPage) return redirect(basePath + pathname.slice(1));
      if (pathname.startsWith('/assets/') || pathname === '/favicon.svg') {
        return redirect(basePath + pathname.slice(1));
      }
    }
    if (!pathname.startsWith(basePath)) return reply(404, 'Not found');
    const relative = pathname.slice(basePath.length);
    if (relative === '__site_health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ app: 'iron-meridian', status: 'ok' }));
    }
    const isPage = pages.has(relative.replace(/\/$/, ''));
    try {
      const file = await realpath(path.resolve(root, isPage ? 'index.html' : relative));
      if (!file.startsWith(root + path.sep)) return reply(404, 'Not found');
      const info = await stat(file);
      if (!info.isFile()) return reply(404, 'Not found');
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size, 'Cache-Control': isPage ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff', 'X-CTF-App': 'iron-meridian',
      });
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return reply(404, 'Not found');
      process.stderr.write('IRON MERIDIAN could not serve a file.\n');
      reply(500, 'Unable to load this page');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid PORT is required.');
  const server = await createIronServer({ basePath: process.env.BASE_PATH ?? '/iron-meridian/' });
  server.listen(port, '0.0.0.0', () => process.stdout.write(`IRON MERIDIAN listening on port ${port}\n`));
}
