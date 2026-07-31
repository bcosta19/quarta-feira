import {
  AppConfig,
  Recipient,
  getConfig,
  onConfigChange,
  messageTypes,
  MessageType,
} from '../config/store';
import { createWhatsAppClient } from '../whatsapp/client';
import { sendTextToMany, sendMediaToMany } from '../whatsapp/sender';

let currentTask: { stop: () => void } | null = null;

async function runJob(): Promise<void> {
  const cfg = getConfig();
  const now = new Date().toLocaleString('pt-BR');
  console.log(`\n⏰ ${now} - Horário de envio!`);
  console.log(`   Tipo: ${cfg.messageType} | Destinatários: ${cfg.recipients.length} | Arquivo: ${cfg.filePath ?? '(nenhum)'}`);

  let client;
  try {
    client = await createWhatsAppClient();

    if (cfg.recipients.length === 0) {
      console.log('⚠️  Nenhum destinatário cadastrado. Pulando envio.');
      return;
    }

    if (cfg.messageType === 'text') {
      if (!cfg.message.trim()) {
        console.log('⚠️  Mensagem vazia. Pulando envio.');
        return;
      }
      await sendTextToMany(client, cfg.recipients, cfg.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      if (!cfg.filePath) {
        console.log(`⚠️  Tipo "${cfg.messageType}" requer arquivo. Pulando envio.`);
        return;
      }
      await sendMediaToMany(
        client,
        cfg.recipients,
        cfg.messageType,
        cfg.filePath,
        cfg.fileCaption
      );
      console.log('⏳ Aguardando finalização do upload...');
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }

    console.log('✅ Envio concluído. Aguardando próximo horário...\n');
  } catch (error) {
    console.error('\n💥 Erro no job:', (error as Error).message);
  } finally {
    if (client) {
      console.log('👋 Encerrando conexão...');
      client.end(undefined);
    }
  }
}

async function scheduleTask(cronExpr: string): Promise<void> {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  const cron = await import('node-cron');
  if (!cron.validate(cronExpr)) {
    throw new Error(`Expressão cron inválida: ${cronExpr}`);
  }

  console.log(`📅 Agendando job com cron: ${cronExpr}`);
  const task = cron.schedule(cronExpr, runJob, { timezone: 'America/Sao_Paulo' });
  currentTask = task;
}

export async function startScheduler(): Promise<void> {
  const cfg = getConfig();
  await scheduleTask(cfg.scheduleCron);
  printStartupInfo(cfg);

  onConfigChange((next) => {
    if (next.scheduleCron !== cfg.scheduleCron) {
      console.log(`\n🔄 Cron alterado: ${cfg.scheduleCron} → ${next.scheduleCron}. Re-agendando...`);
      scheduleTask(next.scheduleCron).catch((err) => {
        console.error('Erro ao re-agendar:', err.message);
      });
    } else {
      console.log('\n💾 Configuração atualizada em runtime (próximo envio usará os novos valores).');
    }
  });
}

function printStartupInfo(cfg: AppConfig): void {
  console.log('\n📅 Agendador iniciado');
  console.log(`   Expressão cron: ${cfg.scheduleCron}`);
  console.log(`   Tipo de mensagem: ${cfg.messageType}`);
  console.log(`   Destinatários: ${cfg.recipients.length}`);
  cfg.recipients.forEach((r: Recipient) => {
    console.log(`     - ${r.type}: ${r.id}`);
  });
  if (cfg.messageType !== 'text') {
    console.log(`   Arquivo: ${cfg.filePath ?? '(nenhum)'}`);
    console.log(`   Legenda: ${cfg.fileCaption || '(vazia)'}`);
  }
  console.log(`   Tipos suportados: ${messageTypes.join(', ')}`);
  console.log('   Aguardando próximo horário de execução...\n');
}

export const _internal = { runJob, scheduleTask };
export type { MessageType };
