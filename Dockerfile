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
RUN npx prisma generate
WORKDIR /workspace
ENV NODE_ENV=production
RUN pnpm --filter @workspace/budget-app run build

# Prune devDependencies so the runtime image only contains production packages
FROM base AS pruner
WORKDIR /workspace
COPY --from=builder /workspace .
WORKDIR /workspace/artifacts/budget-app
RUN pnpm prune --prod

# Minimal runtime image
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy only what's needed to run the app
COPY --from=pruner /workspace/artifacts/budget-app/node_modules ./node_modules
COPY --from=builder /workspace/artifacts/budget-app/.next ./.next
COPY --from=builder /workspace/artifacts/budget-app/public ./public
COPY --from=builder /workspace/artifacts/budget-app/prisma ./prisma
COPY --from=builder /workspace/artifacts/budget-app/package.json ./package.json
COPY --from=builder /workspace/artifacts/budget-app/next.config.ts ./next.config.ts

RUN mkdir -p /data /uploads
VOLUME ["/data", "/uploads"]

EXPOSE 3000

CMD sh -c "node node_modules/.bin/prisma migrate deploy && node node_modules/.bin/next start -p $PORT"
