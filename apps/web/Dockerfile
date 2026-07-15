FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN pnpm run build

FROM node:20-slim AS production
WORKDIR /app

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "server.js"]
