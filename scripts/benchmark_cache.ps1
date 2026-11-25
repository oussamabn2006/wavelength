<#
Compares API latency with and without the Redis cache and saves the table to docs/benchmarks/redis_cache.txt.
Each request is a separate curl.exe call, so the numbers include connection setup. That adds a
constant overhead to both modes and makes the real speedup look smaller than it is.

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark_cache.ps1
#>
param(
    [int]$N = 30,
    [string]$Month = (Get-Date).ToUniversalTime().ToString("yyyy-MM")
)

$Base = "http://localhost:8000/api/v1"
$Out = "docs/benchmarks"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$inv = [Globalization.CultureInfo]::InvariantCulture

function Measure-Ms([string]$Url) {
    $s = curl.exe -s -o NUL -w '%{time_total}' $Url
    [double]::Parse($s, $inv) * 1000
}

function Get-Stats([double[]]$v) {
    $s = @($v | Sort-Object)
    [pscustomobject]@{
        Avg = [math]::Round(($v | Measure-Object -Average).Average, 2)
        P50 = [math]::Round($s[[math]::Floor(($s.Count - 1) * 0.5)], 2)
        P95 = [math]::Round($s[[math]::Ceiling(($s.Count - 1) * 0.95)], 2)
    }
}

$targets = @(
    @{ Name = "top-artists (live aggregation)"; Path = "stats/top-artists?month=$Month&limit=10" },
    @{ Name = "top-tracks";                     Path = "stats/top-tracks?month=$Month&limit=10" },
    @{ Name = "track detail (joins)";           Path = "tracks/1" }
)

Invoke-RestMethod -Method Delete -Uri "$Base/cache?reset_metrics=true" | Out-Null

$rows = @()
foreach ($t in $targets) {
    $sep = if ($t.Path.Contains("?")) { "&" } else { "?" }
    $cached = "$Base/$($t.Path)"
    $bypass = "$Base/$($t.Path)${sep}cache=false"

    Measure-Ms $bypass | Out-Null                                   # warm-up: connections, plan cache
    $b = Get-Stats (1..$N | ForEach-Object { Measure-Ms $bypass })
    Measure-Ms $cached | Out-Null                                   # first call fills the cache (MISS)
    $c = Get-Stats (1..$N | ForEach-Object { Measure-Ms $cached })  # all HITs

    $rows += [pscustomobject]@{ Endpoint = $t.Name; Mode = "no cache"; Avg_ms = $b.Avg; P50_ms = $b.P50; P95_ms = $b.P95 }
    $rows += [pscustomobject]@{ Endpoint = $t.Name; Mode = "Redis";    Avg_ms = $c.Avg; P50_ms = $c.P50; P95_ms = $c.P95 }
}

$table = $rows | Format-Table -AutoSize | Out-String
$table | Tee-Object -FilePath "$Out/redis_cache.txt"
$stats = Invoke-RestMethod "$Base/cache/stats" | ConvertTo-Json
"Cache stats after the run:`n$stats" | Tee-Object -FilePath "$Out/redis_cache.txt" -Append