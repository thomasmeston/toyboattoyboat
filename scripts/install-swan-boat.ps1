# Install Polygonal_64 Swan Boat from Downloads into client/public/models/swan-boat.glb
$ErrorActionPreference = 'Stop'
$downloads = Join-Path $env:USERPROFILE 'Downloads'
$destDir = Join-Path $PSScriptRoot '..\client\public\models' | Resolve-Path
$destGlb = Join-Path $destDir 'swan-boat.glb'

$candidates = @(
  Get-ChildItem $downloads -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'swan' -and ($_.Extension -in '.glb', '.gltf', '.zip') } |
    Sort-Object LastWriteTime -Descending
)

if (-not $candidates) {
  Write-Host "No swan*.glb/gltf/zip found in $downloads"
  Write-Host "Download from: https://sketchfab.com/3d-models/swan-boat-4005d64c3f7b44878802aca82b7e2678"
  exit 1
}

$src = $candidates[0]
Write-Host "Using $($src.FullName)"

if ($src.Extension -eq '.glb') {
  Copy-Item -Force $src.FullName $destGlb
  Write-Host "Installed $destGlb"
  exit 0
}

$tmp = Join-Path $env:TEMP ("swan-boat-" + [guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  if ($src.Extension -eq '.zip') {
    Expand-Archive -Force -Path $src.FullName -DestinationPath $tmp
  } else {
    Copy-Item $src.FullName (Join-Path $tmp $src.Name)
  }

  $glb = Get-ChildItem $tmp -Recurse -Filter '*.glb' | Select-Object -First 1
  if ($glb) {
    Copy-Item -Force $glb.FullName $destGlb
    Write-Host "Installed $destGlb from $($glb.Name)"
    exit 0
  }

  $gltf = Get-ChildItem $tmp -Recurse -Filter '*.gltf' | Select-Object -First 1
  if (-not $gltf) { throw 'No .glb or .gltf found in archive' }

  # Keep glTF folder next to a packed note — prefer user re-download as GLB.
  $packDir = Join-Path $destDir 'swan-boat-gltf'
  if (Test-Path $packDir) { Remove-Item -Recurse -Force $packDir }
  New-Item -ItemType Directory -Force -Path $packDir | Out-Null
  Copy-Item -Recurse -Force (Join-Path $gltf.DirectoryName '*') $packDir
  Write-Host "Extracted glTF to $packDir — convert/export to swan-boat.glb if needed"
  Write-Host "Tip: On Sketchfab download, pick Autodesk FBX or glTF; if a single .glb is available use that."
  exit 2
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
