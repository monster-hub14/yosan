FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install ALL dependencies (needed for build-time tooling)
FROM base AS deps
WORKDIR /workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY artifacts/budget-app/package.json ./artifacts/budget-app/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @workspace/budget-app

# Build the Next.js app
FROM base AS builder
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/artifacts/budget-app/node_modules ./artifacts/budget-app/node_modules
COPY . .
WORKDIR /workspace/artifacts/budget-app
RUN ./node_modules/.bin/prisma generate
WORKDIR /workspace
ENV NODE_ENV=production
RUN pnpm --filter @workspace/budget-app run build

# Minimal runtime image
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /node_modules
COPY --from=deps /workspace/node_modules/.pnpm /node_modules/.pnpm

# Copy runtime dependencies and app files
COPY --from=deps /workspace/artifacts/budget-app/node_modules ./node_modules
COPY --from=builder /workspace/artifacts/budget-app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /workspace/artifacts/budget-app/.next ./.next
COPY --from=builder /workspace/artifacts/budget-app/public ./public
COPY --from=builder /workspace/artifacts/budget-app/prisma ./prisma
COPY --from=builder /workspace/artifacts/budget-app/package.json ./package.json
COPY --from=builder /workspace/artifacts/budget-app/next.config.ts ./next.config.ts

RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app /node_modules
USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/next start -p ${PORT:-3000}"]