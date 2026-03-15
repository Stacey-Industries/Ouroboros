# Ouroboros Shell Integration for Zsh
# Emits OSC 633 sequences for command boundary detection

if [[ -n "$OUROBOROS_SHELL_INTEGRATION" ]]; then return; fi
export OUROBOROS_SHELL_INTEGRATION=1

__ouroboros_precmd() {
  local exit_code=$?
  if [[ -n "$__ouroboros_cmd_executed" ]]; then
    printf '\e]633;D;%s\a' "$exit_code"
    unset __ouroboros_cmd_executed
  fi
  printf '\e]633;P;Cwd=%s\a' "$PWD"
  printf '\e]633;A\a'
}

__ouroboros_preexec() {
  printf '\e]633;E;%s\a' "$1"
  printf '\e]633;B\a'
  printf '\e]633;C\a'
  __ouroboros_cmd_executed=1
}

precmd_functions+=(__ouroboros_precmd)
preexec_functions+=(__ouroboros_preexec)
