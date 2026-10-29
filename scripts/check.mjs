// Syntax-checks every JavaScript file the server or the browser runs.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const dirs = ['server', 'shared', 'public/js', 'e2e', 'test', 'scripts'];
let n = 0;
for (const d of dirs) for (const f of readdirSync(d)) {
  if (!/\.(m?js)$/.test(f)) continue;
  execFileSync(process.execPath, ['--check', path.join(d, f)], {stdio: 'inherit'});
  n++;
}
console.log(`Checked ${n} files.`);
