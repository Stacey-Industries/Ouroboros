"""Aggregate cache + token usage from a running subagent transcript.
Usage: python tmp_monitor.py <agent_id>"""
import json, sys, glob, os

agent_id = sys.argv[1] if len(sys.argv) > 1 else "a3660c66ec8395f78"
candidates = glob.glob(
    rf"C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\*\subagents\agent-{agent_id}.jsonl"
)
if not candidates:
    print(f"no transcript yet for {agent_id}")
    sys.exit(0)
path = candidates[0]
with open(path, "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

n_records = len(lines)
n_assistant = 0
n_tool_use = 0
total_input = 0
total_cache_create = 0
total_cache_read = 0
total_output = 0
last_stop = None
last_role = None
turns = []

for ln in lines:
    try:
        r = json.loads(ln)
    except Exception:
        continue
    t = r.get("type")
    last_role = t
    if t != "assistant":
        continue
    n_assistant += 1
    msg = r.get("message", {})
    stop = msg.get("stop_reason")
    if stop:
        last_stop = stop
    u = msg.get("usage", {}) or {}
    inp = u.get("input_tokens", 0) or 0
    cc = u.get("cache_creation_input_tokens", 0) or 0
    cr = u.get("cache_read_input_tokens", 0) or 0
    out = u.get("output_tokens", 0) or 0
    total_input += inp
    total_cache_create += cc
    total_cache_read += cr
    total_output += out
    for blk in msg.get("content", []) or []:
        if isinstance(blk, dict) and blk.get("type") == "tool_use":
            n_tool_use += 1
    turns.append((n_assistant, inp, cc, cr, out, stop))

first_ts = json.loads(lines[0]).get("timestamp", "?") if lines else "?"
last_ts = json.loads(lines[-1]).get("timestamp", "?") if lines else "?"

print(f"=== {agent_id} ===")
print(f"records:                   {n_records}")
print(f"assistant turns:           {n_assistant}")
print(f"tool_uses emitted:         {n_tool_use}")
print(f"last_role:                 {last_role}")
print(f"last_assistant_stop:       {last_stop}")
print(f"first_ts:                  {first_ts}")
print(f"last_ts:                   {last_ts}")
print(f"total input_tokens:        {total_input:,}")
print(f"total cache_create_tokens: {total_cache_create:,}")
print(f"total cache_read_tokens:   {total_cache_read:,}")
print(f"total output_tokens:       {total_output:,}")
if total_cache_read + total_cache_create > 0:
    hit_rate = 100 * total_cache_read / (total_cache_read + total_cache_create)
    print(f"cache hit rate:            {hit_rate:.1f}%")
print()
print("per-turn (turn# inp cc cr out stop):")
for tn, inp, cc, cr, out, stop in turns[-12:]:
    print(f"  t{tn:>3d}  inp={inp:>6,}  cc={cc:>6,}  cr={cr:>7,}  out={out:>5,}  {stop or ''}")
