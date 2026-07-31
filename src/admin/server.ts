import http from 'http';
import path from 'path';
import fs from 'fs';
import open from 'open';
import {
  AppConfig,
  RecipientType,
  messageTypes,
  getConfig,
  getUploadsDir,
  addRecipient,
  removeRecipient,
  setMessage,
  setMessageType,
  setFileCaption,
  setScheduleCron,
  saveUploadedFile,
  clearUploadedFile,
  MessageType,
} from '../config/store';

const DEFAULT_PORT = Number(process.env.ADMIN_PORT) || 3001;
const HOST = process.env.ADMIN_HOST || '127.0.0.1';

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendText(res: http.ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(new Error(`JSON inválido: ${(err as Error).message}`));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeId(raw: unknown, type: RecipientType): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('ID não pode ser vazio');
  }
  const id = raw.trim();
  if (type === 'contact') {
    const clean = id.replace(/\D/g, '');
    if (!/^55\d{10,11}$/.test(clean)) {
      throw new Error('Contato deve estar no formato 55DDDNUMERO (ex: 5521999999999)');
    }
    return clean;
  }
  return id.includes('@') ? id : `${id}@g.us`;
}

const UI_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>WhatsApp Automação — Painel</title>
<style>
  :root {
    --bg: #f0f2f5;
    --card: #ffffff;
    --primary: #128c7e;
    --primary-dark: #0f7a6e;
    --danger: #c62828;
    --muted: #6b7280;
    --border: #e5e7eb;
    --success: #2e7d32;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: #111;
  }
  header {
    background: var(--primary);
    color: white;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  header h1 { margin: 0; font-size: 1.2rem; }
  header .status { font-size: 0.9rem; opacity: 0.9; }
  main { max-width: 880px; margin: 1.5rem auto; padding: 0 1rem 3rem; }
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1rem;
    background: var(--card);
    border-radius: 12px;
    padding: 0.25rem;
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
  }
  .tab {
    flex: 1;
    text-align: center;
    padding: 0.6rem;
    border-radius: 8px;
    cursor: pointer;
    color: var(--muted);
    font-weight: 500;
    user-select: none;
  }
  .tab.active { background: var(--primary); color: white; }
  .card {
    background: var(--card);
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    margin-bottom: 1rem;
  }
  .card h2 { margin: 0 0 0.75rem; font-size: 1.05rem; color: #1f2937; }
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .list { list-style: none; padding: 0; margin: 0 0 0.75rem; }
  .list li {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.55rem 0.75rem; border: 1px solid var(--border); border-radius: 8px;
    margin-bottom: 0.4rem; background: #fafafa;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92rem;
  }
  .list .tag {
    font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 999px;
    background: #e0f2f1; color: var(--primary-dark); margin-right: 0.5rem;
    text-transform: uppercase; font-weight: 600;
  }
  input[type="text"], input[type="file"], textarea, select {
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.95rem;
    font-family: inherit;
    background: white;
  }
  textarea { min-height: 100px; resize: vertical; }
  label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.25rem; }
  button {
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.55rem 1rem;
    font-size: 0.95rem;
    cursor: pointer;
    font-weight: 500;
  }
  button:hover { background: var(--primary-dark); }
  button.danger { background: var(--danger); }
  button.danger:hover { background: #a02020; }
  button.ghost {
    background: transparent; color: var(--primary); border: 1px solid var(--primary);
  }
  button.ghost:hover { background: #e0f2f1; }
  .field { margin-bottom: 0.85rem; }
  .file-info {
    background: #f3f4f6; border: 1px dashed #cbd5e1; padding: 0.75rem;
    border-radius: 8px; margin-bottom: 0.75rem; font-family: ui-monospace, monospace;
    font-size: 0.9rem; word-break: break-all;
  }
  .toast {
    position: fixed; right: 1rem; bottom: 1rem; background: #1f2937; color: white;
    padding: 0.75rem 1rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    opacity: 0; transition: opacity 0.2s ease; pointer-events: none;
  }
  .toast.show { opacity: 1; }
  .toast.error { background: var(--danger); }
  .toast.success { background: var(--success); }
  .hidden { display: none; }
  .help { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
</style>
</head>
<body>
<header>
  <h1>📲 WhatsApp Automação</h1>
  <span class="status" id="status">carregando…</span>
</header>
<main>
  <div class="tabs">
    <div class="tab active" data-tab="recipients">Destinatários</div>
    <div class="tab" data-tab="message">Mensagem</div>
    <div class="tab" data-tab="file">Arquivo</div>
    <div class="tab" data-tab="schedule">Agendamento</div>
  </div>

  <section class="card" id="tab-recipients">
    <h2>Destinatários</h2>
    <ul class="list" id="recipients-list"></ul>

    <div class="field">
      <label for="new-contact">Adicionar contato (somente números, com DDD e DDI 55)</label>
      <div class="row">
        <input type="text" id="new-contact" placeholder="5521999999999">
        <button id="add-contact-btn">+ Contato</button>
      </div>
    </div>

    <div class="field">
      <label for="new-group">Adicionar grupo (ID do grupo, com ou sem <code>@g.us</code>)</label>
      <div class="row">
        <input type="text" id="new-group" placeholder="120363@g.us">
        <button id="add-group-btn">+ Grupo</button>
      </div>
    </div>
  </section>

  <section class="card hidden" id="tab-message">
    <h2>Mensagem</h2>
    <div class="field">
      <label for="message-type">Tipo</label>
      <select id="message-type"></select>
    </div>
    <div class="field">
      <label for="message-text">Texto (usado quando tipo = <code>text</code>)</label>
      <textarea id="message-text" placeholder="Olá! Teste de automação 🤖"></textarea>
    </div>
    <div class="field">
      <label for="message-caption">Legenda (imagem / vídeo / documento)</label>
      <textarea id="message-caption" placeholder="Legenda opcional"></textarea>
    </div>
    <div class="row">
      <button id="save-message-btn">Salvar mensagem</button>
    </div>
  </section>

  <section class="card hidden" id="tab-file">
    <h2>Arquivo a enviar</h2>
    <div class="file-info" id="file-info">Nenhum arquivo anexado.</div>
    <div class="field">
      <label for="file-input">Selecionar novo arquivo (imagem, vídeo, áudio, documento)</label>
      <input type="file" id="file-input">
    </div>
    <div class="row">
      <button id="upload-btn">Enviar arquivo</button>
      <button class="danger" id="clear-file-btn">Remover arquivo</button>
    </div>
    <p class="help">O arquivo é salvo em <code>./uploads/</code> e o caminho é persistido em <code>data.json</code>.</p>
  </section>

  <section class="card hidden" id="tab-schedule">
    <h2>Agendamento (cron)</h2>
    <div class="field">
      <label for="cron-input">Expressão cron (fuso America/Sao_Paulo)</label>
      <input type="text" id="cron-input" placeholder="0 16 * * 3">
      <p class="help">Exemplos: <code>0 9 * * 1</code> (segunda 9h), <code>0 16 * * 3</code> (quarta 16h), <code>*/5 * * * *</code> (a cada 5 min).</p>
    </div>
    <div class="row">
      <button id="save-cron-btn">Salvar agendamento</button>
    </div>
    <p class="help" id="schedule-info"></p>
  </section>
</main>

<div class="toast" id="toast"></div>

<script>
const TYPES = ${JSON.stringify(messageTypes)};
const $ = (id) => document.getElementById(id);
const toast = $('toast');
let toastTimer = null;
function showToast(msg, type) {
  toast.textContent = msg;
  toast.className = 'toast show ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast ' + (type || ''); }, 2500);
}

function setActiveTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  ['recipients', 'message', 'file', 'schedule'].forEach((n) => {
    $('tab-' + n).classList.toggle('hidden', n !== name);
  });
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => setActiveTab(t.dataset.tab));
});

