FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy server source
COPY index.js ./

# Koyeb injects PORT automatically; default to 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Run as non-root
RUN addgroup -S app && adduser -S app -G app
USER app

CMD ["node", "index.js"]
