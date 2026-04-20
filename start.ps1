# AIGA — Script de inicialização rápida
# Uso:
#   .\start.ps1               — limpa processos, instala deps e inicia
#   .\start.ps1 -SkipInstall  — pula o pnpm install (mais rápido após 1ª vez)

param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Write-Step([string]$msg) {
    Write-Host "`n  >> $msg" -ForegroundColor Cyan
}
function Write-Ok([string]$msg) {
    Write-Host "     OK  $msg" -ForegroundColor Green
}
function Write-Warn([string]$msg) {
    Write-Host "  AVISO  $msg" -ForegroundColor Yellow
}
function Write-Fail([string]$msg) {
    Write-Host "   ERRO  $msg" -ForegroundColor Red
}

Write-Host ""
Write-Host "  ╔═══════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║         AIGA  —  dev start         ║" -ForegroundColor Magenta
Write-Host "  ╚═══════════════════════════════════╝" -ForegroundColor Magenta

# ── 1. Node.js ───────────────────────────────────────────────────────────────
Write-Step "Verificando Node.js (>= 20.11)..."
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Node.js não encontrado. Instale em https://nodejs.org"
    exit 1
}
Write-Ok "Node.js $nodeVersion"

# ── 2. Liberar porta 5173 (Vite) ─────────────────────────────────────────────
Write-Step "Liberando porta 5173..."
$pids5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
if ($pids5173) {
    $pids5173 | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 400
    Write-Ok "Porta 5173 liberada"
} else {
    Write-Ok "Porta 5173 já estava livre"
}

# ── 3. Encerrar instâncias Electron/Vite anteriores ──────────────────────────
Write-Step "Encerrando processos anteriores (Electron)..."
Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
Write-Ok "Pronto"

# ── 4. Instalar dependências ──────────────────────────────────────────────────
if (-not $SkipInstall) {
    Write-Step "Instalando dependências (corepack pnpm install)..."
    Push-Location $Root
    corepack pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Falha no install. Tente: corepack pnpm install"
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Ok "Dependências ok"
} else {
    Write-Ok "Pulando install (-SkipInstall)"
}

# ── 5. Verificar .env ────────────────────────────────────────────────────────
Write-Step "Verificando .env..."
$envFile    = Join-Path $Root ".env"
$envExample = Join-Path $Root ".env.example"
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Warn ".env criado a partir de .env.example"
        Write-Warn "Configure GEMINI_API_KEY em .env ou via Configurações → API no app."
    } else {
        Write-Warn ".env não encontrado — configure a API key pela UI ao abrir o app."
    }
} else {
    $envContent = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
    if ($envContent -match "GEMINI_API_KEY\s*=\s*AIza") {
        Write-Ok ".env com API key configurada"
    } else {
        Write-Warn "API key não detectada no .env — configure via Configurações → API no app."
    }
}

# ── 6. Iniciar ───────────────────────────────────────────────────────────────
Write-Step "Iniciando AIGA..."
Write-Host ""
Write-Host "     Aguarde o Vite compilar e a janela do app abrir." -ForegroundColor DarkGray
Write-Host "     Ctrl+C para encerrar." -ForegroundColor DarkGray
Write-Host ""

Push-Location $Root
corepack pnpm dev
$exitCode = $LASTEXITCODE
Pop-Location

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Fail "App encerrado com código $exitCode"
    Write-Host ""
    Write-Host "  Causas comuns:" -ForegroundColor DarkGray
    Write-Host "    - Porta 5173 ocupada   → rode o script novamente (ele libera automaticamente)" -ForegroundColor DarkGray
    Write-Host "    - Atalho Ctrl+E em uso → feche outras instâncias do app e rode novamente" -ForegroundColor DarkGray
    Write-Host "    - Deps desatualizadas  → rode sem -SkipInstall" -ForegroundColor DarkGray
    exit $exitCode
}
