[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$path=Join-Path $PSScriptRoot 'server_state.json'
if(-not(Test-Path -LiteralPath $path)){Write-Host 'No recorded server process.';return}
$state=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$process=Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if(-not $process){Write-Host 'Server is already stopped.';return}
if($process.StartTime.ToUniversalTime().ToString('o') -ne $state.startedAt){throw 'PID was reused; refusing to stop an unrelated process.'}
if([IO.Path]::GetFileName($process.Path) -notin @('powershell.exe','pwsh.exe')){throw 'Process is not the recorded PowerShell server.'}
Stop-Process -Id $state.pid
Write-Host 'Local test server stopped.'
