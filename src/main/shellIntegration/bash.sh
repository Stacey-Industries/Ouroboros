# Ouroboros Shell Integration for Bash
# Emits OSC 633 sequences for command boundary detection

# Sentinel to prevent double-injection
if [ -n "$OUROBOROS_SHELL_INTEGRATION" ]; then return 2>/dev/null || exit 0; fi
export OUROBOROS_SHELL_INTEGRATION=1

__ouroboros_prompt_command() {
  local exit_code=$?
  # Command finished (D) with exit code — only if a command was executed
  if [ -n "$__ouroboros_cmd_executed" ]; then
    printf '\e]633;D;%s\a' "$exit_code"
    unset __ouroboros_cmd_executed
  fi
  # Report CWD
  printf '\e]633;P;Cwd=%s\a' "$PWD"
  # Prompt start (A)
  printf '\e]633;A\a'
}

__ouroboros_preexec() {
  # Command line text (E) — $1 is the command in bash preexec
  printf '\e]633;E;%s\a' "$1"
  # Command start / execution (B then C)
  printf '\e]633;B\a'
  printf '\e]633;C\a'
  __ouroboros_cmd_executed=1
}

# Install hooks
# Use PROMPT_COMMAND for prompt detection
if [[ -z "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="__ouroboros_prompt_command"
else
  PROMPT_COMMAND="__ouroboros_prompt_command;$PROMPT_COMMAND"
fi

# For preexec, use the DEBUG trap
__ouroboros_debug_trap() {
  # Skip if inside PROMPT_COMMAND
  if [[ "$BASH_COMMAND" == "__ouroboros_prompt_command"* ]]; then return; fi
  if [[ "$BASH_COMMAND" == "$PROMPT_COMMAND" ]]; then return; fi
  # Only fire once per command
  if [ -z "$__ouroboros_cmd_executed" ]; then
    __ouroboros_preexec "$BASH_COMMAND"
  fi
}
trap '__ouroboros_debug_trap' DEBUG
