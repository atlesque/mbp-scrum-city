// `npm run test:smoke`: runs the smoke test (tests/smoke.mjs) split over SMOKE_SHARDS browsers at once (2 by default; more starve each other of CPU),
// then reruns whatever failed once more on its own, in one browser (SMOKE_RETRY=0 turns that off), and lists what failed
// both times and how to rerun just that. A step that only passed the second time is listed as flaky.
// `npm run test:smoke -- tank reload` runs only the steps whose names contain one of those words, in one browser.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

const words = process.argv.slice(2);
const shards = words.length || process.env.SMOKE_ONLY ? 1 : Math.max(1, +process.env.SMOKE_SHARDS || Math.min(2, availableParallelism() - 1));
const t0 = Date.now();
let failed = [], steps = 0;

function run(i, n = shards, only = words.length ? words.join(',') : '') {
  const env = { ...process.env, SMOKE_SHARD: `${i}/${n}` };
  if (only) env.SMOKE_ONLY = only;
  const p = spawn(process.execPath, [new URL('./smoke.mjs', import.meta.url).pathname], { env });
  let buf = '';
  const line = l => {
    if (/^(ok  |FAIL)/.test(l)) steps++;
    if (/^FAIL /.test(l)) failed.push(l.slice(5).replace(/ \(\d+ s\)\s*$/, ''));
    if (!/^(rerun just these|smoke test passed|\d+ (step|smoke))/.test(l)) console.log(n > 1 ? `[${i}] ${l}` : l);
  };
  const feed = d => { buf += d; const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(line); };
  p.stdout.on('data', feed); p.stderr.on('data', feed);
  return new Promise(r => p.on('close', code => { if (buf) line(buf); r(code); }));
}

let codes = await Promise.all(Array.from({ length: shards }, (_, i) => run(i + 1)));
const total = steps;
let flaky = [];
// once more for what failed, alone in one browser (the step names have commas, so they go as whole names, split by |)
if (failed.length && failed.length <= 15 && !process.env.SMOKE_ONLY && +(process.env.SMOKE_RETRY ?? 1)) {
  const first = failed; failed = [];
  console.log(`\nrerunning the ${first.length} failed step(s) on their own:`);
  codes = [await run(1, 1, first.join('|'))];
  flaky = first.filter(f => !failed.includes(f));
}
const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n${total} step(s) in ${mins} min over ${shards} browser(s), ${failed.length} failed`);
if (flaky.length) console.log('flaky (failed, then passed on their own):\n  ' + flaky.join('\n  '));
if (failed.length) {
  console.log('failed:\n  ' + failed.join('\n  '));
  console.log(`rerun just these: SMOKE_ONLY="${failed.join('|')}" node tests/smoke.mjs`);
}
const bad = codes.some(c => c !== 0);
if (bad && !failed.length) console.log('a smoke browser exited with an error before its steps finished (see its output above)');
console.log(bad ? 'smoke test failed' : 'smoke test passed');
process.exit(bad ? 1 : 0);
