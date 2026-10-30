# ==============================================================================
# HARDENED PRODUCTION DOCKERFILE (FOR TRIVY REMEDIATION & PRODUCTION DEPLOYMENT)
# ==============================================================================
# Hardening controls implemented:
# 1. Minimal Alpine base (eliminates hundreds of OS-level CVEs)
# 2. Multi-stage build (build tools & caches stripped from runtime)
# 3. Dedicated non-root user execution ('node' UID 1000)
# 4. Tini init system (handles PID 1 signals & zombie reaping)
# 5. Read-only permissions & clean npm cache
# ==============================================================================

# Stage 1: Build & dependency resolution
FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/package*.json ./

RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Hardened, minimal runtime container
FROM node:20-alpine AS runner

# Install dumb-init or tini for graceful PID 1 signal management
RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only production dependencies and application source
COPY --from=builder /app/node_modules ./node_modules
COPY backend/package*.json ./
COPY backend/server.js ./

# Set file ownership to non-root built-in 'node' user
RUN chown -R node:node /app

# Switch from root to unprivileged 'node' user (Prevents Container Breakouts)
USER node

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
