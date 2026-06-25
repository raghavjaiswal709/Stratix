# ── Stage 1: Install production dependencies ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts

# ── Stage 2: Final image ──────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy server source (never copy .env — secrets come from Fly secrets)
COPY index.js ./
COPY package.json ./

# Node 20 has global fetch built-in — no extra packages needed
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Use non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "index.js"]
