$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$vendor = Join-Path $source 'vendor/detours'
$revision = 'e4bfd6b03e50de46b47abfbd1e46b384f0c5f833'
if (!(Test-Path -LiteralPath (Join-Path $vendor '.git'))) {
    git clone --branch v4.0.1 --depth 1 https://github.com/microsoft/Detours.git $vendor
    if ($LASTEXITCODE) { throw 'Could not obtain Microsoft Detours' }
}
if ((git -C $vendor rev-parse HEAD) -ne $revision) { throw 'Unexpected Detours revision' }
if (git -C $vendor status --porcelain) { throw 'Detours checkout must be unmodified' }
$vswhere = "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Install Visual Studio 2022 C++ tools, Windows SDK and CMake' }
$cmake = Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$build = Join-Path $source 'out/x64'
& $cmake -S $source -B $build -G 'Visual Studio 17 2022' -A x64
if ($LASTEXITCODE) { throw 'CMake configuration failed' }
& $cmake --build $build --config Release
if ($LASTEXITCODE) { throw 'Native build failed' }
$destination = Join-Path $source '../../resources/capture-compat/x64'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$files = @('aiga-capture-helper.exe', 'aiga-capture-compat.dll')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $build "Release/$file") -Destination $destination -Force }
Copy-Item -LiteralPath (Join-Path $vendor 'LICENSE.md') -Destination (Join-Path $destination 'DETOURS-LICENSE.md') -Force
$hashes = @{}
foreach ($file in $files) { $hashes[$file] = (Get-FileHash -LiteralPath (Join-Path $destination $file) -Algorithm SHA256).Hash.ToLowerInvariant() }
@{ protocol = 1; version = '1.0.0'; arch = 'x64'; detours = $revision; sha256 = $hashes } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding utf8
Write-Output "Native artifacts: $destination"
