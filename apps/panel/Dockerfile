# Repo kökünden derlenir: docker build -f apps/panel/Dockerfile .
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.24.0
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/panel/package.json apps/panel/
RUN pnpm install --frozen-lockfile --filter @crm/panel
COPY apps/panel apps/panel
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @crm/panel build

FROM node:22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/panel/.next/standalone ./
COPY --from=build /app/apps/panel/.next/static ./apps/panel/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/panel/server.js"]
