import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const pages = new Set(['', 'activity', 'results', 'leaderboard', 'instructor', 'index.html']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
};

// Handle the full public path ourselves: the project proxy does not strip it.
// Keeping this a process service avoids the shared static SPA fallback.
export async function createLanternServer({
  publicDir = path.join(appDir, 'dist/public'),
  basePath = '/silent-lantern/',
} = {}) {
  if (!basePath.startsWith('/') || !basePath.endsWith('/')) {
    throw new Error('BASE_PATH must start and end with a slash.');
  }
  const root = await realpath(publicDir);
  const index = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!index.includes('<title>SILENT LANTERN CTF</title>')) {
    throw new Error('Refusing to serve a build that is not SILENT LANTERN.');
  }
  for (const [, asset] of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (asset.startsWith('/') && !asset.startsWith(basePath)) {
      throw new Error('SILENT LANTERN was built with the wrong BASE_PATH.');
    }
  }

  return createServer(async (req, res) => {
    const reply = (status, text) => {
      res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return reply(405, 'Method not allowed');
    }
    const [rawPath, ...queryParts] = (req.url ?? '/').split('?');
    let pathname;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      return reply(400, 'Invalid path');
    }
    if (pathname.includes('\\') || pathname.includes('\0') ||
        pathname.split('/').some(part => part === '..' || part === '.')) {
      return reply(400, 'Invalid path');
    }
    if (basePath !== '/' && pathname === basePath.slice(0, -1)) {
      const query = queryParts.length ? `?${queryParts.join('?')}` : '';
      res.writeHead(308, { Location: `${basePath}${query}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (!pathname.startsWith(basePath)) return reply(404, 'Not found');
    const relative = pathname.slice(basePath.length);
    if (relative === '__site_health') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ app: 'silent-lantern', status: 'ok' }));
    }
    const isPage = pages.has(relative.replace(/\/$/, ''));
    // Missing assets and unknown pages must never fall back to another activity.
    const filename = isPage ? 'index.html' : relative;
    try {
      const resolved = await realpath(path.resolve(root, filename));
      if (!resolved.startsWith(`${root}${path.sep}`)) return reply(404, 'Not found');
      const info = await stat(resolved);
      if (!info.isFile()) return reply(404, 'Not found');
      res.writeHead(200, {
        'Content-Type': contentTypes[path.extname(resolved)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': isPage ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'X-CTF-App': 'silent-lantern',
      });
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(resolved), res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return reply(404, 'Not found');
      process.stderr.write('SILENT LANTERN could not serve a file.\n');
      reply(500, 'Unable to load this page');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid PORT is required.');
  const server = await createLanternServer({ basePath: process.env.BASE_PATH ?? '/silent-lantern/' });
  server.listen(port, '0.0.0.0', () => process.stdout.write(`SILENT LANTERN listening on port ${port}\n`));
}
