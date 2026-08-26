-- AlterTable
-- `passwordHash` deja de ser obligatorio y se agrega `googleId`: una cuenta creada o
-- vinculada por "Ingresar con Google" no tiene contraseña propia hasta que el usuario
-- decide agregar una (ver AuthService.changePassword, que ahora tolera passwordHash nulo).
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
