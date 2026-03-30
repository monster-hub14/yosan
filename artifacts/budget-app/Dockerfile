FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
# Install all deps (including devDependencies) so the prisma CLI is available
# for both the build stage and the migrate-deploy step at container startup.
RUN pnpm install --frozen-lockfile

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client (bakes native binaries into node_modules)
RUN pnpm exec prisma generate

# Build Next.js
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
RUN pnpm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# Create directories for persistent data and uploads
RUN mkdir -p ./data ./uploads

# Copy only what is needed at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Run migrations then start the server.
# node_modules/.bin/prisma and .bin/next are shell scripts — execute them
# directly via sh, NOT via `node` (which cannot run shell scripts).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/next start -p ${PORT:-3000}"]