async function api(path, opts) {
  const res = await fetch(path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && data.error) || ('HTTP ' + res.status);
    throw new Error(msg);
  }
  return data;
}

function renderRecipients(list) {
  const ul = $('recipients-list');
  ul.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.style.justifyContent = 'center';
    li.style.color = 'var(--muted)';
    li.textContent = 'Nenhum destinatário cadastrado.';
    ul.appendChild(li);
    return;
  }
  list.forEach((r) => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = r.type === 'group' ? 'grupo' : 'contato';
    left.appendChild(tag);
    left.appendChild(document.createTextNode(r.id));
    const btn = document.createElement('button');
    btn.className = 'danger';
    btn.textContent = 'Remover';
    btn.onclick = async () => {
      try {
        await api('/api/recipients/' + encodeURIComponent(r.type) + '/' + encodeURIComponent(r.id), { method: 'DELETE' });
        showToast('Removido', 'success');
        await refresh();
      } catch (e) { showToast(e.message, 'error'); }
    };
    li.appendChild(left);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function renderMessage(cfg) {
  const sel = $('message-type');
  sel.innerHTML = '';
  TYPES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    if (t === cfg.messageType) opt.selected = true;
    sel.appendChild(opt);
  });
  $('message-text').value = cfg.message || '';
  $('message-caption').value = cfg.fileCaption || '';
}

