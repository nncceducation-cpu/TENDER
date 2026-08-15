<#
  TENDER setup for Windows.

  Installs Node.js if it is missing, restores dependencies, stages the on-device
  model assets, runs the checks, and starts the development server.

  Run from PowerShell in the repository root:

      .\setup.ps1

  If PowerShell refuses to run it, allow local scripts for this session only:

      Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host ''
Write-Host 'TENDER setup' -ForegroundColor Cyan
Write-Host '------------'

if (-not (Test-Command node)) {
  Write-Host 'Node.js not found. Installing the LTS build via winget.' -ForegroundColor Yellow

  if (-not (Test-Command winget)) {
    Write-Host ''
    Write-Host 'winget is unavailable on this machine.' -ForegroundColor Red
    Write-Host 'Install Node.js LTS manually from https://nodejs.org, then close this'
    Write-Host 'window, open a new PowerShell, and run .\setup.ps1 again.'
    exit 1
  }

  winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

  # winget updates the machine PATH, but this process inherited the old one.
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [System.Environment]::GetEnvironmentVariable('Path', 'User')

  if (-not (Test-Command node)) {
    Write-Host ''
    Write-Host 'Node.js installed, but this window still cannot see it.' -ForegroundColor Yellow
    Write-Host 'Close PowerShell, open a new one, and run .\setup.ps1 again.'
    exit 0
  }
}

Write-Host ("Node  {0}" -f (node --version))
Write-Host ("npm   {0}" -f (npm --version))
Write-Host ''

Write-Host 'Installing dependencies. This takes a minute or two.' -ForegroundColor Cyan
npm install

Write-Host ''
Write-Host 'Staging on-device model assets.' -ForegroundColor Cyan
npm run fetch:models

Write-Host ''
Write-Host 'Running checks: typecheck, lint, tests, production build.' -ForegroundColor Cyan
npm run verify

Write-Host ''
Write-Host 'Starting the development server.' -ForegroundColor Green
Write-Host 'Open http://localhost:5173 in Chrome. Press Ctrl+C here to stop it.'
Write-Host ''
npm run dev
