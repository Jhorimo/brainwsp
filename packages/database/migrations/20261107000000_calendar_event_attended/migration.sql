-- Check de "asistio" para la campana de citas de hoy (null = pendiente).
ALTER TABLE "CalendarEvent" ADD COLUMN "attendedAt" TIMESTAMP(3);
