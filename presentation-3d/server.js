// Static server for the animation workspace. Serves this folder (including
// node_modules, which holds three.js and the vendored fonts) so the page runs
// over http - ES modules and fetch() both refuse to work from file://.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + url); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
}).listen(5180, () => console.log('anim workspace on http://localhost:5180'));
