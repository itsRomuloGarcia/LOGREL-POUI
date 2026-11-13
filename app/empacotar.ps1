# Gera dist\<ambiente>\logrel.app para compilar no RPO (recurso usado por FwCallApp("logrel")).
# Uso (na pasta LOGREL-main\app):
#   powershell -ExecutionPolicy Bypass -File .\empacotar.ps1 -Ambiente homologacao
#   powershell -ExecutionPolicy Bypass -File .\empacotar.ps1 -Ambiente producao
# Cada pasta dist\homologacao e dist\producao fica SO com o logrel.app (o patch
# do Protheus e gerado a partir da pasta). O build intermediario fica em dist\app.
# -Rest (opcional) troca o endereco do REST do ambiente. Vai para "restLogrel"
# do appconfig.json do pacote. O endereco que o FwCallApp informa no TOTVS Cloud
# e o do broker, nao o REST.
# O .app e um zip com UMA pasta raiz (logrel/) com o conteudo de dist\app\browser:
# o FwCallApp extrai em \http-root\app-root\ e renomeia essa pasta para
# LOGREL_ENV_<ambiente>. Arquivos soltos na raiz do zip se espalham no app-root
# e da "UnZipApp ... Falha ao renomear, FError: 161" (visto em 05/11/2026).
# Nao usar Compress-Archive do PowerShell 5.1: grava "\" nos caminhos do zip.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('homologacao', 'producao')]
    [string]$Ambiente,
    [ValidatePattern('^https?://.+/rest/?$')]
    [string]$Rest
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$restPadrao = @{
    homologacao = 'https://atmsolucoes199579.protheus.cloudtotvs.com.br:10557/rest'
    producao    = 'https://atmsolucoes199578.protheus.cloudtotvs.com.br:10407/rest'
}
if (-not $Rest) { $Rest = $restPadrao[$Ambiente] }

npx ng build --configuration production
if ($LASTEXITCODE -ne 0) { throw 'ng build falhou' }

$origem = Join-Path $PSScriptRoot 'dist\app\browser'
$pasta = Join-Path $PSScriptRoot "dist\$Ambiente"
New-Item -ItemType Directory -Force $pasta | Out-Null
$destino = Join-Path $pasta 'logrel.app'
if (Test-Path $destino) { Remove-Item $destino -Force }

# Endereco do REST so no pacote (o fonte fica vazio, para o npm start usar o proxy)
$cfgArq = Join-Path $origem 'assets\data\appConfig.json'
$cfg = Get-Content $cfgArq -Raw | ConvertFrom-Json
$cfg.restLogrel = $Rest.TrimEnd('/')
[IO.File]::WriteAllText($cfgArq, ($cfg | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

# Nomes todos em minusculo: o appserver (Linux) nao acha arquivo com maiuscula
# no nome (hash do Angular, ex. main-LTLTJV2D.js; visto em 05/11/2026 no
# U_PCPRELLIMP (PCPREL)). Renomeia e troca as referencias no html/js/css.
$trocas = @{}
Get-ChildItem $origem -Recurse -File | Where-Object { $_.Name -cne $_.Name.ToLower() } | ForEach-Object {
    $trocas[$_.Name] = $_.Name.ToLower()
    $tmp = $_.FullName + '.tmp'
    Move-Item $_.FullName $tmp
    Move-Item $tmp (Join-Path $_.DirectoryName $_.Name.ToLower())
}
if ($trocas.Count -gt 0) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    Get-ChildItem $origem -Recurse -File -Include *.html, *.js, *.css, *.json | ForEach-Object {
        $txt = [IO.File]::ReadAllText($_.FullName)
        $novo = $txt
        foreach ($k in $trocas.Keys) { $novo = $novo.Replace($k, $trocas[$k]) }
        if ($novo -cne $txt) { [IO.File]::WriteAllText($_.FullName, $novo, $utf8) }
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($destino, 'Create')
try {
    Get-ChildItem $origem -Recurse -File | ForEach-Object {
        $nome = 'logrel/' + $_.FullName.Substring($origem.Length + 1).Replace('\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $nome, 'Optimal')
    }
} finally {
    $zip.Dispose()
}
Write-Host "Gerado: $destino (restLogrel = $($Rest.TrimEnd('/')))"
$sobra = Get-ChildItem $pasta | Where-Object { $_.Name -ne 'logrel.app' }
if ($sobra) { Write-Warning "A pasta $pasta tem outros arquivos alem do logrel.app: $($sobra.Name -join ', ')" }
