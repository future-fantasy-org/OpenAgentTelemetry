FROM node:20-slim
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN pnpm install --no-frozen-lockfile

WORKDIR /app/apps/server
EXPOSE 3001
CMD ["pnpm", "dev"]
