import { startScheduler } from './scheduler/scheduler';
import { startAdminServer } from './admin/server';

async function main(): Promise<void> {
  console.log('🚀 Iniciando automação WhatsApp agendada...\n');

  if (process.env.ADMIN !== '0') {
    startAdminServer();
  }

  await startScheduler();

  process.stdin.resume();
}

main().catch((err) => {
  console.error('\n💥 Erro ao iniciar agendador:', err.message);
  process.exit(1);
});
