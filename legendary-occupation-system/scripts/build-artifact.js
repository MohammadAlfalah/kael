'use strict';
/*
 * Builds dist/artifact.html — a single self-contained page for publishing
 * as a claude.ai Artifact. Artifacts supply their own document skeleton, so
 * the output deliberately has no <!DOCTYPE>/<html>/<head>/<body> wrappers:
 * it is the marked HEAD region (title + fonts + styles) followed by the
 * marked BODY region with the three engine <script src> tags inlined.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

function region(name) {
  const start = '<!-- LOS:' + name + '-START -->';
  const end = '<!-- LOS:' + name + '-END -->';
  const a = src.indexOf(start);
  const b = src.indexOf(end);
  if (a < 0 || b < 0) throw new Error('Missing marker: ' + name);
  return src.slice(a + start.length, b);
}

let head = region('HEAD');
let body = region('BODY');

body = body.replace(/<script src="\.\.\/src\/(content|engine|mind)\.js"><\/script>/g, (m, mod) => {
  const code = fs.readFileSync(path.join(root, 'src', mod + '.js'), 'utf8');
  return '<script>\n' + code + '\n</script>';
});

if (/src="\.\.\//.test(body)) throw new Error('Unresolved relative script reference in body');

const out = head.trim() + '\n' + body.trim() + '\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const outPath = path.join(root, 'dist', 'artifact.html');
fs.writeFileSync(outPath, out);
console.log('Built ' + outPath + ' (' + (out.length / 1024).toFixed(1) + ' KiB)');
