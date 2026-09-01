$source = "g:\22 june sheba"
$destination = "g:\22 june sheba\sheba-fi-release.zip"

if (Test-Path $destination) {
    Remove-Item $destination -Force
}

$excludes = @('tools', 'private', 'tmp', 'scratch', 'debug', 'test', 'check', '.git', '.env', 'build_release.ps1', 'sheba-fi-release.zip')

$tempDir = Join-Path $env:TEMP "sheba_release_build"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$items = Get-ChildItem -Path $source -Recurse
foreach ($item in $items) {
    $relativePath = $item.FullName.Substring($source.Length + 1)
    $excludeMatch = $false
    
    foreach ($excl in $excludes) {
        # Check if the path contains the excluded folder/file name exactly
        if ($relativePath -match "(^|\\)$excl(\\|$)") {
            $excludeMatch = $true
            break
        }
    }
    
    if (-not $excludeMatch) {
        $destPath = Join-Path $tempDir $relativePath
        if ($item.PSIsContainer) {
            if (-not (Test-Path $destPath)) {
                New-Item -ItemType Directory -Force -Path $destPath | Out-Null
            }
        } else {
            $destDir = Split-Path $destPath
            if (-not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Force -Path $destDir | Out-Null
            }
            Copy-Item -Path $item.FullName -Destination $destPath -Force
        }
    }
}

Compress-Archive -Path "$tempDir\*" -DestinationPath $destination -Force
Remove-Item $tempDir -Recurse -Force
Write-Host "Release created at $destination"
