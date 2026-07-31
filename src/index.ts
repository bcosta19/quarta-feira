import { getConfig } from './config/store';
import { createWhatsAppClient } from './whatsapp/client';
import { sendTextToMany, sendMediaToMany } from './whatsapp/sender';
import { startAdminServer } from './admin/server';

async function main(): Promise<void> {
  console.log('🚀 Iniciando automação WhatsApp...\n');

  if (process.env.ADMIN !== '0') {
    startAdminServer();
  }

  const cfg = getConfig();
  const client = await createWhatsAppClient();

  try {
    if (cfg.recipients.length === 0) {
      throw new Error('Nenhum destinatário cadastrado. Use o painel admin (http://127.0.0.1:3001) ou edite data.json.');
    }

    if (cfg.messageType === 'text') {
      if (!cfg.message.trim()) {
        throw new Error('Mensagem vazia. Defina o texto no painel admin.');
      }
      await sendTextToMany(client, cfg.recipients, cfg.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      if (!cfg.filePath) {
        throw new Error(`Tipo "${cfg.messageType}" requer arquivo. Anexe um arquivo no painel admin.`);
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

    console.log('\n👋 Encerrando conexão...');
    client.end(undefined);
  } catch (error) {
    console.error('\n💥 Erro durante o envio:', (error as Error).message);
    client.end(undefined);
    throw error;
  }
}

main()
  .then(() => {
    console.log('🏁 Automação finalizada.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Erro na automação:', err.message);
    process.exit(1);
  });
