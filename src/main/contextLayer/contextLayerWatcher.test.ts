import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContextInvalidationEvent } from './contextLayerTypes'
import { createContextLayerWatcher } from './contextLayerWatcher'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE = process.platform === 'win32'
  ? 'C:\\project'
  : '/project'

function wp(...segments: string[]): string {
  return path.join(WORKSPACE, ...segments)
}

function createModuleMap(entries: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [moduleId, files] of Object.entries(entries)) {
    for (const file of files) {
      const normalized = process.platform === 'win32'
        ? path.normalize(file).toLowerCase()
        : path.normalize(file)
      map.set(normalized, moduleId)
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contextLayerWatcher', () => {
  let onInvalidation: ReturnType<typeof vi.fn<(event: ContextInvalidationEvent) => void>>

  beforeEach(() => {
    vi.useFakeTimers()
    onInvalidation = vi.fn<(event: ContextInvalidationEvent) => void>()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // 1. Single file change -> debounced invalidation
  // -----------------------------------------------------------------------

  it('debounces a single file change and fires after debounceMs', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'file-tree': [wp('src', 'renderer', 'components', 'FileTree', 'FileList.tsx')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.onFileChange('change', wp('src', 'renderer', 'components', 'FileTree', 'FileList.tsx'))

    // Should NOT fire immediately
    expect(onInvalidation).not.toHaveBeenCalled()

    // Advance past debounce window
    vi.advanceTimersByTime(5000)

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.type).toBe('file_changed')
    expect(event.affectedModules).toContain('file-tree')

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 2. Multiple rapid changes -> single invalidation
  // -----------------------------------------------------------------------

  it('coalesces multiple rapid changes into a single invalidation', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'file-tree': [
        wp('src', 'FileTree', 'a.ts'),
        wp('src', 'FileTree', 'b.ts'),
        wp('src', 'FileTree', 'c.ts'),
      ],
      'terminal': [
        wp('src', 'Terminal', 'a.ts'),
        wp('src', 'Terminal', 'b.ts'),
        wp('src', 'Terminal', 'c.ts'),
      ],
      'settings': [
        wp('src', 'Settings', 'a.ts'),
        wp('src', 'Settings', 'b.ts'),
        wp('src', 'Settings', 'c.ts'),
        wp('src', 'Settings', 'd.ts'),
      ],
    })
    watcher.setModuleMap(moduleMap)

    // Fire 10 changes across 3 modules within 100ms
    watcher.onFileChange('change', wp('src', 'FileTree', 'a.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'FileTree', 'b.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'Terminal', 'a.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'FileTree', 'c.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'Settings', 'a.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'Terminal', 'b.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'Settings', 'b.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'Settings', 'c.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'Terminal', 'c.ts'))
    vi.advanceTimersByTime(10)
    watcher.onFileChange('change', wp('src', 'Settings', 'd.ts'))

    // Not fired yet — debounce timer resets on each change
    expect(onInvalidation).not.toHaveBeenCalled()

    // Advance past the debounce window from the last change
    vi.advanceTimersByTime(5000)

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.affectedModules.sort()).toEqual(['file-tree', 'settings', 'terminal'])

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 3. Debounce reset on new changes
  // -----------------------------------------------------------------------

  it('resets the debounce timer when new changes arrive', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
      'module-b': [wp('src', 'b.ts')],
    })
    watcher.setModuleMap(moduleMap)

    // First change
    watcher.onFileChange('change', wp('src', 'a.ts'))

    // Wait 3 seconds (within debounce window)
    vi.advanceTimersByTime(3000)
    expect(onInvalidation).not.toHaveBeenCalled()

    // Second change — resets the timer
    watcher.onFileChange('change', wp('src', 'b.ts'))

    // 3 more seconds from now (6 seconds total) — still within the reset window
    vi.advanceTimersByTime(3000)
    expect(onInvalidation).not.toHaveBeenCalled()

    // 2 more seconds (5 seconds after the second change) — should fire
    vi.advanceTimersByTime(2000)
    expect(onInvalidation).toHaveBeenCalledTimes(1)

    const event = onInvalidation.mock.calls[0][0]
    expect(event.affectedModules.sort()).toEqual(['module-a', 'module-b'])

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 4. Ignored paths (node_modules)
  // -----------------------------------------------------------------------

  it('ignores changes to node_modules paths', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'app': [wp('src', 'app.ts')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.onFileChange('change', wp('node_modules', 'foo', 'bar.js'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).not.toHaveBeenCalled()

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 5. Changes to .context/ ignored
  // -----------------------------------------------------------------------

  it('ignores changes to .context/ directory', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'app': [wp('src', 'app.ts')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.onFileChange('change', wp('.context', 'repo-map.json'))
    watcher.onFileChange('change', wp('.context', 'modules', 'file-tree.json'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).not.toHaveBeenCalled()

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 6. onGitCommit -> immediate full invalidation
  // -----------------------------------------------------------------------

  it('fires immediate full invalidation on git commit', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
      'module-b': [wp('src', 'b.ts')],
      'module-c': [wp('src', 'c.ts')],
      'module-d': [wp('src', 'd.ts')],
      'module-e': [wp('src', 'e.ts')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.onGitCommit()

    // Should fire immediately — no debounce
    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.type).toBe('git_commit')
    expect(event.affectedModules.sort()).toEqual([
      'module-a', 'module-b', 'module-c', 'module-d', 'module-e',
    ])

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 7. onSessionStart -> conditional invalidation
  // -----------------------------------------------------------------------

  it('fires invalidation on session start when no previous invalidation exists', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
    })
    watcher.setModuleMap(moduleMap)

    // Reset the invalidation from setModuleMap (which doesn't fire since there's
    // no pending __all__). lastInvalidationTimestamp should still be 0.
    onInvalidation.mockClear()

    watcher.onSessionStart()

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.type).toBe('session_start')

    watcher.dispose()
  })

  it('skips session start invalidation when last invalidation was recent', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
    })
    watcher.setModuleMap(moduleMap)

    // Trigger a recent invalidation
    watcher.forceRebuild()
    onInvalidation.mockClear()

    // Session start immediately after — should be skipped (within 60s threshold)
    watcher.onSessionStart()

    expect(onInvalidation).not.toHaveBeenCalled()

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 8. forceRebuild -> immediate full invalidation
  // -----------------------------------------------------------------------

  it('fires immediate full invalidation on forceRebuild', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
      'module-b': [wp('src', 'b.ts')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.forceRebuild()

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.type).toBe('manual')
    expect(event.affectedModules.sort()).toEqual(['module-a', 'module-b'])

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 9. No module map yet -> __all__ sentinel
  // -----------------------------------------------------------------------

  it('uses __all__ sentinel when module map is not yet set', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    // Don't set module map — fire a change
    watcher.onFileChange('change', wp('src', 'anything.ts'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.affectedModules).toContain('__all__')

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 10. dispose() clears timers
  // -----------------------------------------------------------------------

  it('does not fire invalidation after dispose', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.onFileChange('change', wp('src', 'a.ts'))

    // Dispose before timer fires
    watcher.dispose()

    vi.advanceTimersByTime(10000)

    expect(onInvalidation).not.toHaveBeenCalled()
  })

  it('all methods are no-ops after dispose', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    watcher.dispose()

    // None of these should throw or trigger invalidation
    watcher.onFileChange('change', wp('src', 'a.ts'))
    watcher.onGitCommit()
    watcher.onSessionStart()
    watcher.forceRebuild()
    watcher.setModuleMap(new Map())

    vi.advanceTimersByTime(10000)

    expect(onInvalidation).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 11. File outside workspace root -> ignored
  // -----------------------------------------------------------------------

  it('ignores changes to files outside the workspace root', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
    })
    watcher.setModuleMap(moduleMap)

    const outsidePath = process.platform === 'win32'
      ? 'C:\\other\\foo.ts'
      : '/other/foo.ts'
    watcher.onFileChange('change', outsidePath)

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).not.toHaveBeenCalled()

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // 12. Unknown file -> __new_files__ marker
  // -----------------------------------------------------------------------

  it('includes __new_files__ marker for files not in the module map', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    // Module map without the file we'll change
    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
    })
    watcher.setModuleMap(moduleMap)

    // Change a file not in the module map
    watcher.onFileChange('add', wp('src', 'brand-new-file.ts'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.affectedModules).toContain('__new_files__')

    watcher.dispose()
  })

  it('includes both module IDs and __new_files__ marker together', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
    })
    watcher.setModuleMap(moduleMap)

    // Change a known file and an unknown file
    watcher.onFileChange('change', wp('src', 'a.ts'))
    watcher.onFileChange('add', wp('src', 'unknown.ts'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.affectedModules).toContain('module-a')
    expect(event.affectedModules).toContain('__new_files__')

    watcher.dispose()
  })

  // -----------------------------------------------------------------------
  // Additional edge cases
  // -----------------------------------------------------------------------

  it('ignores .git directory changes', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })
    watcher.setModuleMap(new Map())

    watcher.onFileChange('change', wp('.git', 'HEAD'))
    watcher.onFileChange('change', wp('.git', 'refs', 'heads', 'main'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).not.toHaveBeenCalled()

    watcher.dispose()
  })

  it('ignores dist, build, and coverage directories', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })
    watcher.setModuleMap(new Map())

    watcher.onFileChange('change', wp('dist', 'index.js'))
    watcher.onFileChange('change', wp('build', 'app.js'))
    watcher.onFileChange('change', wp('coverage', 'lcov.info'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).not.toHaveBeenCalled()

    watcher.dispose()
  })

  it('onGitCommit absorbs pending debounced changes', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
      'module-b': [wp('src', 'b.ts')],
    })
    watcher.setModuleMap(moduleMap)

    // Queue a debounced change
    watcher.onFileChange('change', wp('src', 'a.ts'))
    expect(onInvalidation).not.toHaveBeenCalled()

    // Git commit fires immediately and absorbs the pending change
    watcher.onGitCommit()
    expect(onInvalidation).toHaveBeenCalledTimes(1)

    // The debounce timer should have been cleared — no second fire
    vi.advanceTimersByTime(10000)
    expect(onInvalidation).toHaveBeenCalledTimes(1)

    watcher.dispose()
  })

  it('setModuleMap triggers full rebuild when __all__ invalidations are pending', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    // File changes before module map is set
    watcher.onFileChange('change', wp('src', 'something.ts'))

    // Don't let the debounce fire yet
    vi.advanceTimersByTime(1000)
    expect(onInvalidation).not.toHaveBeenCalled()

    // Now set the module map — should trigger immediate full rebuild
    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a.ts')],
      'module-b': [wp('src', 'b.ts')],
    })
    watcher.setModuleMap(moduleMap)

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.type).toBe('manual')
    expect(event.affectedModules.sort()).toEqual(['module-a', 'module-b'])

    // No leftover debounce fire
    vi.advanceTimersByTime(10000)
    expect(onInvalidation).toHaveBeenCalledTimes(1)

    watcher.dispose()
  })

  it('uses custom debounceMs value', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 1000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'fast-module': [wp('src', 'fast.ts')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.onFileChange('change', wp('src', 'fast.ts'))

    // 500ms — not yet
    vi.advanceTimersByTime(500)
    expect(onInvalidation).not.toHaveBeenCalled()

    // 1000ms total — should fire
    vi.advanceTimersByTime(500)
    expect(onInvalidation).toHaveBeenCalledTimes(1)

    watcher.dispose()
  })

  it('onGitCommit with no module map uses __all__ sentinel', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    // No module map set
    watcher.onGitCommit()

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.type).toBe('git_commit')
    expect(event.affectedModules).toEqual(['__all__'])

    watcher.dispose()
  })

  it('forceRebuild with no module map uses __all__ sentinel', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    watcher.forceRebuild()

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    expect(event.affectedModules).toEqual(['__all__'])

    watcher.dispose()
  })

  it('deduplicates module IDs from multiple files in the same module', () => {
    const watcher = createContextLayerWatcher({
      workspaceRoot: WORKSPACE,
      debounceMs: 5000,
      onInvalidation,
    })

    const moduleMap = createModuleMap({
      'module-a': [wp('src', 'a1.ts'), wp('src', 'a2.ts'), wp('src', 'a3.ts')],
    })
    watcher.setModuleMap(moduleMap)

    watcher.onFileChange('change', wp('src', 'a1.ts'))
    watcher.onFileChange('change', wp('src', 'a2.ts'))
    watcher.onFileChange('change', wp('src', 'a3.ts'))

    vi.advanceTimersByTime(5000)

    expect(onInvalidation).toHaveBeenCalledTimes(1)
    const event = onInvalidation.mock.calls[0][0]
    // Should contain module-a only once (Set semantics)
    expect(event.affectedModules).toEqual(['module-a'])

    watcher.dispose()
  })
})
