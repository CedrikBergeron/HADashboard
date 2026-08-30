import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const devEnvironment = { ...process.env, DASHBOARD_DEV: '1' };

const processes = [
  spawn(process.execPath, ['server/server.mjs'], { cwd: appRoot, env: devEnvironment, stdio: 'inherit' }),
  spawn('npm', ['--prefix', 'angular-dashboard', 'run', 'client'], { cwd: appRoot, stdio: 'inherit' })
];

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of processes) child.on('exit', (code) => {
  if (code && code !== 0) {
    process.exitCode = code;
    stop();
  }
});
