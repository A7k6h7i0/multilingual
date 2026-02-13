# Frontend Dockerfile for Railway
FROM node:20-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY index.html ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY tsconfig.json ./
COPY vite.config.ts ./

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=build /app/dist ./dist

# Install serve globally
RUN npm install -g serve

# Expose port
EXPOSE 80

# Start serve
CMD ["serve", "dist", "-s", "-l", "80"]
