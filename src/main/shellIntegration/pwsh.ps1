# Ouroboros Shell Integration for PowerShell
# Emits OSC 633 sequences for command boundary detection

if ($env:OUROBOROS_SHELL_INTEGRATION) { return }
$env:OUROBOROS_SHELL_INTEGRATION = "1"

$__ouroboros_original_prompt = $function:prompt

function prompt {
  $exitCode = $LASTEXITCODE
  if ($script:__ouroboros_cmd_executed) {
    # Emit command-finished for the previous command
    [Console]::Write("`e]633;D;$exitCode`a")

    # Emit command text (E) for the command that just ran
    $lastCmd = (Get-History -Count 1).CommandLine
    if ($lastCmd) {
      [Console]::Write("`e]633;E;$lastCmd`a")
    }

    $script:__ouroboros_cmd_executed = $false
  }
  [Console]::Write("`e]633;P;Cwd=$PWD`a")
  [Console]::Write("`e]633;A`a")

  # Call original prompt
  $result = & $__ouroboros_original_prompt

  [Console]::Write("`e]633;B`a")
  $script:__ouroboros_cmd_executed = $true
  [Console]::Write("`e]633;C`a")

  return $result
}
