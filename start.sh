#!/bin/bash

# Multilingual Conference - Railway Startup Script
# This script starts the backend API server

cd backend

# Build if not already built
if [ ! -d "dist" ]; then
    npm run build
fi

# Start the server
exec npm start
