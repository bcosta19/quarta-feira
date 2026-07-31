import { createWhatsAppClient } from '../whatsapp/client';

async function main(): Promise<void> {
  console.log('🚀 Conectando ao WhatsApp para listar grupos...\n');

  const client = await createWhatsAppClient();

  try {
    console.log('🔍 Buscando grupos...\n');

    const groups = await client.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    if (groupList.length === 0) {
      console.log('❌ Você não participa de nenhum grupo.');
    } else {
      console.log(`✅ ${groupList.length} grupo(s) encontrado(s):\n`);
      console.log('ID do grupo                       | Nome do grupo');
      console.log('----------------------------------|------------------------------');

      groupList.forEach((group) => {
        const id = group.id.padEnd(33);
        const name = group.subject;
        console.log(`${id}| ${name}`);
      });

      console.log('\n📋 Copie o ID do grupo e adicione no .env:');
      console.log(`RECIPIENTS=[{"type":"group","id":"ID_AQUI@g.us"}]`);
    }
  } catch (error) {
    console.error('\n💥 Erro ao listar grupos:', (error as Error).message);
  } finally {
    console.log('\n👋 Encerrando conexão...');
    client.end(undefined);
  }
}

main().catch((err) => {
  console.error('\n💥 Erro:', err.message);
  process.exit(1);
});
