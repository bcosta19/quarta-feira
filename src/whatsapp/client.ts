import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import http from 'http';
import QRCode from 'qrcode';
import open from 'open';
import fs from 'fs/promises';

const AUTH_FOLDER = './auth';
const PORT = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const CONNECTION_TIMEOUT_MS = 300_000; // 5 minutos para dar tempo de escanear

let currentHtml = buildWaitingPage('Iniciando conexão...');
let server: http.Server | null = null;
let qrTimeout: NodeJS.Timeout | null = null;

function buildWaitingPage(message: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WhatsApp Automação</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f0f2f5;
    }
    .container {
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 500px;
    }
    h1 { color: #128c7e; margin-bottom: 0.5rem; }
    p { color: #555; font-size: 1.1rem; }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #ddd;
      border-top-color: #128c7e;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
  <meta http-equiv="refresh" content="3">
</head>
<body>
  <div class="container">
    <h1>WhatsApp Automação</h1>
    <div class="spinner"></div>
    <p>${message}</p>
  </div>
</body>
</html>
  `;
}

function buildQrPage(qrDataUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WhatsApp - Escanear QR Code</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f0f2f5;
    }
    .container {
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 450px;
    }
    h1 { color: #128c7e; }
    p { color: #555; font-size: 1.1rem; }
    img {
      width: 300px;
      height: 300px;
      margin: 20px 0;
      border: 4px solid #128c7e;
      border-radius: 12px;
    }
    .steps {
      text-align: left;
      background: #e8f5e9;
      padding: 1rem;
      border-radius: 8px;
      margin-top: 1rem;
      font-size: 0.95rem;
    }
    .steps li { margin-bottom: 0.5rem; color: #2e7d32; }
  </style>
  <meta http-equiv="refresh" content="5">
</head>
<body>
  <div class="container">
    <h1>📱 Escaneie o QR Code</h1>
    <img src="${qrDataUrl}" alt="QR Code">
    <p>Abra o WhatsApp no celular e escaneie o código acima.</p>
    <ol class="steps">
      <li>Abra o WhatsApp no celular</li>
      <li>Toque nos 3 pontos (Android) ou em "Configurações" (iPhone)</li>
      <li>Selecione "Aparelhos conectados"</li>
      <li>Toque em "Conectar um aparelho" e escaneie o QR</li>
    </ol>
  </div>
</body>
</html>
  `;
}

function buildConnectedPage(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WhatsApp - Conectado!</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #e8f5e9;
    }
    .container {
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    h1 { color: #2e7d32; }
    p { color: #555; font-size: 1.2rem; }
    .check { font-size: 64px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>Conectado com sucesso!</h1>
    <p>A automação está rodando. Você pode fechar esta aba.</p>
  </div>
</body>
</html>
  `;
}

function buildErrorPage(message: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WhatsApp - Erro</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #ffebee; }
    .container { text-align: center; background: white; padding: 2rem; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 500px; }
    h1 { color: #c62828; }
    p { color: #555; white-space: pre-wrap; }
    code { background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Erro</h1>
    <p>${message}</p>
    <p><code>npm run dev</code> para tentar novamente.</p>
  </div>
</body>
</html>
  `;
}

let serverStarted = false;

function startServer(): void {
  if (server || serverStarted) return;
  serverStarted = true;

  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(currentHtml);
  });

  server.listen(PORT, () => {
    console.log(`🌐 Servidor iniciado em http://localhost:${PORT}`);
    console.log('   Se o navegador não abrir automaticamente, acesse o link acima.\n');
    open(`http://localhost:${PORT}`).catch(() => {
      console.log('   Não foi possível abrir o navegador automaticamente.');
    });
  });
}

export function stopServer(): void {
  if (server) {
    server.close(() => {
      console.log('🌐 Servidor encerrado.');
    });
    server = null;
  }
}

export async function clearAuthFolder(): Promise<void> {
  try {
    await fs.rm(AUTH_FOLDER, { recursive: true, force: true });
    console.log('🧹 Sessão anterior removida.');
  } catch {
    // pasta não existia
  }
}

async function hasAuthSession(): Promise<boolean> {
  try {
    const files = await fs.readdir(AUTH_FOLDER);
    return files.length > 0;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectAttempt(): Promise<WASocket> {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const client = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Chrome (Linux)', '', ''],
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 15_000,
  });

  return new Promise((resolve, reject) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.end(undefined);
        reject(new Error('TIMEOUT'));
      }
    }, CONNECTION_TIMEOUT_MS);

    const cleanup = (client?: WASocket, error?: Error): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      if (qrTimeout) clearTimeout(qrTimeout);

      if (error) {
        client?.end(undefined as any);
        reject(error);
      } else if (client) {
        resolve(client);
      }
    };

    client.ev.on('creds.update', saveCreds);

    client.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

      console.log('📡 connection.update:', {
        connection,
        hasQr: !!qr,
        statusCode,
      });

      if (qr) {
        startServer();
        console.log('\n📱 Novo QR Code gerado. Escaneie pelo navegador.');
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
        currentHtml = buildQrPage(qrDataUrl);

        if (qrTimeout) clearTimeout(qrTimeout);
        qrTimeout = setTimeout(() => {
          console.log('\n⏱️ QR Code antigo expirou. Aguardando novo...');
        }, 45_000);
      }

      if (connection === 'open') {
        console.log('✅ Conectado ao WhatsApp!\n');
        currentHtml = buildConnectedPage();
        setTimeout(() => stopServer(), 5000);
        cleanup(client);
      }

      if (connection === 'close') {
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log(`⚠️ Conexão fechada (código ${statusCode}). Reiniciando conexão...`);
          cleanup(undefined, new Error('RESTART_REQUIRED'));
        } else {
          console.log('❌ Desconectado (logout).');
          cleanup(undefined, new Error('LOGOUT'));
        }
      }
    });
  });
}

export async function createWhatsAppClient(): Promise<WASocket> {
  const hasSession = await hasAuthSession();
  if (hasSession) {
    console.log('🔑 Sessão anterior encontrada. Reconectando sem QR Code...\n');
  } else {
    console.log('🆕 Nenhuma sessão encontrada. Será necessário escanear o QR Code.\n');
  }

  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    console.log(`\n🔌 Tentativa de conexão ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);

    try {
      const client = await connectAttempt();
      return client;
    } catch (error) {
      const err = error as Error;

      if (err.message === 'LOGOUT') {
        stopServer();
        throw new Error('Logout realizado. Apague a pasta auth/ e tente novamente.');
      }

      if (err.message === 'TIMEOUT') {
        stopServer();
        throw new Error(
          `Tempo limite de ${CONNECTION_TIMEOUT_MS / 1000}s excedido. ` +
            'Verifique sua internet e se o QR Code foi escaneado a tempo.'
        );
      }

      if (err.message === 'RESTART_REQUIRED' && attempt < MAX_RECONNECT_ATTEMPTS) {
        console.log('   Aguardando 3s antes de reconectar...');
        await sleep(3000);
        continue;
      }

      stopServer();
      throw err;
    }
  }

  stopServer();
  throw new Error('Número máximo de tentativas de conexão excedido.');
}
