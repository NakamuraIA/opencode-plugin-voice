# Publicar — GitHub + npm

Passo a passo para publicar o plugin `opencode-plugin-voice`.

## 0. Antes de publicar (checklist)

- [ ] `npm run build` passa
- [ ] `npm test` passa
- [ ] `npx --yes tsx tests/smoke.mjs` passa (ignora o assert de saída do libuv)
- [ ] `LICENSE` (MIT) presente
- [ ] README PT/EN atualizados
- [ ] Versão correta no `package.json` (`0.1.0`)
- [ ] Nome livre no npm: `npm view opencode-plugin-voice version` → E404 = livre
- [ ] Logado no npm: `npm whoami` → `nakamuraia`

## 1. GitHub

```powershell
cd E:\opencode-plugins\plugins\opencode-plugin-voice
git init
git add .
git commit -m "feat: voice plugin (STT + TTS) for OpenCode"
git branch -M main
```

Crie o repositório (escolha um):

```powershell
# com GitHub CLI
gh repo create NakamuraIA/opencode-plugin-voice --public --source . --push
```

ou crie no site e depois:

```powershell
git remote add origin https://github.com/NakamuraIA/opencode-plugin-voice.git
git push -u origin main
```

> O `dist/gui-experimental.cjs` é **commitado** de propósito: quem instalar via
> `opencode plugin add github:...` não roda build.

## 2. npm

```powershell
npm publish
```

- Se tiver 2FA, ele pede o código OTP.
- `prepublishOnly` roda `npm run build` antes de empacotar.
- Confira o pacote sem publicar: `npm pack --dry-run` (deve listar `src/`,
  `dist/`, `tools/`, `LICENSE`, READMEs).

Verificação:

```powershell
npm view opencode-plugin-voice version
```

## 3. Testar a instalação pública

```powershell
opencode plugin add opencode-plugin-voice
opencode plugin list
```

Depois abra **Settings → Voice**, escolha a voz e clique em **Play sample**.

## 4. Release no GitHub

```powershell
git tag v0.1.0
git push --tags
gh release create v0.1.0 --generate-notes
```

## 5. Atualizações futuras

```powershell
npm version patch   # ou minor/major
git push --follow-tags
npm publish
```

Usuários atualizam com:

```powershell
opencode plugin update opencode-plugin-voice
```

## Observações

- **Kitsune-TTS** não vai no pacote: o `tools/kitsune-local/setup.ps1` baixa o
  código e o modelo oficiais (GPL-3.0) na máquina do usuário.
- Se publicar um fork do Kitsune, cumpra a GPL-3.0 (código-fonte disponível).
- O nome `@nakamuraia/opencode-plugin-voice` também está disponível como
  alternativa com escopo, se preferir.
