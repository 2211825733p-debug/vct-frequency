import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

const send = (response, status, body, type = 'text/plain; charset=utf-8') => {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': status === 200 ? 'no-cache' : 'no-store',
    ...securityHeaders
  });
  response.end(body);
};

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    send(response, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', `http://${request.headers.host || host}`).pathname);
  } catch {
    send(response, 400, 'Bad request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const absolute = resolve(root, `.${pathname}`);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    send(response, 403, 'Forbidden');
    return;
  }

  try {
    const info = await stat(absolute);
    if (!info.isFile()) {
      send(response, 404, 'Not found');
      return;
    }

    const extension = extname(absolute).toLowerCase();
    const type = mimeTypes[extension] || 'application/octet-stream';
    const data = await readFile(absolute);

    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.byteLength,
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
      ...securityHeaders
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    response.end(data);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      send(response, 404, 'Not found');
      return;
    }
    console.error(error);
    send(response, 500, 'Internal server error');
  }
});

server.listen(port, host, () => {
  console.log('');
  console.log('  VCT / THE CHAMPIONS FREQUENCY');
  console.log(`  Local broadcast: http://${host}:${port}`);
  console.log('  Press Ctrl+C to end transmission.');
  console.log('');
});
