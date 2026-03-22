# Ouroboros Shell Integration for PowerShell
# Emits OSC 633 sequences for command boundary detection

if ($env:OUROBOROS_SHELL_INTEGRATION) { return }
$env:OUROBOROS_SHELL_INTEGRATION = "1"

$__ouroboros_original_prompt = $function:prompt
$__ouroboros_esc = [char]27
$__ouroboros_bel = [char]7
# Track whether a command has ever been executed — used to skip the
# initial startup prompt which has no prior command to mark complete.
$script:__ouroboros_cmd_executed = $false

function Write-OuroborosOsc633 {
  param([string]$Payload)
  # Use [System.Console]::Out.Write directly to stdout to avoid buffering
  # issues that can cause ESC to be printed literally instead of a control char.
  [System.Console]::Out.Write("${__ouroboros_esc}]633;$Payload${__ouroboros_bel}")
}

function prompt {
  $exitCode = $LASTEXITCODE
  if ($script:__ouroboros_cmd_executed) {
    # Emit command-finished for the previous command
    Write-OuroborosOsc633 "D;$exitCode"

    # Emit command text (E) for the command that just ran
    $lastCmd = (Get-History -Count 1).CommandLine
    if ($lastCmd) {
      Write-OuroborosOsc633 "E;$lastCmd"
    }
  }
  Write-OuroborosOsc633 "P;Cwd=$PWD"

  # Only emit A (prompt start — creates a command block) if a command was
  # previously executed. The initial startup prompt has no prior command, so
  # emitting A would create a dangling block with no matching D;N.
  if ($script:__ouroboros_cmd_executed) {
    Write-OuroborosOsc633 "A"
  }

  # Call original prompt
  $result = & $__ouroboros_original_prompt

  # Mark command start and command executed. Even on the initial prompt we
  # need to set the flag so the NEXT prompt can emit D for this command.
  Write-OuroborosOsc633 "B"
  $script:__ouroboros_cmd_executed = $true
  Write-OuroborosOsc633 "C"

  return $result
}