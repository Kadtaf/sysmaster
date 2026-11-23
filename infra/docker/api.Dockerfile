# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @sysmaster/api... --filter sysmaster
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY db db
COPY infra/scripts infra/scripts
RUN pnpm --filter @sysmaster/contracts build && pnpm --filter @sysmaster/api build

FROM base AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION
COPY --from=build /repo /repo
USER node
WORKDIR /repo/apps/api
EXPOSE 4000 9464
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://localhost:4000/api/v1/health/live || exit 1
CMD ["node", "dist/main.js"]
