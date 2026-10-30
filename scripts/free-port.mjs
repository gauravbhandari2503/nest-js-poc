// Dev helper: stop whatever is still listening on the app port (usually a previous
// `nest start --watch` that was not shut down) so the new start does not fail with EADDRINUSE.
import { execFileSync } from 'node:child_process';
import 'dotenv/config';

const port = Number(process.env.PORT ?? 3000);

function listeningPids() {
  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean).map(Number);
  } catch {
    // lsof exits 1 when nothing matches (or is not installed): nothing to free.
    return [];
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function signal(pid, sig) {
  try {
    process.kill(pid, sig);
  } catch (error) {
    // ESRCH: already gone, which is what we want.
    if (error.code !== 'ESRCH') {
      console.warn(
        `Could not stop process ${pid} on port ${port}: ${error.message}`,
      );
    }
  }
}

const pids = listeningPids().filter((pid) => pid !== process.pid);
for (const pid of pids) {
  console.log(`Port ${port} is in use by process ${pid}, stopping it`);
  signal(pid, 'SIGTERM');
}

// The app has shutdown hooks, so it may take a moment to exit; force it if it hangs.
for (
  let waited = 0;
  pids.length > 0 && listeningPids().length > 0;
  waited += 250
) {
  if (waited >= 3000) {
    for (const pid of listeningPids()) signal(pid, 'SIGKILL');
    break;
  }
  await sleep(250);
}
if (pids.length > 0) await sleep(250);
