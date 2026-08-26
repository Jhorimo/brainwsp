-- AlterTable
-- Precio en dólares para el catálogo, independiente del precio en soles (`price`) — un
-- mismo plan puede venderse en ambas monedas según el país del cliente.
ALTER TABLE "Plan" ADD COLUMN "priceUsd" INTEGER NOT NULL DEFAULT 0;
