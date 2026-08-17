import { spawn } from 'node:child_process';

const processes = [
  spawn(process.execPath, ['server/server.mjs'], { stdio: 'inherit' }),
  spawn('npm', ['--prefix', 'angular-dashboard', 'run', 'client'], { stdio: 'inherit' })
];

function stop() {
  for (const child of processes) child.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of processes) child.on('exit', (code) => {
  if (code && code !== 0) process.exitCode = code;
});
