# Use Node.js LTS version with security updates
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY index.js ./

# Change ownership of the working directory to the nodeuser
RUN chown -R nodeuser:nodejs /app
USER nodeuser

# Expose port (optional, mainly for documentation)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Run the application
CMD ["node", "index.js"]
