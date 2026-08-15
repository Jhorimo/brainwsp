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
COPY --from=build /app/packages/database/seed.ts ./packages/database/seed.ts
CMD ["sh", "-c", "npx prisma db push --schema packages/database/schema.prisma && npx tsx packages/database/seed.ts && node apps/api/dist/main.js"]
