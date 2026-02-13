# Root Dockerfile for Railway - builds both backend and frontend
# This file is used by Railway to build the entire application

# ============ BACKEND ============
FROM node:20-alpine AS backend

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --only=production --no-audit --no-fund

# Copy backend source
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Build backend
RUN npm run build

# ============ FRONTEND ============
FROM node:20-alpine AS frontend

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm install --no-audit --no-fund

# Copy frontend source
COPY frontend/src ./src
COPY frontend/index.html ./
COPY frontend/tailwind.config.js ./
COPY frontend/postcss.config.js ./
COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts ./

# Build frontend
RUN npm run build

# ============ FINAL STAGE ============
FROM node:20-alpine

WORKDIR /app

# Copy built backend
COPY --from=backend /app/backend/dist ./backend/dist
COPY --from=backend /app/backend/src ./backend/src
COPY --from=backend /app/backend/node_modules ./backend/node_modules
COPY --from=backend /app/backend/package*.json ./backend/

# Copy built frontend
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Install serve for frontend
RUN npm install -g serve

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Expose port (Railway will override with PORT env var)
EXPOSE 3001

# Start command
CMD ["./start.sh"]
