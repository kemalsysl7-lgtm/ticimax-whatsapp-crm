# Repo kökünden derlenir: docker build -f apps/server/Dockerfile .
FROM node:22-alpine AS base
RUN npm install -g pnpm@11.24.0
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY apps/server apps/server
RUN pnpm --filter @crm/server build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY apps/server/drizzle ./apps/server/drizzle
COPY apps/server/package.json ./apps/server/
WORKDIR /app/apps/server
USER node
EXPOSE 3000
# Önce bekleyen migration'lar uygulanır, sonra sunucu başlar.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
