# setup-env.ps1 — adiciona variaveis faltantes ao .env sem sobrescrever as existentes

$envFile = Join-Path $PSScriptRoot ".." ".env"
$envFile = (Resolve-Path $envFile).Path

function Add-EnvVar($file, $key, $value) {
  $content = Get-Content $file -Raw
  if ($content -notmatch "^$key=") {
    Add-Content $file "`n$key=$value"
    Write-Host "[+] $key adicionado"
  } else {
    Write-Host "[=] $key ja existe, pulando"
  }
}

Write-Host "`n=== Setup .env ==="
Add-EnvVar $envFile "SEED_SECRET" "local123"

$openai = Read-Host "`nDigite sua OPENAI_API_KEY (ou pressione Enter para pular)"
if ($openai -ne "") {
  Add-EnvVar $envFile "OPENAI_API_KEY" $openai
} else {
  Write-Host "[!] OPENAI_API_KEY nao configurada — embed funcionara apenas em modo keyword"
}

Write-Host "`n[OK] .env atualizado. Reinicie o servidor com: npm run dev:local"
