import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MediaDedupService } from './media-dedup.service';

// Corre la unión de duplicados ya, sin esperar a la tarea de las 4:00. Simula por defecto;
// `--apply` mueve y borra de verdad. Uso en el servidor (contenedor de la API):
//   node apps/api/dist/system-settings/dedup-media.cli.js           # simulación
//   node apps/api/dist/system-settings/dedup-media.cli.js --apply   # aplicar
// No levanta la app entera (ni crons ni colas), solo Prisma y MinIO.
async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaService();
  try {
    const report = await new MediaDedupService(prisma, new StorageService()).run({ apply });
    const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    console.log(`\n${apply ? 'APLICADO' : 'SIMULACIÓN (no se movió ni borró nada)'}`);
    console.log(`Huellas calculadas: ${report.hashed} (sin archivo en MinIO: ${report.missing})`);
    console.log(`Archivos repetidos: ${report.groups} grupos, ${report.duplicateObjects} copias de más`);
    console.log(`${apply ? 'Espacio liberado' : 'Espacio que se liberaría'}: ${gb(report.freedBytes)}`);
    if (apply) console.log(`Re-apuntados: ${report.repointedMessages} mensajes, ${report.repointedQuickReplies} respuestas rápidas; copias borradas: ${report.deletedObjects}`);
    if (report.keptReferenced) console.log(`Copias conservadas por estar en uso fuera de los chats: ${report.keptReferenced}`);
    if (report.top.length) {
      console.log('\nLos que más ocupan repetidos:');
      for (const item of report.top) console.log(`  ${gb(item.bytes).padStart(9)}  ${item.copies} copias  ${item.fileName ?? '(sin nombre)'}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
