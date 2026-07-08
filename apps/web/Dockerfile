FROM node:20-slim
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --no-frozen-lockfile

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "dev"]
