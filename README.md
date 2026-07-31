# Quarta-feira — Automação WhatsApp

Automação de envio de mensagens WhatsApp usando [Baileys](https://github.com/WhiskeySockets/Baileys), com **painel web de administração** e **agendamento cron**. Tudo configurável pelo navegador, sem editar `.env` manualmente.

## Funcionalidades

- 📲 **Envio programado** de mensagens via expressão cron (fuso `America/Sao_Paulo`).
- 🖼️ Suporte a **texto, imagem, vídeo, áudio e documento** (áudio enviado como PTT/mensagem de voz).
- 🎛️ **Painel web** em `http://127.0.0.1:3001` para gerenciar destinatários, mensagem, arquivo e agendamento.
- 💾 Configuração persistida em **`data.json`** (sem precisar editar `.env`).
- 🔁 **Atualização em runtime**: mudanças feitas no painel são aplicadas no próximo disparo do scheduler, sem reiniciar o processo.
- 🔑 **Sessão persistente** do WhatsApp em `./auth/` — escaneie o QR só na primeira vez.
- 👥 Suporte a **contatos** (`55DDDNUMERO`) e **grupos** (`ID@g.us`).

## Pré-requisitos

- Node.js 18+ (testado em 22)
- Uma conta WhatsApp disponível para ser "aparelho conectado"

## Instalação

```bash
npm install
```

## Como executar

Existem três modos de execução. Escolha conforme o caso de uso.

### 1) `npm run dev` — envio único

Conecta ao WhatsApp e envia a mensagem configurada uma única vez, depois encerra.

```bash
npm run dev
```

Útil para testar a config ou disparar um envio imediato.

### 2) `npm run start:scheduled` — agendado (recomendado)

Mantém o processo vivo e dispara o envio de acordo com o cron configurado. **Abre o painel admin automaticamente**.

```bash
npm run start:scheduled
```

### 3) `npm run start:admin` — só o painel

Inicia apenas o painel web (sem conectar ao WhatsApp e sem agendar envios). Bom para editar a config sem disparar nada.

```bash
npm run start:admin
```

## Primeira execução

1. Inicie o projeto com `npm run start:scheduled` (ou `npm run dev`).
2. Se houver um `.env` válido, ele será migrado automaticamente para `data.json` na primeira execução.
3. Como ainda não há sessão, o servidor de QR code sobe em `http://127.0.0.1:3000`:
   - Abra o link no navegador
   - Escaneie o QR com o WhatsApp (Aparelhos conectados → Conectar um aparelho)
4. O **painel admin** sobe em `http://127.0.0.1:3001` (ou abra manualmente).
5. Pelo painel, cadastre destinatários, defina a mensagem, anexe o arquivo (se for mídia) e configure o cron.

A partir da segunda execução a reconexão é automática (sem QR).

## O painel admin (`http://127.0.0.1:3001`)

UI com 4 abas:

| Aba            | O que faz                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **Destinatários** | Lista contatos e grupos cadastrados. Permite adicionar (validação do formato) e remover.        |
| **Mensagem**      | Altera o **tipo** (`text`, `image`, `video`, `audio`, `document`), o **texto** e a **legenda**. |
| **Arquivo**       | Envia um arquivo (vai para `./uploads/`) ou remove o arquivo atual.                             |
| **Agendamento**   | Define a expressão cron. Validada antes de salvar; mudanças re-agendam o scheduler na hora.      |

Todas as alterações são gravadas em `data.json` instantaneamente. Se o scheduler estiver rodando, o **próximo envio já usa a nova config**.

### API REST

O painel também responde JSON em:

- `GET /api/config` — retorna a config atual
- `POST /api/recipients` — body `{ type: "contact" | "group", id: string }`
- `DELETE /api/recipients/:type/:id`
- `POST /api/message` — body `{ message?, messageType?, fileCaption? }`
- `POST /api/file` — body `{ name, mimeType, data: <base64> }`
- `DELETE /api/file`
- `POST /api/schedule` — body `{ scheduleCron: string }`
- `GET /health` — healthcheck com a config atual

## Arquivos importantes

```
.
├── data.json               # Configuração persistida (gerado na primeira execução)
├── auth/                   # Sessão do WhatsApp (NÃO versionar)
├── uploads/                # Arquivos enviados pelo painel (NÃO versionar)
├── .env                    # Apenas lido uma vez para migrar para data.json
├── src/
│   ├── config/store.ts     # Store reativa (data.json + listeners)
│   ├── admin/server.ts     # Painel web + API REST
│   ├── scheduler/          # Cron + job de envio
│   ├── whatsapp/           # Cliente Baileys e funções de envio
│   ├── index.ts            # Entry: envio único
│   ├── run-scheduled.ts    # Entry: scheduler + painel
│   └── run-admin.ts        # Entry: só o painel
```

## Variáveis de ambiente (opcionais)

O `.env` é **opcional** — o painel substitui o uso direto. Variáveis reconhecidas:

| Variável        | Padrão                | Descrição                                  |
| --------------- | --------------------- | ------------------------------------------ |
| `ADMIN_PORT`    | `3001`                | Porta do painel admin                      |
| `ADMIN_HOST`    | `127.0.0.1`           | Host do painel (localhost por segurança)   |
| `ADMIN_OPEN`    | `1`                   | `0` para não abrir o browser automaticamente |
| `ADMIN`         | `1`                   | `0` para não iniciar o painel junto        |

## Scripts npm

| Script                   | O que faz                                  |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Execução única (envia uma vez e encerra)   |
| `npm run start:scheduled`| Scheduler (envia no cron) + painel admin   |
| `npm run start:admin`    | Apenas o painel web                        |
| `npm run build`          | Compila TypeScript para `dist/`            |
| `npm start`              | Roda a versão compilada (`dist/index.js`)  |
| `npm run list:groups`    | Lista os grupos da conta WhatsApp          |
| `npm run clean:auth`     | Apaga a sessão (`./auth/`) — próximo login exigirá QR |

## Dicas

- **Primeira vez listando grupos?** Rode `npm run list:groups` para pegar os IDs e cadastrar pelo painel.
- **Saiu de um grupo ou trocou de número?** Remova do painel e cadastre o novo.
- **Quer testar o envio agora?** Edite o cron para `*/2 * * * *` (a cada 2 min) pelo painel e dispare `npm run start:scheduled`. Lembre de voltar o cron depois.
- **Sessão corrompida?** Rode `npm run clean:auth` e escaneie o QR de novo.
- **Backup da config?** Apenas copie o `data.json`.

## Aviso

Use com responsabilidade. O WhatsApp pode banir contas que fazem envios em massa. Esta ferramenta é para uso pessoal/pequenos grupos.
