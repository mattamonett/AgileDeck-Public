# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY api/package*.json ./api/
COPY shared/package*.json ./shared/
COPY web/package*.json ./web/
RUN npm ci --workspace api --workspace shared --include-workspace-root=false --no-audit --no-fund
COPY tsconfig.base.json ./
COPY api ./api
COPY shared ./shared
RUN npm run build -w shared
ENV DATABASE_URL=file:/tmp/build.db
RUN npm run build -w api

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package*.json ./
COPY api/package*.json ./api/
COPY shared/package*.json ./shared/
COPY web/package*.json ./web/
RUN npm ci --omit=dev --ignore-scripts --workspace api --workspace shared --include-workspace-root=false --no-audit --no-fund && npm cache clean --force

FROM ${NODE_IMAGE} AS production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# The runtime starts Prisma and the API with node directly; drop unused package managers.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/api/package*.json ./api/
COPY --from=production-dependencies /app/shared/package*.json ./shared/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/api/prisma ./api/prisma
RUN mkdir -p /app/api/data && chown node:node /app/api/data
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/app/api/data/poker.db
ARG BUILD_TIME=Development
ENV BUILD_TIME=$BUILD_TIME
USER node
WORKDIR /app/api
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["sh", "-c", "node ../node_modules/prisma/build/index.js migrate deploy && exec node dist/start.js"]
