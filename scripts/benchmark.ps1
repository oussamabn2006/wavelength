<#
Runs the performance tests with the native database tools and saves the raw output
in docs/benchmarks/. Run it from the project root:

    .\scripts\benchmark.ps1 -Target postgres     # psql EXPLAIN ANALYZE
    .\scripts\benchmark.ps1 -Target cassandra    # cqlsh TRACING
    .\scripts\benchmark.ps1                      # both
#>
param([ValidateSet("postgres", "cassandra", "all")][string]$Target = "all")

$Out = "docs/benchmarks"
New-Item -ItemType Directory -Force -Path $Out | Out-Null

function Invoke-Pg([string]$File, [string]$Log) {
    Write-Host ">> psql < $File"
    Get-Content $File -Raw | docker compose exec -T postgres psql -U spotify_admin -d spotify_db 2>&1 |
        Tee-Object -FilePath $Log | Out-Null
}

function Invoke-Cql([string]$File, [string]$Log) {
    Write-Host ">> cqlsh < $File"
    Get-Content $File -Raw | docker compose exec -T cassandra cqlsh --request-timeout=120 2>&1 |
        Tee-Object -FilePath $Log | Out-Null
}

if ($Target -in "postgres", "all") {
    $P = "app/sql/optimization"
    Invoke-Pg "$P/99_drop_optimizations.sql" "$Out/pg_00_reset.txt"
    Invoke-Pg "$P/01_benchmark.sql"          "$Out/pg_01_before.txt"
    Invoke-Pg "$P/02_create_indexes.sql"     "$Out/pg_02_create_indexes.txt"
    Invoke-Pg "$P/01_benchmark.sql"          "$Out/pg_03_after_indexes.txt"
    Invoke-Pg "$P/03_materialized_view.sql"  "$Out/pg_04_materialized_view.txt"
    Write-Host "`nPostgreSQL timings (each query appears twice: record the second):"
    Select-String -Path "$Out/pg_0[134]_*.txt" -Pattern "====|Execution Time"
}

if ($Target -in "cassandra", "all") {
    $C = "app/cql/optimization"
    Invoke-Cql "$C/99_drop_optimizations.cql" "$Out/cql_00_reset.txt"
    Invoke-Cql "$C/01_benchmark.cql"          "$Out/cql_01_before.txt"
    Invoke-Cql "$C/02_create_sai_index.cql"   "$Out/cql_02_create_index.txt"
    Write-Host "Waiting 30 s for the SAI index to build on existing data..."
    Start-Sleep -Seconds 30
    Invoke-Cql "$C/01_benchmark.cql"          "$Out/cql_03_after_index.txt"
    Write-Host "`nCassandra traces (the last number on each 'Request complete' line is microseconds):"
    Select-String -Path "$Out/cql_0[13]_*.txt" -Pattern "Request complete"
}