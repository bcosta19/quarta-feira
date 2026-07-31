import { WASocket } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import type { Recipient, MessageType } from '../config/store';

function toWhatsAppJid(recipient: Recipient): string {
  if (recipient.type === 'group') {
    return recipient.id.includes('@') ? recipient.id : `${recipient.id}@g.us`;
  }

  const clean = recipient.id.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function readFileOrThrow(filePath: string): Buffer {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo não encontrado: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath);
}

export async function sendText(
  client: WASocket,
  to: Recipient,
  text: string
): Promise<void> {
  const jid = toWhatsAppJid(to);
  console.log(`📤 Enviando mensagem de texto para ${to.id} (${to.type})...`);
  await client.sendMessage(jid, { text });
  console.log('✅ Mensagem de texto enviada com sucesso!');
}

export async function sendTextToMany(
  client: WASocket,
  recipients: Recipient[],
  text: string
): Promise<void> {
  for (const recipient of recipients) {
    await sendText(client, recipient, text);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export async function sendImage(
  client: WASocket,
  to: Recipient,
  filePath: string,
  caption?: string
): Promise<void> {
  const jid = toWhatsAppJid(to);
  const buffer = readFileOrThrow(filePath);
  const stats = fs.statSync(path.resolve(filePath));

  console.log(`🖼️ Enviando imagem para ${to.id} (${to.type}): ${path.basename(filePath)} (${formatBytes(stats.size)})`);

  const result = await client.sendMessage(jid, {
    image: buffer,
    caption: caption || '',
  });

  if (!result) throw new Error('Falha ao enviar imagem: retorno vazio');
  console.log('✅ Imagem enviada com sucesso!');
}

export async function sendVideo(
  client: WASocket,
  to: Recipient,
  filePath: string,
  caption?: string
): Promise<void> {
  const jid = toWhatsAppJid(to);
  const buffer = readFileOrThrow(filePath);
  const stats = fs.statSync(path.resolve(filePath));

  console.log(`🎬 Enviando vídeo para ${to.id} (${to.type}): ${path.basename(filePath)} (${formatBytes(stats.size)})`);

  const result = await client.sendMessage(jid, {
    video: buffer,
    caption: caption || '',
    gifPlayback: false,
  });

  if (!result) throw new Error('Falha ao enviar vídeo: retorno vazio');
  console.log('✅ Vídeo enviado com sucesso!');
}

export async function sendAudio(
  client: WASocket,
  to: Recipient,
  filePath: string
): Promise<void> {
  const jid = toWhatsAppJid(to);
  const buffer = readFileOrThrow(filePath);
  const stats = fs.statSync(path.resolve(filePath));
  const mimetype = mime.lookup(filePath) || 'audio/mp4';

  console.log(`🎵 Enviando áudio para ${to.id} (${to.type}): ${path.basename(filePath)} (${formatBytes(stats.size)})`);

  const result = await client.sendMessage(jid, {
    audio: buffer,
    mimetype,
    ptt: true, // envia como "push to talk" (mensagem de voz)
  });

  if (!result) throw new Error('Falha ao enviar áudio: retorno vazio');
  console.log('✅ Áudio enviado com sucesso!');
}

export async function sendDocument(
  client: WASocket,
  to: Recipient,
  filePath: string,
  caption?: string
): Promise<void> {
  const jid = toWhatsAppJid(to);
  const buffer = readFileOrThrow(filePath);
  const stats = fs.statSync(path.resolve(filePath));
  const mimetype = mime.lookup(filePath) || 'application/octet-stream';
  const fileName = path.basename(filePath);

  console.log(`📄 Enviando documento para ${to.id} (${to.type}): ${fileName} (${formatBytes(stats.size)})`);

  const result = await client.sendMessage(jid, {
    document: buffer,
    fileName,
    mimetype,
    caption: caption || '',
  });

  if (!result) throw new Error('Falha ao enviar documento: retorno vazio');
  console.log('✅ Documento enviado com sucesso!');
}

export async function sendMedia(
  client: WASocket,
  to: Recipient,
  messageType: MessageType,
  filePath: string,
  caption?: string
): Promise<void> {
  switch (messageType) {
    case 'image':
      return sendImage(client, to, filePath, caption);
    case 'video':
      return sendVideo(client, to, filePath, caption);
    case 'audio':
      return sendAudio(client, to, filePath);
    case 'document':
      return sendDocument(client, to, filePath, caption);
    default:
      throw new Error(`Tipo de mídia não suportado: ${messageType}`);
  }
}

export async function sendMediaToMany(
  client: WASocket,
  recipients: Recipient[],
  messageType: MessageType,
  filePath: string,
  caption?: string
): Promise<void> {
  for (const recipient of recipients) {
    await sendMedia(client, recipient, messageType, filePath, caption);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
