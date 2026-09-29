# Prosperity WhatsApp Web Agent

Agente local do CRM Prosperity para abrir uma sessão persistente do WhatsApp Web, listar os grupos visíveis na conta e preparar mensagens para confirmação do operador.

## Requisitos

- Node.js 20 ou superior
- Windows, macOS ou Linux com ambiente gráfico
- Uma sessão do WhatsApp que possa ser conectada ao WhatsApp Web

## Instalação

No diretório deste agente:

```bash
npm install
npx playwright install chromium
npm start
```

O terminal exibirá:

- o endereço local do agente (por padrão `http://127.0.0.1:3784`);
- um token local de autenticação.

No CRM, abra **WhatsApp Web local**, cole esse token e clique em **Abrir WhatsApp Web**. Na primeira execução, faça a leitura do QR Code no navegador aberto pelo agente.

## Dados locais

O agente cria a pasta `.data/`:

- `.data/agent-token.txt`: token usado pelo CRM para falar com o agente;
- `.data/whatsapp-profile/`: perfil persistente do Chromium e sessão do WhatsApp Web.

Esses arquivos não devem ser enviados ao Git.

## Origens permitidas

Por padrão:

- `https://crmprosperity.com`
- `https://www.crmprosperity.com`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Para alterar:

### Windows PowerShell

```powershell
$env:CRM_ORIGINS="https://www.crmprosperity.com,http://localhost:3000"
npm start
```

### macOS/Linux

```bash
CRM_ORIGINS="https://www.crmprosperity.com,http://localhost:3000" npm start
```

A porta também pode ser definida por `PORT`.

## Fluxo

1. O agente abre um Chromium persistente.
2. O operador conecta o WhatsApp Web.
3. O CRM solicita a leitura da aba **Grupos**.
4. O operador seleciona os grupos e escreve a mensagem no CRM.
5. O agente abre o grupo e preenche a mensagem.
6. O CRM exige **Confirmar envio e avançar**.
7. O agente envia a mensagem e prepara o próximo grupo.

O agente não utiliza stealth, alteração de fingerprint, proxy rotativo, movimentos artificiais do mouse ou temporizações aleatórias para contornar mecanismos da plataforma.

## Endpoints locais

- `GET /status`
- `POST /browser/start`
- `POST /browser/close`
- `GET /groups`
- `POST /messages/prepare`
- `POST /messages/send`
- `POST /messages/cancel`

Todas as rotas, exceto o preflight CORS, exigem o cabeçalho `X-Prosperity-Agent-Token`.
