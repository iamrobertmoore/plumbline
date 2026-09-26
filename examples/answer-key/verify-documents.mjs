// Proves the recorded truth of the spec and checklist claims that are planted as false,
// and the two that depend on git history. Usage: node verify-documents.mjs <path-to-turnstile>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const t = process.argv[2];
const src = (f) => readFileSync(join(t, 'src', f), 'utf8');
const all = readdirSync(join(t, 'src')).map((f) => src(f)).join('\n');
const git = (...a) => execFileSync('git', a, { cwd: t, encoding: 'utf8' });
const checks = [
  ['spec 2.1 false: no bcrypt in src, scrypt used', !/bcrypt/i.test(all) && /scryptSync/.test(src('passwords.mjs'))],
  ['spec 2.2 false: PASSWORD_MIN is 10', /PASSWORD_MIN = 10;/.test(src('validation.mjs'))],
  ['spec 4.2 false at v2.3.0: access TTL is 3600', /ACCESS_TTL_SECONDS = 3600;/.test(src('tokens.mjs'))],
  ['spec 4.2 true at v2.2.0: access TTL was 900', /ACCESS_TTL_SECONDS = 900;/.test(git('show', 'v2.2.0:src/tokens.mjs'))],
  ['spec 5.3 false: sessions.mjs has no concurrent limit', !/MAX_SESSIONS|evict|oldest/i.test(src('sessions.mjs'))],
  ['checklist R-03 false: 2.3.0 changelog omits the token lifetime change', (() => {
    const cl = readFileSync(join(t, 'CHANGELOG.md'), 'utf8').split('## 2.2.0')[0];
    return !/token|lifetime|expire|minutes/i.test(cl) && /ACCESS_TTL/.test(git('diff', 'v2.2.0', 'v2.3.0', '--', 'src/tokens.mjs'));
  })()],
  ['checklist R-06 false: FIXME in src/', /FIXME/.test(all)],
  ['checklist R-04 true: version 2.3.0 and tag v2.3.0', JSON.parse(readFileSync(join(t, 'package.json'))).version === '2.3.0' && git('tag').includes('v2.3.0')],
  ['checklist R-07 true: both env vars in README', ['TURNSTILE_SECRET', 'TURNSTILE_ISSUER'].every((v) => readFileSync(join(t, 'README.md'), 'utf8').includes(v) && readFileSync(join(t, 'src/config.mjs'), 'utf8').includes(v))],
];
let bad = 0;
for (const [name, ok] of checks) { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
