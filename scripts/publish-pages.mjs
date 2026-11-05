import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args, cwd = root, options = {}) => execFileSync(command, args, {
  cwd, stdio: 'inherit', ...options,
});
const capture = (command, args, cwd = root) => run(command, args, cwd, {
  stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8',
}).trim();
const auth = [
  '-c', 'http.version=HTTP/1.1', '-c', 'http.postBuffer=134217728',
  '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential',
];
const repository = JSON.parse(capture('gh', ['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
const remote = `https://github.com/${repository}.git`;

run('npm', ['test']);
run('node', ['scripts/check-assets.mjs']);
run('npm', ['run', 'build']);

mkdirSync(join(root, '.cache'), { recursive: true });
const release = mkdtempSync(join(root, '.cache', 'pages-release-'));
let published = false;
try {
  run('git', ['init', '--quiet', release]);
  run('git', ['remote', 'add', 'origin', remote], release);
  const branch = spawnSync('git', [...auth, 'ls-remote', '--exit-code', '--heads', 'origin', 'gh-pages'], {
    cwd: release, stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (branch.status === 0) {
    run('git', [...auth, 'fetch', '--quiet', '--depth=1', 'origin', 'gh-pages'], release);
    run('git', ['checkout', '--quiet', '-B', 'gh-pages', 'FETCH_HEAD'], release);
  } else if (branch.status === 2) {
    run('git', ['checkout', '--quiet', '--orphan', 'gh-pages'], release);
  } else {
    throw new Error('Unable to read the remote publication branch.');
  }
  for (const entry of readdirSync(release)) {
    if (entry !== '.git') rmSync(join(release, entry), { recursive: true, force: true });
  }
  cpSync(join(root, 'dist'), release, { recursive: true });
  writeFileSync(join(release, '.nojekyll'), '');
  run('git', ['add', '--all'], release);
  const changes = capture('git', ['status', '--porcelain'], release);
  if (changes) {
    const revision = capture('git', ['rev-parse', '--short', 'HEAD']);
    run('git', ['commit', '--quiet', '-m', `Publish Hanzi Stars from ${revision}`], release);
    run('git', [...auth, 'push', 'origin', 'gh-pages'], release);
  }
  const page = spawnSync('gh', ['api', `repos/${repository}/pages`], { cwd: root, encoding: 'utf8' });
  let method = 'PUT';
  if (page.status !== 0) {
    if (!page.stderr.includes('HTTP 404')) throw new Error(page.stderr || 'Cannot read Pages settings.');
    method = 'POST';
  }
  const previous = page.status === 0 ? JSON.parse(page.stdout) : null;
  const sourceChanged = previous?.build_type !== 'legacy'
    || previous?.source?.branch !== 'gh-pages' || previous?.source?.path !== '/';
  if (sourceChanged) {
    run('gh', ['api', '--method', method, `repos/${repository}/pages`, '--input', '-'], root, {
      input: JSON.stringify({ build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } }),
      stdio: ['pipe', 'ignore', 'inherit'],
    });
    run('gh', ['api', '--method', 'POST', `repos/${repository}/pages/builds`], root, {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
  console.log(capture('gh', ['api', `repos/${repository}/pages`, '--jq', '.html_url']));
  published = true;
} finally {
  if (published) rmSync(release, { recursive: true, force: true });
  else console.error(`Publication stopped; diagnostic checkout preserved at ${release}`);
}
