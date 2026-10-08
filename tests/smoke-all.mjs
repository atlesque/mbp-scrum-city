// `npm run test:smoke`: runs the smoke test (tests/smoke.mjs) split over SMOKE_SHARDS browsers at once (3 by default),
// then lists what failed and how to rerun just that.
// `npm run test:smoke -- tank reload` runs only the steps whose names contain one of those words, in one browser.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

const words = process.argv.slice(2);
const shards = words.length || process.env.SMOKE_ONLY ? 1 : Math.max(1, +process.env.SMOKE_SHARDS || Math.min(3, availableParallelism() - 1));
const t0 = Date.now(), failed = [];
let steps = 0;

function run(i) {
  const env = { ...process.env, SMOKE_SHARD: `${i}/${shards}` };
  if (words.length) env.SMOKE_ONLY = words.join(',');
  const p = spawn(process.execPath, [new URL('./smoke.mjs', import.meta.url).pathname], { env });
  let buf = '';
  const line = l => {
    if (/^(ok  |FAIL)/.test(l)) steps++;
    if (/^FAIL /.test(l)) failed.push(l.slice(5).replace(/ \(\d+ s\)\s*$/, ''));
    if (!/^(rerun just these|smoke test passed|\d+ (step|smoke))/.test(l)) console.log(shards > 1 ? `[${i}] ${l}` : l);
  };
  const feed = d => { buf += d; const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(line); };
  p.stdout.on('data', feed); p.stderr.on('data', feed);
  return new Promise(r => p.on('close', code => { if (buf) line(buf); r(code); }));
}

const codes = await Promise.all(Array.from({ length: shards }, (_, i) => run(i + 1)));
const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n${steps} step(s) in ${mins} min over ${shards} browser(s), ${failed.length} failed`);
if (failed.length) {
  console.log('failed:\n  ' + failed.join('\n  '));
  console.log(`rerun just these: SMOKE_ONLY="${failed.join('|')}" node tests/smoke.mjs`);
}
const bad = codes.some(c => c !== 0);
if (bad && !failed.length) console.log('a smoke browser exited with an error before its steps finished (see its output above)');
console.log(bad ? 'smoke test failed' : 'smoke test passed');
process.exit(bad ? 1 : 0);
