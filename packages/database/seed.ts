import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

function hashApiSecret(secret: string) {
  const pepper = process.env.CREDENTIAL_HASH_PEPPER || 'local-dev-pepper';
  return createHash('sha256').update(`${pepper}:${secret}`).digest('hex');
}

async function main() {
  const companyName = process.env.SEED_COMPANY_NAME || 'Brain Tech Peru';
  const companySlug = process.env.SEED_COMPANY_SLUG || 'brain-tech-peru';
  const adminName = process.env.SEED_ADMIN_NAME || 'Administrador Brain Tech';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@braintech.com.pe';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe-123456!';

  const company = await prisma.company.upsert({
    where: { slug: companySlug },
    update: { name: companyName },
    create: { name: companyName, slug: companySlug },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    // Do not reset an existing password every time the development container restarts.
    update: { name: adminName, companyId: company.id, role: UserRole.OWNER, active: true },
    create: {
      companyId: company.id,
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: UserRole.OWNER,
    },
  });

  const instance = await prisma.whatsAppInstance.upsert({
    where: { companyId_slug: { companyId: company.id, slug: 'principal' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'WhatsApp Principal',
      slug: 'principal',
    },
  });

  const existingCredential = await prisma.apiCredential.findFirst({
    where: { companyId: company.id, name: 'BrainPOS / ERP - Desarrollo' },
  });

  let appKey = existingCredential?.appKey;
  let authKey: string | undefined;

  if (!existingCredential) {
    appKey = randomUUID();
    authKey = randomBytes(36).toString('base64url');
    await prisma.apiCredential.create({
      data: {
        companyId: company.id,
        instanceId: instance.id,
        name: 'BrainPOS / ERP - Desarrollo',
        appKey,
        authHash: hashApiSecret(authKey),
      },
    });
  }

  console.log('\n============================================================');
  console.log(' BrainWSP - Seed completado');
  console.log('============================================================');
  console.log(`Panel:     http://localhost:3000`);
  console.log(`API:       http://localhost:4000/api`);
  console.log(`Swagger:   http://localhost:4000/docs`);
  console.log(`Usuario:   ${adminEmail}`);
  console.log(`Password:  ${adminPassword}`);
  console.log(`APP KEY:   ${appKey}`);
  if (authKey) {
    console.log(`AUTH KEY:  ${authKey}`);
    console.log('IMPORTANTE: el AUTH KEY se muestra una sola vez. Guárdalo.');
  } else {
    console.log('AUTH KEY:  ya existía; crea una nueva credencial desde el panel si no la conservaste.');
  }
  console.log('============================================================\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
