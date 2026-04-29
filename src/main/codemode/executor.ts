import vm from 'vm';

/** Result returned by executeCode */
export interface ExecuteResult {
  success: boolean;
  result?: unknown;
  error?: string;
  logs: string[];
}

/** Safe globals exposed inside the VM — no Node APIs, no eval/Function. */
function getSafeSandboxGlobals(): Record<string, unknown> {
  return {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Error,
    TypeError,
    RangeError,
    URIError,
    SyntaxError,
    ReferenceError,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    undefined,
    NaN,
    Infinity,
  };
}

/** Build a console proxy that captures output into a logs array. */
function buildConsoleProxy(logs: string[]) {
  const makeMethod =
    (level: string) =>
    (...args: unknown[]): void => {
      logs.push(`[${level}] ${args.map(String).join(' ')}`);
    };
  return {
    log: makeMethod('log'),
    warn: makeMethod('warn'),
    error: makeMethod('error'),
    info: makeMethod('info'),
    debug: makeMethod('debug'),
  };
}

/**
 * Execute LLM-generated code in a secure VM sandbox.
 *
 * @param code        — JavaScript/TypeScript code to run
 * @param toolFns     — `{ serverName: { toolName: callFn } }` exposed as `servers` in the sandbox
 * @returns           — execution result with captured logs
 */
export async function executeCode(
  code: string,
  toolFns: Record<string, Record<string, (args: Record<string, unknown>) => Promise<unknown>>>,
): Promise<ExecuteResult> {
  const logs: string[] = [];
  const serverNames = Object.keys(toolFns);

  try {
    const consoleProxy = buildConsoleProxy(logs);

    const sandbox: Record<string, unknown> = {
      ...getSafeSandboxGlobals(),
      console: consoleProxy,
      servers: toolFns,
    };

    const context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    });

    const wrapped = `(async () => {\n${code}\n})()`;
    const script = new vm.Script(wrapped, { filename: 'codemode-sandbox.js' });
    const promise = script.runInContext(context, { timeout: 30_000 });
    const result = await promise;

    return { success: true, result, logs };
  } catch (err: unknown) {
    const message = formatError(err, serverNames);
    return { success: false, error: message, logs };
  }
}

/**
 * Wave 53l Phase A polish (Fix #4): when the agent writes
 * `servers.foo.bar(...)` for a server that isn't multiplexed, V8 throws
 * `TypeError: Cannot read properties of undefined (reading 'bar')`. The
 * raw error is a head-scratcher for an LLM. Detecting the pattern and
 * appending the actually-available server names turns it into a
 * one-shot self-correction signal.
 */
function maybeRewriteUndefinedAccess(message: string, serverNames: string[]): string | null {
  const m = /Cannot read properties of undefined \(reading '([^']+)'\)/.exec(message);
  if (!m) return null;
  const accessed = m[1];
  return (
    `${message}\n\nLikely cause: \`servers.<name>.${accessed}(...)\` where <name> ` +
    `is not currently multiplexed. Available servers: ${serverNames.join(', ') || '(none)'}.`
  );
}

/** Produce a clean error message from various error types. */
function formatError(err: unknown, serverNames: string[]): string {
  if (!(err instanceof Error)) return String(err);
  if (err.message.includes('Script execution timed out')) {
    return 'Execution timed out (30s limit)';
  }
  if (err.message.includes('Code generation from strings disallowed')) {
    return 'eval() and new Function() are not allowed';
  }
  return maybeRewriteUndefinedAccess(err.message, serverNames) ?? err.message;
}
