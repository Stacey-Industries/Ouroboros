# Wave 72 — Architecture Decision Record

## Decision 1: Internal ref, not forwardRef

**Context:** `AgentChatWorkspace` needs a stable DOM ref to pass to `useSwipeNavigation`. Two options: expose a `forwardRef` so callers can optionally access the root, or attach an internal `useRef` and consume it only inside the workspace.

**Options considered:**
- *Internal ref:* `useRef<HTMLDivElement>(null)` inside the workspace, attached to root div. No caller-visible API change. Zero props added.
- *forwardRef:* Expose the ref via `React.forwardRef`. Adds API surface; no current caller needs it.

**Pick:** Internal ref — internal concern only.

**Rationale:** No caller needs the workspace root ref. `forwardRef` adds public API surface without a consumer — dead weight until a concrete use case arises.

**Consequences:** If a future wave needs external access to the workspace root, a forwardRef refactor is straightforward. Until then, the workspace owns its own ref.

---

## Decision 2: Wrap-around cycling

**Context:** When swiping left at the last thread (or right at the first), the cycling behavior must be specified: clamp (do nothing) or wrap-around (jump to the other end).

**Options considered:**
- *Clamp:* No-op at boundaries. Common for sequential lists.
- *Wrap-around:* Jump from last → first (swipe left) or first → last (swipe right). Universal mobile gesture contract for carousels and tab bars.

**Pick:** Wrap-around.

**Rationale:** Touch surfaces expect wrap-around for horizontal swipe navigation (iOS tab bars, Android view pagers). Clamping would feel broken to mobile users. Desktop users who accidentally overshoot a boundary get a visible thread switch and can swipe back — recoverable and expected.

**Consequences:** Swiping on a single-thread workspace is a no-op (wrap to same thread → selectThread with same ID → no visible change).

---

## Decision 3: Hook wired from workspace internals, no new props or store fields

**Context:** `useSwipeNavigation` needs `onSwipeLeft` and `onSwipeRight` callbacks. These callbacks need access to `threads[]` and `selectThread`. The question is where this state comes from.

**Options considered:**
- *New props on AgentChatWorkspace:* `onSwipeLeft?` / `onSwipeRight?` from callers. Pushes the decision to callers unnecessarily.
- *Workspace internals:* `model.threads` and `model.selectThread` are already available in `AgentChatWorkspace` from `useWorkspaceSetup`. A helper `useWorkspaceSwipe(workspaceRef, model)` consumes them directly.
- *Zustand store:* Add a new store action. Unnecessary indirection — `selectThread` is already on the model.

**Pick:** Workspace internals via `useWorkspaceSwipe` helper.

**Rationale:** Swipe cycling is a workspace-internal concern. No caller needs to know about it, and all required state (`threads`, `selectThread`) is already present in the component's scope. Adding props or store fields would be premature abstraction.

**Consequences:** `useWorkspaceSwipe` is a private helper; callers cannot override the cycle behavior. Acceptable — if an override is ever needed, it can be promoted to a prop at that point.
