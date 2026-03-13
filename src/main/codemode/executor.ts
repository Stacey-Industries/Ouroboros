import vm from 'vm'

/** Result returned by executeCode */
export interface ExecuteResult {
  success: boolean
  result?: unknown
  error?: string
  logs: string[]
}

/** Safe globals exposed inside the VM — no Node APIs, no eval/Function. */
function getSafeSandboxGlobals(): Record<string, unknown> {
  return {
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, JSON, Math, Date, Array, Object, String, Number, Boolean,
    Map, Set, WeakMap, WeakSet, Symbol,
    Error, TypeError, RangeError, URIError, SyntaxError, ReferenceError,
    RegExp, parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    undefined, NaN, Infinity,
  }
}

/** Build a console proxy that captures output into a logs array. */
function buildConsoleProxy(logs: string[]) {
  const makeMethod = (level: string) => (...args: unknown[]): void => {
    logs.push(`[${level}] ${args.map(String).join(' ')}`)
  }
  return {
    log: makeMethod('log'),
    warn: makeMethod('warn'),
    error: makeMethod('error'),
    info: makeMethod('info'),
    debug: makeMethod('debug'),
  }
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
  const logs: string[] = []

  try {
    const consoleProxy = buildConsoleProxy(logs)

    // Build the sandbox context with safe globals + tool access
    const sandbox: Record<string, unknown> = {
      ...getSafeSandboxGlobals(),
      console: consoleProxy,
      servers: toolFns,
    }

    const context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    })

    // Wrap in async IIFE so top-level await works
    const wrapped = `(async () => {\n${code}\n})()`

    const script = new vm.Script(wrapped, {
      filename: 'codemode-sandbox.js',
    })

    // Run with timeout — returns a Promise from the async IIFE
    const promise = script.runInContext(context, {
      timeout: 30_000,
    })

    // Await the async result
    const result = await promise

    return { success: true, result, logs }
  } catch (err: unknown) {
    const message = formatError(err)
    return { success: false, error: message, logs }
  }
}

/** Produce a clean error message from various error types. */
function formatError(err: unknown): string {
  if (err instanceof Error) {
    // Node's VM timeout error
    if (err.message === 'Script execution timed out after 30000ms' ||
        err.message.includes('Script execution timed out')) {
      return 'Execution timed out (30s limit)'
    }
    // Code generation blocked (eval/Function/wasm)
    if (err.message.includes('Code generation from strings disallowed')) {
      return 'eval() and new Function() are not allowed'
    }
    return err.message
  }
  return String(err)
}
