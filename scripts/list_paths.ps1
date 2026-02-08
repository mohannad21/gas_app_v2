param(
  [string]$OutFile = "",
  [switch]$IncludeHidden
)

$repoRoot = Resolve-Path -Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Error "git not found in PATH. Install git or run from Git Bash." 
  exit 1
}

# -c: cached, -o: others (untracked), --exclude-standard: respects .gitignore + .git/info/exclude + global
$paths = git ls-files -co --exclude-standard

if (-not $IncludeHidden) {
  $paths = $paths | Where-Object { $_ -notmatch "(^|/)(\.|\.git/)" }
}

if ($OutFile) {
  $paths | Set-Content -Path $OutFile
  Write-Host "Wrote $(($paths | Measure-Object).Count) paths to $OutFile"
} else {
  $paths
}
