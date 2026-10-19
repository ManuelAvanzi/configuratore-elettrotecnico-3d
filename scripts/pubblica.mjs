// Pubblica il sito su GitHub Pages: costruisce `dist/` e lo spinge sul ramo `gh-pages` del remoto `origin`.
// Uso: `npm run pubblica` (serve avere fatto almeno un `git push` del progetto, con le credenziali GitHub salvate).
// Il sito è poi su https://<utente>.github.io/<repo>/ (ci vuole circa un minuto dopo il push).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
const out = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', ...opts }).trim();

const remote = out('git remote get-url origin');
const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(remote);
if (!m) throw new Error('Il remoto origin non è una repo GitHub: ' + remote);
const [, user, repo] = m;

console.log('→ build');
run('npm run build');
fs.writeFileSync(path.join(root, 'dist', '.nojekyll'), ''); // GitHub Pages: niente Jekyll, servi i file così come sono

console.log('→ ramo gh-pages');
const work = path.join(root, '.gh-pages');
fs.rmSync(work, { recursive: true, force: true });
try {
  run('git worktree prune', { stdio: 'ignore' });
} catch {
  /* niente da pulire */
}
run(`git worktree add --detach "${work}"`, { stdio: 'ignore' });
const w = { cwd: work };
run('git checkout --orphan gh-pages', { ...w, stdio: 'ignore' });
run('git rm -rf -q .', { ...w, stdio: 'ignore' });
for (const f of fs.readdirSync(work)) if (f !== '.git') fs.rmSync(path.join(work, f), { recursive: true, force: true });
fs.cpSync(path.join(root, 'dist'), work, { recursive: true });
run('git add -A', w);
run(`git commit -q -m "Pubblicazione del ${new Date().toLocaleString('it-IT')}"`, w);
run('git push -f origin gh-pages', w);
run(`git worktree remove --force "${work}"`, { stdio: 'ignore' });
try {
  run('git branch -D gh-pages', { stdio: 'ignore' });
} catch {
  /* il ramo locale può non esistere */
}
console.log(`\nPubblicato. Sito: https://${user.toLowerCase()}.github.io/${repo}/  (attendi circa un minuto)`);
