import { startAdminServer } from './admin/server';
import { getConfig } from './config/store';

async function main(): Promise<void> {
  console.log('🚀 Iniciando painel admin...\n');
  const cfg = getConfig();
  console.log(`   Destinatários atuais: ${cfg.recipients.length}`);
  console.log(`   Mensagem: "${cfg.message.slice(0, 60)}${cfg.message.length > 60 ? '…' : ''}"`);
  console.log(`   Tipo: ${cfg.messageType}`);
  console.log(`   Arquivo: ${cfg.filePath ?? '(nenhum)'}`);
  console.log(`   Cron: ${cfg.scheduleCron}\n`);

  startAdminServer();
  process.stdin.resume();
}

main().catch((err) => {
  console.error('💥 Erro ao iniciar painel:', err.message);
  process.exit(1);
});
