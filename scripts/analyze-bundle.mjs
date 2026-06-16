// Analyze bundle composition with esbuild metafile
import { build as esbuild } from 'esbuild';
import { writeFileSync } from 'node:fs';

const result = await esbuild({
  entryPoints: ['src/app.jsx'],
  bundle: true,
  outfile: '/tmp/paced-app.js',
  format: 'esm',
  platform: 'browser',
  target: ['es2020', 'safari14', 'firefox100', 'chrome100'],
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  jsx: 'transform',
  minify: true,
  metafile: true,
  legalComments: 'none',
});

writeFileSync('/tmp/paced-meta.json', JSON.stringify(result.metafile, null, 2));
const out = Object.values(result.metafile.outputs)[0];
const entries = Object.entries(out.inputs)
  .map(([path, { bytesInOutput }]) => ({ path, bytes: bytesInOutput }))
  .sort((a, b) => b.bytes - a.bytes);
console.log('Total output bytes:', out.bytes);
console.log('Top 25 contributors:');
for (const e of entries.slice(0, 25)) {
  console.log(`  ${(e.bytes/1024).toFixed(1).padStart(7)} KB  ${e.path}`);
}
const grouped = {};
for (const e of entries) {
  let key;
  if (e.path.startsWith('node_modules/react-dom')) key = 'react-dom';
  else if (e.path.startsWith('node_modules/react/')) key = 'react';
  else if (e.path.startsWith('node_modules/scheduler')) key = 'scheduler';
  else if (e.path.startsWith('node_modules/lucide-react')) key = 'lucide-react';
  else if (e.path.startsWith('node_modules/@fontsource')) key = 'fontsource';
  else if (e.path.startsWith('node_modules')) key = 'other node_modules';
  else if (e.path.includes('i18n')) key = 'src/lib/i18n.js';
  else if (e.path.includes('Partner')) key = 'src/Partner*';
  else if (e.path.includes('app.jsx')) key = 'src/app.jsx';
  else key = 'src/* other';
  grouped[key] = (grouped[key] || 0) + e.bytes;
}
console.log('\nGrouped:');
for (const [k,v] of Object.entries(grouped).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${(v/1024).toFixed(1).padStart(7)} KB  ${k}`);
}
