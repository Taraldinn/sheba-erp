# ==============================================================================
# Production Dockerfile for Sheba Frontend (Next.js 16 + pnpm)
# ==============================================================================

# Stage 1: Build Next.js application
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack and activate pnpm matching project lockfile
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies required for Next.js build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build-time environment variables for Next.js build
ARG NEXT_PUBLIC_API_URL=https://api.shebafi.xyz/api/v1
ARG NEXT_PUBLIC_API_BASE_URL=https://api.shebafi.xyz/api/v1
ARG NEXT_PUBLIC_SUPER_ADMIN_HOST=admin.shebafi.xyz
ARG NEXT_PUBLIC_ISP_HOST=app.shebafi.xyz
ARG NEXT_PUBLIC_PUBLIC_HOME_HOST=shebafi.xyz
ARG NEXT_PUBLIC_TENANT_ROOT_DOMAIN=shebafi.xyz
ARG NEXT_PUBLIC_KNOWN_APEX_DOMAINS=shebafi.xyz

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SUPER_ADMIN_HOST=$NEXT_PUBLIC_SUPER_ADMIN_HOST \
    NEXT_PUBLIC_ISP_HOST=$NEXT_PUBLIC_ISP_HOST \
    NEXT_PUBLIC_PUBLIC_HOME_HOST=$NEXT_PUBLIC_PUBLIC_HOME_HOST \
    NEXT_PUBLIC_TENANT_ROOT_DOMAIN=$NEXT_PUBLIC_TENANT_ROOT_DOMAIN \
    NEXT_PUBLIC_KNOWN_APEX_DOMAINS=$NEXT_PUBLIC_KNOWN_APEX_DOMAINS \
    NODE_ENV=production

# Compile Next.js production build
RUN pnpm run build

# Prune devDependencies to keep production image smaller
RUN pnpm prune --prod

# ==============================================================================
# Stage 2: Production runner
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Copy package metadata and production node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["pnpm", "run", "start"]
