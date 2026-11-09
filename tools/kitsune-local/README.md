# Kitsune TTS — instalador local (1 clique)

Roda o **Kitsune-TTS oficial** (Heitorkk2, Everteson e Nakamura) na sua máquina e
expõe uma **API local compatível com OpenAI**, pronta para o plugin de voz do
OpenCode.

Nada é hospedado na nuvem: o áudio é gerado no seu PC.

## Requisitos

- Windows 10/11
- **Python 3.10+** (marque "Add python.exe to PATH" na instalação)
- **eSpeak NG** — https://github.com/espeak-ng/espeak-ng/releases (arquivo `.msi`)
- ~500 MB de disco
- Internet **só na primeira vez** (código + modelo)

## Instalar

No PowerShell, dentro desta pasta:

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

Ou clique com o botão direito no `setup.ps1` → **Executar com PowerShell**.

Instala em `%LOCALAPPDATA%\KitsuneTTS`. Para escolher outro lugar:

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1 -InstallDir D:\KitsuneTTS
```

## Iniciar

```text
%LOCALAPPDATA%\KitsuneTTS\start_server.bat
```

Deixe a janela aberta. O servidor sobe em `http://127.0.0.1:8092`.

## Testar

Abra no navegador:

```text
http://127.0.0.1:8092/health
```

Deve responder com `ok: true` e as 5 vozes.

Ou gere um WAV pela linha de comando:

```powershell
curl -X POST http://127.0.0.1:8092/v1/audio/speech `
  -H "Content-Type: application/json" `
  -d '{\"input\":\"Ola! Eu sou a Frieren.\",\"voice\":\"frieren\"}' `
  -o teste.wav
```

## Usar no plugin (OpenCode)

Settings → Voice:

| Campo | Valor |
|---|---|
| Engine | **OpenAI / VoiceBox** |
| URL | `http://127.0.0.1:8092` |
| Model | `kitsune` |
| Voice | `frieren` (ou `emilia`, `zerotwo`, `violet`, `hiro`) |
| Instructions | (vazio) |

## Vozes

| ID | Persona | Estilo |
|---|---|---|
| `emilia` | Emilia | suave e doce |
| `frieren` | Frieren | calma e serena |
| `zerotwo` | Zero Two | energética e brincalhona |
| `violet` | Violet | formal e expressiva |
| `hiro` | Hiro | masculina, jovem e calma |

## Opções (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `KITSUNE_PORT` | `8092` | porta do servidor |
| `KITSUNE_API_KEY` | vazio | exige `Authorization: Bearer <chave>` |
| `KITSUNE_MAX_CHARS` | `1500` | limite de texto por requisição |
| `KITSUNE_MODEL` | `%LOCALAPPDATA%\KitsuneTTS\model\kitsune39M.onnx` | caminho do modelo |

## Problemas comuns

- **"eSpeak não encontrado"** → instale o eSpeak NG e reabra o terminal.
- **Porta ocupada** → rode com `set KITSUNE_PORT=8093` antes do `start_server.bat` e mude a URL no plugin.
- **Modelo não baixa** → defina `HF_TOKEN` (limite de download do HF) ou baixe manualmente em https://huggingface.co/Heitorkk2/Kitsune-TTS-V1 e coloque em `model\`.
- **Antivírus** → permita o `python.exe` do `.venv` e o `start_server.bat`.

## Licenças

- **Scripts deste pacote**: MIT.
- **Kitsune-TTS (código e pesos)**: GPL-3.0 — © Heitorkk2, Everteson, Nakamura.
  Baixados da fonte oficial (GitHub + Hugging Face); não são redistribuídos aqui.
- **eSpeak NG**: GPL-3.0.
