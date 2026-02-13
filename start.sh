#!/bin/sh

# Multilingual Conference - Railway Startup Script
# This script starts the backend API server using tsx (TypeScript executor)

cd backend

# Use tsx to run TypeScript directly (no compilation needed)
exec npx tsx src/server.ts
