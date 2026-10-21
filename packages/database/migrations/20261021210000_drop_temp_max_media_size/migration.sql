-- La "subida grande temporal" se descartó: vuelve a haber un único tamaño máximo para todo.
ALTER TABLE "SystemSettings" DROP COLUMN "tempMaxMediaSizeBytes",
DROP COLUMN "tempMaxMediaSizeUntil";
