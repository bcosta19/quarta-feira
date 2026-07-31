import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export const messageTypes = ['text', 'image', 'video', 'audio', 'document'] as const;
export type MessageType = (typeof messageTypes)[number];

export type RecipientType = 'contact' | 'group';

export type Recipient = {
  type: RecipientType;
  id: string;
};

export type AppConfig = {
  recipients: Recipient[];
  message: string;
  messageType: MessageType;
  filePath: string | null;
  fileCaption: string;
  scheduleCron: string;
};

const CONFIG_PATH = path.resolve('./data.json');
const UPLOADS_DIR = path.resolve('./uploads');

const defaultConfig: AppConfig = {
  recipients: [],
  message: '',
  messageType: 'text',
  filePath: null,
  fileCaption: '',
  scheduleCron: '0 9 * * 1',
};

function readConfigFromDisk(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch {
    const migrated = migrateFromEnv();
    if (migrated) {
      writeConfigToDisk(migrated);
      return migrated;
    }
    return { ...defaultConfig };
  }
}

function migrateFromEnv(): AppConfig | null {
  const envPath = path.resolve('./.env');
  if (!fs.existsSync(envPath)) return null;

  dotenv.config({ path: envPath });
  const env = process.env;
  if (!env.RECIPIENTS && !env.TARGET_NUMBER && !env.TEST_MESSAGE) return null;

  const cfg: AppConfig = { ...defaultConfig };
  try {
    if (env.RECIPIENTS) {
      const parsed = JSON.parse(env.RECIPIENTS);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      cfg.recipients = list
        .filter((r: any) => r && (r.type === 'contact' || r.type === 'group') && typeof r.id === 'string')
        .map((r: any) => ({ type: r.type, id: String(r.id) }));
    } else if (env.TARGET_NUMBER) {
      cfg.recipients = [{ type: 'contact', id: env.TARGET_NUMBER }];
    }

    if (env.TEST_MESSAGE) cfg.message = env.TEST_MESSAGE;
    if (env.MESSAGE_TYPE && messageTypes.includes(env.MESSAGE_TYPE as MessageType)) {
      cfg.messageType = env.MESSAGE_TYPE as MessageType;
    }
    if (env.FILE_PATH) cfg.filePath = env.FILE_PATH;
    else if (env.VIDEO_PATH) cfg.filePath = env.VIDEO_PATH;
    if (env.FILE_CAPTION) cfg.fileCaption = env.FILE_CAPTION;
    else if (env.VIDEO_CAPTION) cfg.fileCaption = env.VIDEO_CAPTION;
    if (env.SCHEDULE_CRON) cfg.scheduleCron = env.SCHEDULE_CRON;
  } catch (err) {
    console.error('⚠️  Falha ao migrar .env → data.json:', (err as Error).message);
    return null;
  }

  console.log('🔁 Migrei .env → data.json (primeira execução).');
  return cfg;
}

function writeConfigToDisk(config: AppConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

let currentConfig: AppConfig = readConfigFromDisk();
const changeListeners: Array<(config: AppConfig) => void> = [];

export function getConfig(): AppConfig {
  return currentConfig;
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}

export function saveConfig(updates: Partial<AppConfig>): AppConfig {
  const next: AppConfig = { ...currentConfig, ...updates };
  writeConfigToDisk(next);
  currentConfig = next;
  for (const listener of changeListeners) {
    try {
      listener(currentConfig);
    } catch (err) {
      console.error('Listener de mudança de config falhou:', (err as Error).message);
    }
  }
  return currentConfig;
}

export function onConfigChange(listener: (config: AppConfig) => void): () => void {
  changeListeners.push(listener);
  return () => {
    const idx = changeListeners.indexOf(listener);
    if (idx >= 0) changeListeners.splice(idx, 1);
  };
}

export function addRecipient(recipient: Recipient): AppConfig {
  const exists = currentConfig.recipients.some(
    (r) => r.type === recipient.type && r.id === recipient.id
  );
  if (exists) {
    throw new Error(`Destinatário já existe: ${recipient.type}:${recipient.id}`);
  }
  return saveConfig({ recipients: [...currentConfig.recipients, recipient] });
}

export function removeRecipient(type: RecipientType, id: string): AppConfig {
  return saveConfig({
    recipients: currentConfig.recipients.filter(
      (r) => !(r.type === type && r.id === id)
    ),
  });
}

export function setMessage(message: string): AppConfig {
  return saveConfig({ message });
}

export function setMessageType(messageType: MessageType): AppConfig {
  return saveConfig({ messageType });
}

export function setFilePath(filePath: string | null): AppConfig {
  return saveConfig({ filePath });
}

export function setFileCaption(fileCaption: string): AppConfig {
  return saveConfig({ fileCaption });
}

export function setScheduleCron(scheduleCron: string): AppConfig {
  return saveConfig({ scheduleCron });
}

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function saveUploadedFile(originalName: string, buffer: Buffer): string {
  ensureUploadsDir();

  if (currentConfig.filePath) {
    const old = path.resolve(currentConfig.filePath);
    if (old.startsWith(UPLOADS_DIR)) {
      try {
        fs.unlinkSync(old);
      } catch {
        // arquivo pode já não existir
      }
    }
  }

  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}-${safeName}`;
  const fullPath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(fullPath, buffer);
  const relative = `./uploads/${fileName}`;
  setFilePath(relative);
  return relative;
}

export function clearUploadedFile(): void {
  if (currentConfig.filePath) {
    const full = path.resolve(currentConfig.filePath);
    if (full.startsWith(UPLOADS_DIR)) {
      try {
        fs.unlinkSync(full);
      } catch {
        // ignora
      }
    }
  }
  setFilePath(null);
}
