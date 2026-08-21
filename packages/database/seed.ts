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

  // Platform staff account — separate from the tenant OWNER above so promoting someone
  // to SUPERADMIN never disturbs the day-to-day company they already use BrainWSP as.
  const superadminName = process.env.SEED_SUPERADMIN_NAME || 'Super Admin';
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@braintech.com.pe';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'SuperAdmin-123456!';
  const superadminPasswordHash = await bcrypt.hash(superadminPassword, 12);
  await prisma.user.upsert({
    where: { email: superadminEmail },
    update: { name: superadminName, companyId: company.id, role: UserRole.SUPERADMIN, active: true },
    create: {
      companyId: company.id,
      email: superadminEmail,
      name: superadminName,
      passwordHash: superadminPasswordHash,
      role: UserRole.SUPERADMIN,
    },
  });

  const defaultPlans: Array<{ name: string; billingCycle: string; price: number; maxAgents?: number; maxInstances?: number }> = [
    { name: 'Gratis', billingCycle: 'FREE', price: 0, maxAgents: 2, maxInstances: 1 },
    { name: 'Mensual', billingCycle: 'MONTHLY', price: 9900, maxAgents: 10, maxInstances: 3 },
    { name: 'Anual', billingCycle: 'ANNUAL', price: 99900, maxAgents: 25, maxInstances: 10 },
  ];
  for (const plan of defaultPlans) {
    await prisma.plan.upsert({ where: { name: plan.name }, update: {}, create: plan });
  }

  // Cada instancia solo puede tener una credencial: si esta instancia ya tiene una
  // (con el nombre que sea — el usuario pudo haberla renombrado o recreado desde el
  // panel), no se crea otra encima, sin importar si coincide con el nombre por defecto.
  const existingCredential = await prisma.apiCredential.findUnique({
    where: { instanceId: instance.id },
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
        name: 'Integración Principal - Desarrollo',
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
  console.log('----------------------------------------------------------');
  console.log(`Panel admin (plataforma): ${superadminEmail} / ${superadminPassword}`);
  console.log('----------------------------------------------------------');
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