function renderFile(cfg) {
  $('file-info').textContent = cfg.filePath ? ('📎 ' + cfg.filePath) : 'Nenhum arquivo anexado.';
}

function renderSchedule(cfg) {
  $('cron-input').value = cfg.scheduleCron || '';
  $('schedule-info').textContent = 'Recipientes atuais: ' + (cfg.recipients || []).length + ' · Tipo: ' + cfg.messageType;
}

async function refresh() {
  try {
    const cfg = await api('/api/config', { method: 'GET' });
    $('status').textContent = 'conectado · ' + cfg.recipients.length + ' destinatário(s)';
    renderRecipients(cfg.recipients);
    renderMessage(cfg);
    renderFile(cfg);
    renderSchedule(cfg);
  } catch (e) {
    $('status').textContent = 'erro ao carregar';
    showToast(e.message, 'error');
  }
}

$('add-contact-btn').onclick = async () => {
  const id = $('new-contact').value;
  try {
    await api('/api/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'contact', id }),
    });
    $('new-contact').value = '';
    showToast('Contato adicionado', 'success');
    await refresh();
  } catch (e) { showToast(e.message, 'error'); }
};

$('add-group-btn').onclick = async () => {
  const id = $('new-group').value;
  try {
    await api('/api/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'group', id }),
    });
    $('new-group').value = '';
    showToast('Grupo adicionado', 'success');
    await refresh();
  } catch (e) { showToast(e.message, 'error'); }
};

$('save-message-btn').onclick = async () => {
  try {
    await api('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageType: $('message-type').value,
        message: $('message-text').value,
        fileCaption: $('message-caption').value,
      }),
    });
    showToast('Mensagem salva', 'success');
    await refresh();
  } catch (e) { showToast(e.message, 'error'); }
};

$('upload-btn').onclick = async () => {
  const file = $('file-input').files[0];
  if (!file) { showToast('Selecione um arquivo', 'error'); return; }
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const commaIdx = dataUrl.indexOf(',');
  const base64 = dataUrl.slice(commaIdx + 1);
  try {
    await api('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, mimeType: file.type, data: base64 }),
    });
    $('file-input').value = '';
    showToast('Arquivo enviado', 'success');
    await refresh();
  } catch (e) { showToast(e.message, 'error'); }
};

$('clear-file-btn').onclick = async () => {
  try {
    await api('/api/file', { method: 'DELETE' });
    showToast('Arquivo removido', 'success');
    await refresh();
  } catch (e) { showToast(e.message, 'error'); }
};

$('save-cron-btn').onclick = async () => {
  try {
    await api('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleCron: $('cron-input').value.trim() }),
    });
    showToast('Agendamento salvo', 'success');
    await refresh();
  } catch (e) { showToast(e.message, 'error'); }
};

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;

type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  match: RegExpMatchArray | null
) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}

