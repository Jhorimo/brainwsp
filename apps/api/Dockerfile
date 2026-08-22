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
COPY --from=build /app/packages/database/migrate-deploy.sh ./packages/database/migrate-deploy.sh
COPY --from=build /app/packages/database/seed.ts ./packages/database/seed.ts
EXPOSE 4000
# packages/database/migrate-deploy.sh applies committed migrations (like Laravel's
# `artisan migrate`) instead of `db push`, with a one-time fallback that baselines a
# database that already has these tables from the old db-push workflow. The CI deploy
# workflow (.github/workflows/deploy.yml) runs this same script in a throwaway container
# before swapping over production, so both paths share one source of truth.
CMD ["sh", "-c", "sh packages/database/migrate-deploy.sh && npx tsx packages/database/seed.ts && node apps/api/dist/main.js"]
