# Terminal Rules (src/renderer/components/Terminal/**)

- Package: `@xterm/xterm` (NOT legacy `xterm` — they are incompatible)
- Double-rAF after `term.open()` before calling `fit()` — viewport not ready until then
- Use `isReadyRef` guard pattern to prevent premature fit calls
- Block OSC 10/11/12 via `term.parser.registerOscHandler` — prevents theme color override
- No WebGL addon — causes ghost cursor artifacts during rapid output
- Canvas renderer only
