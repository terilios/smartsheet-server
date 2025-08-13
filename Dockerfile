# Multi-stage Docker build for Smartsheet MCP Server
FROM node:18-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source and build
COPY src/ ./src/
RUN npm run build

# Python stage
FROM python:3.9-slim AS python-builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Python package
COPY smartsheet_ops/ ./smartsheet_ops/

# Install Python package
RUN cd smartsheet_ops && pip install --user .

# Final stage
FROM node:18-alpine

WORKDIR /app

# Install Python
RUN apk add --no-cache python3 py3-pip

# Copy built Node.js application
COPY --from=node-builder /app/build ./build/
COPY --from=node-builder /app/node_modules ./node_modules/
COPY package.json ./

# Copy Python application
COPY --from=python-builder /root/.local /root/.local
COPY --from=python-builder /app/smartsheet_ops ./smartsheet_ops/

# Make sure Python packages are in PATH
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/app/smartsheet_ops:$PYTHONPATH

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node build/index.js --help || exit 1

# Default command
CMD ["node", "build/index.js"]

# Metadata
LABEL org.opencontainers.image.title="Smartsheet MCP Server"
LABEL org.opencontainers.image.description="A Model Context Protocol server for Smartsheet operations with healthcare analytics"
LABEL org.opencontainers.image.version="0.3.0"
LABEL org.opencontainers.image.authors="Timothy Driscoll"
LABEL org.opencontainers.image.source="https://github.com/terilios/smartsheet-server"