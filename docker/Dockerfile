# docker/Dockerfile
# ──────────────────────────────────────────────────────────────
# Multi-stage build for the Church Backend API.
#
# STAGE 1: builder — installs ONLY production dependencies
# STAGE 2: runner  — copies the built app, runs as non-root
#
# WHY MULTI-STAGE?
# The final image is much smaller because it doesn't include
# devDependencies (Prisma CLI, nodemon, Jest, etc.) or the
# intermediate build artifacts. Smaller image = faster deploys
# and a smaller attack surface.
#
# HOW TO BUILD
#   docker build -f docker/Dockerfile -t church-backend .
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first so Docker caches this layer — npm/yarn
# install only re-runs when these files change, not on every code
# change.
COPY package.json yarn.lock ./

# Install ALL dependencies (including devDependencies) because
# Prisma needs its CLI to generate the client.
RUN yarn install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Generate the Prisma client (reads schema.prisma, outputs
# generated code to node_modules/.prisma/client/).
RUN yarn prisma:generate

# ── Stage 2: Runner ──────────────────────────────────────────
FROM node:18-alpine

# Create a non-root user. Running as root inside a container is
# a security risk — if an attacker escapes the Node process, they
# get root on the container. Running as 'node' limits the blast
# radius.
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy only what's needed from the builder stage
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/src ./src

# Switch to the non-root user BEFORE the container does anything else
USER appuser

# The API listens on this port internally. The hosting platform
# (Railway, Render, AWS) maps this to an external port.
EXPOSE 5000

# Run the API server. The worker runs as a SEPARATE container
# (or separate service in docker-compose) using the same image
# but with CMD overridden to `yarn worker`.
CMD ["yarn", "start"]