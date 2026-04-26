// ide-query.mjs
// CLI utility — sends a JSON-RPC request to the Ouroboros IDE tool server
// (named pipe `\\.\pipe\ouroboros-tools` on Windows, /tmp/ouroboros-tools.sock
// on Unix) and prints the response to stdout.
//
// Usage: node ide-query.mjs <method> [paramsJson]
//        node ide-query.mjs ide.getOpenFiles
//        node ide-query.mjs ide.getFileContent '{"path":"C:/src/main.ts"}'

import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';
import { join } from 'node:path';

import { loadTokens } from './lib/ouroboros.mjs';

const TIMEOUT_MS = 10_000;
const PIPE_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\ouroboros-tools'
  : '/tmp/ouroboros-tools.sock';

const args = process.argv.slice(2);
if (args.length < 1) {
  process.stderr.write('Usage: node ide-query.mjs <method> [paramsJson]\n');
  process.exit(2);
}
const method = args[0];
const paramsRaw = args[1] ?? '{}';

let params;
try { params = JSON.parse(paramsRaw); } catch {
  process.stderr.write(`ide-query: invalid params JSON: ${paramsRaw}\n`);
  process.exit(2);
}

const { toolToken } = loadTokens();
if (!toolToken) {
  process.stderr.write('ide-query: no tool token (Ouroboros not running, or token file missing)\n');
  process.exit(1);
}

const requestId = randomBytes(8).toString('hex');
const request = JSON.stringify({ id: requestId, method, params }) + '\n';
const auth = JSON.stringify({ auth: toolToken }) + '\n';

const result = await new Promise((resolve) => {
  let buf = '';
  let done = false;
  const finish = (out) => { if (!done) { done = true; resolve(out); } };
  const sock = createConnection({ path: PIPE_PATH });
  sock.setTimeout(TIMEOUT_MS);
  sock.on('connect', () => {
    try {
      sock.write(auth);
      sock.write(request);
    } catch (err) {
      sock.destroy();
      finish({ error: 'write failed: ' + err.message });
    }
  });
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const nl = buf.indexOf('\n');
    if (nl < 0) return;
    const line = buf.slice(0, nl);
    sock.end();
    try {
      finish({ response: JSON.parse(line) });
    } catch {
      finish({ error: 'invalid JSON response: ' + line });
    }
  });
  sock.on('timeout', () => { sock.destroy(); finish({ error: 'connection timeout — Ouroboros IDE not responding' }); });
  sock.on('error', (err) => { finish({ error: 'connection failed: ' + err.message }); });
  sock.on('close', () => finish({ error: 'connection closed without response' }));
});

if (result.error) {
  process.stderr.write(`ide-query: ${result.error}\n`);
  process.exit(1);
}

const resp = result.response;
if (resp.error) {
  process.stderr.write(`IDE query error: ${resp.error.message ?? JSON.stringify(resp.error)}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(resp.result ?? null, null, 2) + '\n');
