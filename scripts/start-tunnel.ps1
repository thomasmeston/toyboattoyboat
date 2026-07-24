# Expose local ToyBoatToyBoat server (port 3005) via Cloudflare quick tunnel.
# Requires: cloudflared (winget install Cloudflare.cloudflared)
# Keep this window open while friends play. The URL changes each run.

$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
  [System.Environment]::GetEnvironmentVariable('Path', 'User')

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Error 'cloudflared not found. Install with: winget install Cloudflare.cloudflared'
}

$listening = Get-NetTCPConnection -LocalPort 3005 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Warning 'Nothing is listening on port 3005. Start the game first: npm run dev'
}

Write-Host 'Starting Cloudflare quick tunnel → http://localhost:3005'
Write-Host 'Copy the https://….trycloudflare.com URL into the game (Multiplayer server) or open:'
Write-Host '  https://thomasmeston.github.io/toyboattoyboat/?server=YOUR_TUNNEL_URL'
Write-Host ''

cloudflared tunnel --url http://localhost:3005
