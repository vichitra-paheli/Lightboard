<#
.SYNOPSIS
    Temporarily disables Chrome/Brave extensions that interfere with browser automation testing.

.DESCRIPTION
    Password managers, ad blockers, and autofill extensions intercept form interactions
    and steal focus from the page, causing "Cannot access chrome-extension:// URL" errors
    in browser automation tools like claude-in-chrome.

    This script renames the Extensions directory so the browser launches clean,
    then restores it when testing is complete.

.PARAMETER Browser
    Which browser to target: "chrome" or "brave" (default: chrome)

.PARAMETER Action
    "disable" to rename Extensions dir, "restore" to bring it back

.EXAMPLE
    # Before testing:
    .\scripts\disable-extensions-for-testing.ps1 -Browser chrome -Action disable

    # After testing:
    .\scripts\disable-extensions-for-testing.ps1 -Browser chrome -Action restore
#>

param(
    [ValidateSet("chrome", "brave")]
    [string]$Browser = "chrome",

    [ValidateSet("disable", "restore")]
    [string]$Action = "disable"
)

$paths = @{
    "chrome" = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Extensions"
    "brave"  = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Extensions"
}

$extPath = $paths[$Browser]
$backupPath = "${extPath}_disabled_for_testing"

if ($Action -eq "disable") {
    if (Test-Path $extPath) {
        if (Test-Path $backupPath) {
            Write-Host "Extensions already disabled for $Browser (backup exists)." -ForegroundColor Yellow
            return
        }

        # Check if browser is running
        $processName = if ($Browser -eq "chrome") { "chrome" } else { "brave" }
        $running = Get-Process -Name $processName -ErrorAction SilentlyContinue
        if ($running) {
            Write-Host "WARNING: Close $Browser before disabling extensions." -ForegroundColor Red
            Write-Host "Run: taskkill /F /IM ${processName}.exe" -ForegroundColor Yellow
            return
        }

        Rename-Item -Path $extPath -NewName "Extensions_disabled_for_testing"
        New-Item -ItemType Directory -Path $extPath | Out-Null
        Write-Host "Extensions disabled for $Browser." -ForegroundColor Green
        Write-Host "Backup at: $backupPath" -ForegroundColor Gray
        Write-Host "Run with -Action restore when done testing." -ForegroundColor Gray
    } else {
        Write-Host "Extensions directory not found: $extPath" -ForegroundColor Red
    }
}
elseif ($Action -eq "restore") {
    if (Test-Path $backupPath) {
        # Check if browser is running
        $processName = if ($Browser -eq "chrome") { "chrome" } else { "brave" }
        $running = Get-Process -Name $processName -ErrorAction SilentlyContinue
        if ($running) {
            Write-Host "WARNING: Close $Browser before restoring extensions." -ForegroundColor Red
            Write-Host "Run: taskkill /F /IM ${processName}.exe" -ForegroundColor Yellow
            return
        }

        # Remove the empty placeholder
        if (Test-Path $extPath) {
            Remove-Item -Path $extPath -Recurse -Force
        }
        Rename-Item -Path $backupPath -NewName "Extensions"
        Write-Host "Extensions restored for $Browser." -ForegroundColor Green
    } else {
        Write-Host "No backup found. Extensions were not disabled or already restored." -ForegroundColor Yellow
    }
}
