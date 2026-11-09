param(
  [string]$InstallDir = $(if ($env:KITSUNE_HOME) { $env:KITSUNE_HOME } else { Join-Path $env:LOCALAPPDATA "KitsuneTTS" })
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

Write-Host "== Kitsune TTS - instalador local ==" -ForegroundColor Cyan
Write-Host "Destino: $InstallDir"

# 1. Python 3.10+
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
  throw "Python 3.10+ nao encontrado. Instale em https://python.org e marque 'Add python.exe to PATH'."
}
$ver = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$ver -lt [version]"3.10") {
  throw "Python $ver encontrado; precisa 3.10 ou mais novo."
}

# 2. eSpeak NG (fonemas pt-BR)
if (-not (Get-Command espeak-ng -ErrorAction SilentlyContinue)) {
  Write-Warning "eSpeak NG nao encontrado."
  Write-Warning "Baixe e instale: https://github.com/espeak-ng/espeak-ng/releases (arquivo .msi do Windows)"
  Write-Warning "Sem ele a sintese falha. Continuando a instalacao..."
}

New-Item -ItemType Directory -Force $InstallDir | Out-Null

# 3. Codigo oficial (GPL-3.0, fonte: GitHub)
$engine = Join-Path $InstallDir "engine"
if (-not (Test-Path (Join-Path $engine ".git"))) {
  Write-Host "Baixando o codigo oficial (GitHub)..."
  git clone --depth 1 https://github.com/Heitorkk2/Kitsune-TTS.git $engine
} else {
  Write-Host "Codigo oficial ja presente."
}

# 4. Ambiente Python + dependencias
$venv = Join-Path $InstallDir ".venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
  Write-Host "Criando ambiente Python..."
  python -m venv $venv
}
$vpy = Join-Path $venv "Scripts\python.exe"
Write-Host "Instalando dependencias (pode demorar alguns minutos)..."
& $vpy -m pip install --upgrade pip --quiet
Push-Location $engine
& $vpy -m pip install -e ".[onnx]" fastapi uvicorn huggingface_hub --quiet
Pop-Location

# 5. Modelo (~115 MB, fonte oficial no Hugging Face)
$modelDir = Join-Path $InstallDir "model"
New-Item -ItemType Directory -Force $modelDir | Out-Null
if (-not (Test-Path (Join-Path $modelDir "kitsune39M.onnx"))) {
  Write-Host "Baixando o modelo (~115 MB)..."
  & $vpy (Join-Path $here "download_model.py") $modelDir
} else {
  Write-Host "Modelo ja presente."
}

# 6. Runner
Copy-Item (Join-Path $here "server.py") $InstallDir -Force
Copy-Item (Join-Path $here "start_server.bat") $InstallDir -Force

Write-Host ""
Write-Host "Instalado com sucesso em: $InstallDir" -ForegroundColor Green
Write-Host "Iniciar:  $InstallDir\start_server.bat"
Write-Host "Testar:   http://127.0.0.1:8092/health"
Write-Host ""
Write-Host "No plugin (OpenCode): Settings > Voice > engine OpenAI/VoiceBox"
Write-Host "  URL:   http://127.0.0.1:8092"
Write-Host "  Model: kitsune"
Write-Host "  Voice: frieren (ou emilia, zerotwo, violet, hiro)"
