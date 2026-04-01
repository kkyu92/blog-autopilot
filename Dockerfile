# --- Stage 1: Dependencies ---
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Stage 2: Build ---
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Drizzle 마이그레이션 파일 포함
RUN pnpm build

# --- Stage 3: Production ---
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone 출력 복사
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Drizzle 마이그레이션 파일 복사
COPY --from=builder /app/drizzle ./drizzle

# SQLite 데이터 디렉토리 (Fly volume 마운트 포인트)
RUN mkdir -p /data && chown nextjs:nodejs /data

# 백업 스크립트 복사 (후에 추가)
COPY --from=builder /app/scripts ./scripts

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
