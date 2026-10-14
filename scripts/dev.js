// Runs the API (with auto-reload) and the Vite dev server together.
import { spawn } from 'node:child_process';

const procs = [
  ['api', 'npm', ['run', 'dev', '-w', 'server']],
  ['web', 'npm', ['run', 'dev', '-w', 'client']],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = name === 'api' ? '\x1b[35m[api]\x1b[0m' : '\x1b[36m[web]\x1b[0m';
  const out = (d) => process.stdout.write(d.toString().split('\n').filter(Boolean).map((l) => `${tag} ${l}`).join('\n') + '\n');
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => {
    console.log(`${tag} exited with code ${code}`);
    procs.forEach((x) => x.kill());
    process.exit(code || 0);
  });
  return p;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill('SIGINT')));