const routes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/api\/config$/,
    handler: (_req, res) => {
      const cfg = getConfig();
      sendJson(res, 200, {
        recipients: cfg.recipients,
        message: cfg.message,
        messageType: cfg.messageType,
        filePath: cfg.filePath,
        fileCaption: cfg.fileCaption,
        scheduleCron: cfg.scheduleCron,
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/recipients$/,
    handler: async (req, res) => {
      try {
        const body = await readJsonBody<{ type: string; id: string }>(req);
        if (body.type !== 'contact' && body.type !== 'group') {
          sendJson(res, 400, { error: "type deve ser 'contact' ou 'group'" });
          return;
        }
        const id = sanitizeId(body.id, body.type);
        const cfg = addRecipient({ type: body.type, id });
        sendJson(res, 201, { recipients: cfg.recipients });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/recipients\/([^/]+)\/(.+)$/,
    handler: (_req, res, match) => {
      try {
        const type = decodeURIComponent(match![1]) as RecipientType;
        const id = decodeURIComponent(match![2]);
        if (type !== 'contact' && type !== 'group') {
          sendJson(res, 400, { error: "type deve ser 'contact' ou 'group'" });
          return;
        }
        const cfg = removeRecipient(type, id);
        sendJson(res, 200, { recipients: cfg.recipients });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/message$/,
    handler: async (req, res) => {
      try {
        const body = await readJsonBody<{
          messageType?: string;
          message?: string;
          fileCaption?: string;
        }>(req);
        const updates: Partial<AppConfig> = {};
        if (typeof body.message === 'string') updates.message = body.message;
        if (typeof body.fileCaption === 'string') updates.fileCaption = body.fileCaption;
        if (typeof body.messageType === 'string') {
          if (!messageTypes.includes(body.messageType as MessageType)) {
            sendJson(res, 400, { error: `messageType inválido: ${body.messageType}` });
            return;
          }
          updates.messageType = body.messageType as MessageType;
        }
        if (Object.keys(updates).length === 0) {
          sendJson(res, 400, { error: 'Nada para atualizar' });
          return;
        }
        const cfg = { ...getConfig(), ...updates };
        if (typeof body.message === 'string') setMessage(body.message);
        if (typeof body.fileCaption === 'string') setFileCaption(body.fileCaption);
        if (typeof body.messageType === 'string') {
          setMessageType(body.messageType as MessageType);
        }
        sendJson(res, 200, { config: getConfig(), updated: updates });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/file$/,
    handler: async (req, res) => {
      try {
        const body = await readJsonBody<{ name: string; mimeType?: string; data: string }>(req);
        if (!body.name || typeof body.data !== 'string') {
          sendJson(res, 400, { error: 'name e data (base64) são obrigatórios' });
          return;
        }
        const buffer = Buffer.from(body.data, 'base64');
        if (!buffer.length) {
          sendJson(res, 400, { error: 'Arquivo vazio' });
          return;
        }
        const filePath = saveUploadedFile(body.name, buffer);
        const cfg = getConfig();
        sendJson(res, 201, { filePath, messageType: cfg.messageType });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/file$/,
    handler: (_req, res) => {
      try {
        clearUploadedFile();
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/schedule$/,
    handler: async (req, res) => {
      try {
        const body = await readJsonBody<{ scheduleCron: string }>(req);
        if (!body.scheduleCron || !body.scheduleCron.trim()) {
          sendJson(res, 400, { error: 'scheduleCron é obrigatório' });
          return;
        }
        const cron = await import('node-cron');
        if (!cron.validate(body.scheduleCron.trim())) {
          sendJson(res, 400, { error: `Expressão cron inválida: ${body.scheduleCron}` });
          return;
        }
        const cfg = setScheduleCron(body.scheduleCron.trim());
        sendJson(res, 200, { scheduleCron: cfg.scheduleCron });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/$/,
    handler: (_req, res) => {
      sendText(res, 200, UI_HTML, 'text/html; charset=utf-8');
    },
  },
  {
    method: 'GET',
    pattern: /^\/health$/,
    handler: (_req, res) => {
      sendJson(res, 200, { ok: true, config: getConfig() });
    },
  },
];

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const pathOnly = url.split('?')[0];

  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathOnly.match(route.pattern);
    if (match) {
      Promise.resolve()
        .then(() => route.handler(req, res, match))
        .catch((err) => {
          console.error('Erro no handler:', err);
          if (!res.headersSent) {
            sendJson(res, 500, { error: (err as Error).message });
          }
        });
      return;
    }
  }

  sendJson(res, 404, { error: `Rota não encontrada: ${method} ${pathOnly}` });
}

export function startAdminServer(port: number = DEFAULT_PORT): http.Server {
  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const server = http.createServer(handleRequest);
  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}`;
    console.log(`\n🎛️  Painel admin disponível em ${url}`);
    console.log('   Edite destinatários, mensagem, arquivo e agendamento pelo navegador.\n');
    if (process.env.ADMIN_OPEN !== '0') {
      open(url).catch(() => {
        // ignora
      });
    }
  });

  return server;
}
