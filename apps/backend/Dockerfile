FROM node:22-bookworm-slim AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --frozen-lockfile --filter @checkmate/backend...

COPY apps/backend apps/backend
RUN pnpm --filter @checkmate/backend prisma:generate \
  && pnpm --filter @checkmate/backend build

FROM node:22-bookworm-slim AS runtime

RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/storage/uploads
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend ./apps/backend
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN mkdir -p /app/storage/uploads/tmp
EXPOSE 3003
CMD ["node", "apps/backend/dist/main.js"]
