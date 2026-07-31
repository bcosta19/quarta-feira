import { clearAuthFolder } from '../whatsapp/client';

async function main(): Promise<void> {
  await clearAuthFolder();
  console.log('✅ Sessão limpa com sucesso.');
  console.log('   Na próxima execução será necessário escanear o QR Code novamente.');
}

main().catch((err) => {
  console.error('❌ Erro ao limpar sessão:', err.message);
  process.exit(1);
});
