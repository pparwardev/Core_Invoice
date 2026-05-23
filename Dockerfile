FROM node:20-slim

# Install Python for MCP PO Reader (pdfplumber)
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install --break-system-packages pdfplumber && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY client/package.json client/

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY server/ server/
COPY client/ client/
COPY mcp-server/ mcp-server/

# Build server
RUN cd server && npx tsc

# Build client
RUN cd client && npx vite build

# Create data directory for SQLite
RUN mkdir -p server/data/uploads

# Expose port (Render sets PORT dynamically)
EXPOSE 3001

# Set environment
ENV NODE_ENV=production

# Start server
CMD ["node", "server/dist/index.js"]
