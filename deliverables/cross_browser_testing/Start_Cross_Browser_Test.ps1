# Windows PowerShell 5.1 or PowerShell 7. No Python, Node, admin rights, or browser automation required.
[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 8765,
    [string]$ExtensionPath = '',
    [hashtable]$BrowserPaths = @{},
    [switch]$InventoryOnly,
    [switch]$NoBrowserLaunch,
    [switch]$Serve
)
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
if (-not $ExtensionPath) { $ExtensionPath = Join-Path $base '../../EXTENSION' }

if ($Serve) {
    # A loopback-only, read-only server. Never expose the repository, inventories, or screenshots.
    $allowed = @{
        '/cross_browser_test_page.html' = 'text/html; charset=utf-8'
        '/cross_browser_test_form.html' = 'text/html; charset=utf-8'
        '/test_form.js' = 'text/javascript; charset=utf-8'
        '/test_definitions.json' = 'application/json; charset=utf-8'
    }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    try {
        while ($true) {
            $client = $listener.AcceptTcpClient()
            try {
                $stream = $client.GetStream(); $stream.ReadTimeout = 3000; $stream.WriteTimeout = 3000
                $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
                $line = $reader.ReadLine()
                if (-not $line) { continue }
                $parts = $line.Split(' ')
                $path = ($parts[1] -split '\?')[0]
                $headers = 0
                while ($reader.ReadLine()) { $headers++; if ($headers -gt 100) { throw 'Too many headers' } }
                $status = '200 OK'; $type = 'text/plain; charset=utf-8'
                if ($parts[0] -ne 'GET') { $status = '405 Method Not Allowed'; $bytes = [Text.Encoding]::UTF8.GetBytes('GET only') }
                elseif ($path -eq '/health') { $bytes = [Text.Encoding]::UTF8.GetBytes('CAD-CROSS-BROWSER-KIT-v1') }
                elseif ($allowed.ContainsKey($path)) {
                    $type = $allowed[$path]; $bytes = [IO.File]::ReadAllBytes((Join-Path $base $path.TrimStart('/')))
                } else { $status = '404 Not Found'; $bytes = [Text.Encoding]::UTF8.GetBytes('Not found') }
                $head = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`n`r`n")
                $stream.Write($head,0,$head.Length); $stream.Write($bytes,0,$bytes.Length)
            } catch { # A closed browser connection or timeout must not stop the server.
            } finally { $client.Dispose() }
        }
    } finally { $listener.Stop() }
    return
}

$definitions = Get-Content -LiteralPath (Join-Path $base 'test_definitions.json') -Raw | ConvertFrom-Json
$extension = (Resolve-Path -LiteralPath $ExtensionPath).Path
$manifest = Get-Content -LiteralPath (Join-Path $extension 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.manifest_version -ne 3) { throw 'The selected extension is not Manifest V3.' }
$definitionsById = @{Chrome='chrome.exe';Edge='msedge.exe';Brave='brave.exe';Opera='opera.exe'}
$relative = @{
    Chrome = @('Google/Chrome/Application/chrome.exe')
    Edge = @('Microsoft/Edge/Application/msedge.exe')
    Brave = @('BraveSoftware/Brave-Browser/Application/brave.exe')
    Opera = @('Programs/Opera/opera.exe','Opera/opera.exe','Programs/Opera/launcher.exe','Opera/launcher.exe')
}
$browsers = foreach ($browser in $definitions.browsers) {
    $candidates = [Collections.Generic.List[string]]::new()
    if ($BrowserPaths.ContainsKey($browser.id)) { $candidates.Add([string]$BrowserPaths[$browser.id]) }
    else {
        foreach ($hive in @('HKCU:\Software','HKLM:\Software','HKLM:\Software\WOW6432Node')) {
            foreach ($exeName in @($definitionsById[$browser.id])) {
                $reg = Join-Path $hive "Microsoft\Windows\CurrentVersion\App Paths\$exeName"
                if (Test-Path $reg) {
                    $value = (Get-Item $reg).GetValue('')
                    if ($value) { $candidates.Add(([string]$value).Trim('"')) }
                }
            }
        }
        foreach ($root in @($env:ProgramFiles,${env:ProgramFiles(x86)},$env:LOCALAPPDATA)) {
            if ($root) { foreach ($suffix in $relative[$browser.id]) { $candidates.Add((Join-Path $root $suffix)) } }
        }
    }
    $selected = $null
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $file = Get-Item -LiteralPath $candidate
        # Opera's launcher may have a different version. Launch the actual versioned opera.exe.
        if ($browser.id -eq 'Opera' -and $file.Name -eq 'launcher.exe') {
            $actual = @(Get-ChildItem -LiteralPath $file.DirectoryName -Directory | Where-Object Name -Match '^\d+(\.\d+)+$' |
                Sort-Object { [version]$_.Name } -Descending | ForEach-Object { Join-Path $_.FullName 'opera.exe' } |
                Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
            if ($actual.Count) { $file = Get-Item -LiteralPath $actual[0] }
            else { continue }
        }
        $selected = $file; break
    }
    [pscustomobject]@{
        id=$browser.id; name=$browser.name; installed=[bool]$selected
        executablePath=$(if($selected){$selected.FullName}else{''})
        version=$(if($selected){$selected.VersionInfo.ProductVersion}else{'Not detected'})
        fileVersion=$(if($selected){$selected.VersionInfo.FileVersion}else{'Not detected'})
        launchStatus='Not launched'; launchError=''; testStatus='Not Tested'
    }
}
$osText = [Environment]::OSVersion.VersionString
try { $os = Get-CimInstance Win32_OperatingSystem; $osText = "$($os.Caption); version $($os.Version); build $($os.BuildNumber); $($os.OSArchitecture)" } catch {}
$runId = [guid]::NewGuid().ToString()
$inventory = [pscustomobject]@{
    schemaVersion=1;runId=$runId;capturedAt=(Get-Date).ToUniversalTime().ToString('o');operatingSystem=$osText
    extensionPath=$extension;extensionVersion=$manifest.version
    extensionHashes=@(Get-ChildItem -LiteralPath $extension -File -Recurse | Sort-Object FullName | ForEach-Object {
        [pscustomobject]@{path=$_.FullName.Substring($extension.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
    })
    testUrl="http://127.0.0.1:$Port/cross_browser_test_page.html";browsers=@($browsers)
}
function Save-Inventory {
    $inventory | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $base 'browser_versions.json') -Encoding UTF8
    $inventory.browsers | Select-Object @{n='runId';e={$runId}},id,name,installed,executablePath,version,fileVersion,launchStatus,launchError,testStatus |
        Export-Csv -LiteralPath (Join-Path $base 'browser_versions.csv') -NoTypeInformation -Encoding UTF8
}
Save-Inventory
if (-not $InventoryOnly) {
    $health = "http://127.0.0.1:$Port/health"
    $ready = $false
    try { $ready = (Invoke-WebRequest $health -UseBasicParsing -TimeoutSec 2).Content -eq 'CAD-CROSS-BROWSER-KIT-v1' } catch {}
    if (-not $ready) {
        # Check availability before starting a hidden helper. Do not reuse an unrelated server.
        $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
        try { $probe.Start() } catch { throw "Port $Port is in use. Choose another with -Port 8766." } finally { $probe.Stop() }
        $shell = (Get-Process -Id $PID).Path
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Serve -Port {1}' -f $PSCommandPath,$Port
        $server = Start-Process -FilePath $shell -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $base 'server_output.log') -RedirectStandardError (Join-Path $base 'server_error.log')
        [pscustomobject]@{pid=$server.Id;port=$Port;startedAt=$server.StartTime.ToUniversalTime().ToString('o')} |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $base 'server_state.json') -Encoding UTF8
        for($i=0;$i -lt 20;$i++) {
            Start-Sleep -Milliseconds 200
            try { if((Invoke-WebRequest $health -UseBasicParsing -TimeoutSec 1).Content -eq 'CAD-CROSS-BROWSER-KIT-v1'){$ready=$true;break} } catch {}
        }
        if(-not $ready){throw 'The local server did not start. Check server_state.json or try another port.'}
    }
    if (-not $NoBrowserLaunch) {
        foreach ($browser in $inventory.browsers) {
            if (-not $browser.installed) { $browser.launchStatus='Not installed'; continue }
            try {
                $url = "$($inventory.testUrl)?browser=$($browser.id)&run=$runId"
                Start-Process -FilePath $browser.executablePath -ArgumentList @($url)
                $browser.launchStatus='Launch requested (functionality not tested)'
            } catch { $browser.launchStatus='Launch failed'; $browser.launchError=$_.Exception.Message }
        }
    }
    Save-Inventory
    Write-Host "Test page: $($inventory.testUrl)"
    Write-Host "Results form: http://127.0.0.1:$Port/cross_browser_test_form.html"
}
$inventory.browsers | Format-Table name,installed,version,launchStatus -AutoSize
Write-Host "Inventory saved to $base\browser_versions.json and browser_versions.csv"
Write-Host 'All functionality remains Not Tested. Install the unpacked extension and record observations manually.'
