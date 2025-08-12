FROM node:24.2-alpine AS builder

# Copy package files first for better caching
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json

WORKDIR /app

# Install all dependencies (including dev dependencies for building)
RUN npm install

# Copy source code and config
COPY src /app/src
COPY tsconfig.json /app/tsconfig.json

# Build the TypeScript project
RUN npm run build

# Install production dependencies in separate step
RUN npm ci --ignore-scripts --omit-dev

FROM node:24.2-alpine AS release

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/build /app/build
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
COPY --from=builder /app/node_modules /app/node_modules

# Create logs directory and set permissions
RUN mkdir -p /app/logs && chown -R mcp:nodejs /app

# Set environment
ENV NODE_ENV=production

# Switch to non-root user
USER mcp

# Default entrypoint for MCP server
CMD ["node", "build/index.js"]
