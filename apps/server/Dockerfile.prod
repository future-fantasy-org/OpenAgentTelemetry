FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/server/package.json ./apps/server/package.json
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
COPY apps/server ./apps/server
WORKDIR /app/apps/server
RUN pnpm run build

FROM node:20-slim AS production
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/package.json ./packages/shared/package.json

WORKDIR /app/apps/server
EXPOSE 3001

ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
