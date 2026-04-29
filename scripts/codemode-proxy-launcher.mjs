import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const managedPath = join(homedir(), '.claude', 'codemode-managed.json');
const proxyConfigPath = join(tmpdir(), 'codemode-proxy-config.json');
const proxyServerPath = join(repoRoot, 'out', 'main', 'proxyServer.js');
const context7ProxyPath = join(repoRoot, 'out', 'main', 'context7Proxy.js');

async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildServers(record) {
  const servers = { ...(record?.global ?? {}) };
  const projectMap = record?.project ?? {};
  const activeRoot = record?.activeProjectRoot;
  if (activeRoot && projectMap[activeRoot]) {
    Object.assign(servers, projectMap[activeRoot]);
    return servers;
  }
  const entries = Object.entries(projectMap);
  if (entries.length === 1) {
    Object.assign(servers, entries[0][1]);
  }
  return servers;
}

function augmentWithContext7(servers) {
  if (Object.keys(servers).length === 0) return servers;
  if (servers.context7 || !process.env.CONTEXT7_API_KEY) return servers;
  if (!existsSync(context7ProxyPath)) return servers;
  return {
    ...servers,
    context7: {
      type: 'stdio',
      command: 'node',
      args: [context7ProxyPath],
    },
  };
}

async function refreshProxyConfig() {
  const record = await readJson(managedPath);
  if (!record || record.version !== 2) return false;
  const servers = augmentWithContext7(buildServers(record));
  if (Object.keys(servers).length === 0) return false;
  await writeFile(proxyConfigPath, JSON.stringify({ servers }, null, 2), 'utf-8');
  return true;
}

function forwardSignal(child, signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

async function main() {
  await refreshProxyConfig().catch(() => {});
  if (!existsSync(proxyServerPath)) {
    process.exit(1);
  }

  const child = spawn(process.execPath, [proxyServerPath, proxyConfigPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });

  process.on('SIGINT', () => forwardSignal(child, 'SIGINT'));
  process.on('SIGTERM', () => forwardSignal(child, 'SIGTERM'));

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
  child.on('error', () => process.exit(1));
}

void main();
