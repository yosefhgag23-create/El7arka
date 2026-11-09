<#
.SYNOPSIS
  Builds the Angular UI, runs the tests, publishes the self-contained desktop app (win-x64) and packages it.

.DESCRIPTION
  Output (in .\artifacts):
    publish\El7arka\                     ready-to-run folder (El7arka.exe)
    El7arka-Setup-<version>.exe          installer with desktop shortcut (when Inno Setup 6 is installed)
    El7arka-<version>-portable-win-x64.zip  portable package (always)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File build\publish.ps1
  powershell -ExecutionPolicy Bypass -File build\publish.ps1 -SkipTests -SkipWeb
#>
param(
    [switch]$SkipWeb,
    [switch]$SkipTests,
    [string]$Runtime = 'win-x64'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifacts = Join-Path $root 'artifacts'
$publishDir = Join-Path $artifacts 'publish\El7arka'
$desktopProj = Join-Path $root 'src\Fleet.Desktop\Fleet.Desktop.csproj'

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Invoke-Checked([scriptblock]$cmd) { & $cmd; if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw '.NET SDK (dotnet) was not found. Install the .NET 10 SDK.' }

$version = ([xml](Get-Content $desktopProj)).Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
if (-not $version) { $version = '1.0.0' }
Write-Host "El7arka $version ($Runtime)"

if (-not $SkipWeb) {
    Step 'Building Angular UI'
    Push-Location (Join-Path $root 'src\Fleet.Web')
    try {
        if (-not (Test-Path 'node_modules')) { Invoke-Checked { npm ci } }
        Invoke-Checked { npx ng build --configuration production }
    }
    finally { Pop-Location }
}
if (-not (Test-Path (Join-Path $root 'src\Fleet.Api\wwwroot\index.html'))) { throw 'UI build output is missing (src\Fleet.Api\wwwroot\index.html).' }

if (-not $SkipTests) {
    Step 'Running tests'
    Invoke-Checked { dotnet test (Join-Path $root 'Fleet.slnx') -c Release --nologo }
}

Step 'Publishing desktop app'
if (Test-Path $publishDir) { Remove-Item -LiteralPath $publishDir -Recurse -Force }
Invoke-Checked {
    dotnet publish $desktopProj -c Release -r $Runtime --self-contained true -o $publishDir --nologo `
        -p:DebugType=none -p:DebugSymbols=false -p:GenerateDocumentationFile=false
}
foreach ($dev in 'appsettings.Development.json', 'Fleet.Api.exe') {
    $f = Join-Path $publishDir $dev
    if (Test-Path $f) { Remove-Item -LiteralPath $f }
}
Copy-Item (Join-Path $PSScriptRoot 'create-desktop-shortcut.cmd') (Join-Path $publishDir 'Create Desktop Shortcut.cmd')
if (-not (Test-Path (Join-Path $publishDir 'wwwroot\index.html'))) { throw 'Published output is missing wwwroot\index.html.' }

Step 'Creating portable zip'
$zip = Join-Path $artifacts "El7arka-$version-portable-$Runtime.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Freshly written files are briefly locked by antivirus scanners, so retry before giving up.
for ($try = 1; ; $try++) {
    if (Test-Path $zip) { Remove-Item -LiteralPath $zip }
    try {
        [System.IO.Compression.ZipFile]::CreateFromDirectory($publishDir, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
        break
    } catch {
        if ($try -ge 6) { throw }
        Write-Warning "Zip attempt $try failed ($($_.Exception.InnerException.Message)); retrying in 5s..."
        Start-Sleep -Seconds 5
    }
}
Write-Host "Portable: $zip"

Step 'Building installer'
$iscc = @(
    (Get-Command iscc -ErrorAction SilentlyContinue).Source,
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($iscc) {
    Invoke-Checked { & $iscc "/DAppVersion=$version" "/DSourceDir=$publishDir" "/DOutputDir=$artifacts" (Join-Path $PSScriptRoot 'installer.iss') }
    Write-Host "Installer: $(Join-Path $artifacts "El7arka-Setup-$version.exe")"
}
else {
    Write-Warning 'Inno Setup 6 not found - installer skipped. Install it (winget install JRSoftware.InnoSetup) and re-run with -SkipWeb -SkipTests.'
}

Step 'Done'
