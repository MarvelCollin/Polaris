$ErrorActionPreference = 'Stop'

$prepend = @()

if (-not (Get-Command cp.exe -ErrorAction SilentlyContinue)) {
    $gitBin = 'C:\Program Files\Git\usr\bin'
    if (-not (Test-Path (Join-Path $gitBin 'cp.exe'))) {
        throw "cp.exe not found. Install Git for Windows, or add its usr\bin to PATH."
    }
    $prepend += $gitBin
}

if (-not (Get-Command cmake.exe -ErrorAction SilentlyContinue)) {
    $cmake = Get-ChildItem 'C:\Program Files*\Microsoft Visual Studio\*\*\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $cmake) {
        throw "cmake.exe not found. Install CMake, or the C++ CMake tools workload in Visual Studio."
    }
    $prepend += $cmake.Directory.FullName
}

if ($prepend.Count -gt 0) {
    $env:PATH = ($prepend -join ';') + ';' + $env:PATH
    Write-Host "PATH += $($prepend -join '; ')"
}

pnpm tauri dev @args
