FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm install
COPY . .
RUN npm run db:generate && npm run build -w @brainwsp/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/database/schema.prisma ./packages/database/schema.prisma
COPY --from=build /app/packages/database/migrations ./packages/database/migrations
COPY --from=build /app/packages/database/seed.ts ./packages/database/seed.ts
EXPOSE 4000
# Applies committed migrations (see packages/database/migrations) instead of `db push`,
# so schema changes are tracked like Laravel migrations. The `||` fallback baselines a
# database that already has these tables from the old db-push workflow (pre-migrations):
# `migrate deploy` fails on its first run there because the tables already exist, so we
# mark the baseline migration as applied (no SQL executed) and retry. A genuinely fresh
# database succeeds on the first `migrate deploy` and never touches the fallback.
CMD ["sh", "-c", "set -e; npx prisma migrate deploy --schema packages/database/schema.prisma || (npx prisma migrate resolve --applied 20260821232835_init --schema packages/database/schema.prisma && npx prisma migrate deploy --schema packages/database/schema.prisma); npx tsx packages/database/seed.ts; node apps/api/dist/main.js"]
