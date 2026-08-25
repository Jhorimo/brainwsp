-- AlterTable
-- `instanceId` deja de ser obligatorio: la credencial "Principal" que se crea sola al
-- registrar una empresa (ver AuthService.register()) nace sin instancia y la obtiene
-- después, cuando se usa su AUTH KEY para llamar POST /api/user/device.
ALTER TABLE "ApiCredential" ALTER COLUMN "instanceId" DROP NOT NULL;
