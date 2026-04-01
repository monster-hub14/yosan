# rebuild trigger
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install all dependencies needed for build
FROM base AS deps
WORKDIR /workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY artifacts/budget-app/package.json ./artifacts/budget-app/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build the Next.js app
FROM base AS builder
WORKDIR /workspace

ARG ENCRYPTION_KEY
ENV ENCRYPTION_KEY=$ENCRYPTION_KEY
ENV NODE_ENV=production

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/artifacts/budget-app/node_modules ./artifacts/budget-app/node_modules
COPY . .

WORKDIR /workspace/artifacts/budget-app
RUN ./node_modules/.bin/prisma generate

WORKDIR /workspace
RUN pnpm --filter @workspace/budget-app run build

# Runtime image
FROM node:22-slim AS runner
WORKDIR /app

ARG ENCRYPTION_KEY
ENV ENCRYPTION_KEY=$ENCRYPTION_KEY
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy built app
COPY --from=builder /workspace/artifacts/budget-app/.next/standalone ./
COPY --from=builder /workspace/artifacts/budget-app/.next/static ./.next/static
COPY --from=builder /workspace/artifacts/budget-app/public ./public
COPY --from=builder /workspace/artifacts/budget-app/prisma ./prisma
COPY --from=builder /workspace/artifacts/budget-app/package.json ./package.json
COPY --from=builder /workspace/artifacts/budget-app/next.config.ts ./next.config.ts

# Install the exact Prisma CLI version declared by the app
RUN PRISMA_VERSION=$(node -p "const p=require('./package.json'); (p.dependencies && p.dependencies.prisma) || (p.devDependencies && p.devDependencies.prisma) || ''") \
    && if [ -z \"$PRISMA_VERSION\" ]; then echo 'Prisma version not found in package.json' && exit 1; fi \
    && npm install -g "prisma@${PRISMA_VERSION}"

RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "prisma migrate deploy && node artifacts/budget-app/server.js"]
