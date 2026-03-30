FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
# Install all deps so prisma CLI (a production dependency) is present at runtime
RUN pnpm install --frozen-lockfile

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client (bakes native binaries into node_modules)
RUN ./node_modules/.bin/prisma generate

# Build Next.js
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
RUN pnpm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# Copy runtime artifacts (node_modules includes prisma CLI — production dependency)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Create directories for persistent data and uploads (within /app WORKDIR)
RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# node_modules/.bin/* are shell wrapper scripts — execute via sh, not node
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/next start -p ${PORT:-3000}"]
