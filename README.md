# Multilingual Conferencing App

A real-time AI-powered multilingual voice conferencing application built with LiveKit, OpenAI, and WebRTC.

## Features

- 🎙️ Real-time voice conferencing with WebRTC
- 🌐 Live translation between multiple languages
- 🤖 AI-powered speech-to-text and text-to-speech
- 🔄 Automatic language detection and translation
- 📱 Responsive web interface

## Prerequisites

- Docker & Docker Compose
- OpenAI API Key (get one at https://platform.openai.com/api-keys)

## Quick Start - Development

1. **Start LiveKit server:**
   ```bash
   docker-compose up -d livekit
   ```

2. **Configure backend:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your OpenAI API key
   ```

3. **Configure frontend:**
   ```bash
   cd frontend
   cp .env.example .env
   # Set VITE_BACKEND_URL=http://localhost:3001
   ```

4. **Start backend:**
   ```bash
   cd backend
   npm run dev
   ```

5. **Start frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

6. **Open browser:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - LiveKit Dashboard: http://localhost:7880

## Production Deployment

### 1. Environment Setup

Create environment files with production values:

**Backend (.env):**
```bash
cd backend
cp .env.example .env
# Edit .env with production values:
# NODE_ENV=production
# OPENAI_API_KEY=your-api-key
# LIVEKIT_URL=ws://your-livekit-server:7880
```

**Frontend (.env):**
```bash
cd frontend
cp .env.example .env
# Edit .env:
# VITE_BACKEND_URL=http://your-server-ip:3001
```

### 2. Build & Deploy with Docker

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your-api-key

# Build and start all services
docker-compose up -d --build

# Check logs
docker-compose logs -f
```

### 3. Manual Deployment

**Backend:**
```bash
cd backend
npm install
npm run build
npm start
```

**Frontend:**
```bash
cd frontend
npm install
npm run build
# Serve the dist folder with nginx or any static server
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend   │────▶│   Backend   │────▶│  LiveKit    │
│  (React)     │     │  (Node.js)  │     │  Server     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  OpenAI API │
                    │ (Whisper,   │
                    │   GPT, TTS) │
                    └─────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 80 | Web application |
| Backend | 3001 | API server |
| LiveKit | 7880 | WebRTC signaling |
| LiveKit API | 7881 | REST API |

## Environment Variables

### Backend
| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | No | production/development |
| `PORT` | No | Server port (default: 3001) |
| `LIVEKIT_URL` | Yes | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `FRONTEND_URL` | No | Frontend URL for CORS |

### Frontend
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_URL` | Yes | Backend API URL |

## Troubleshooting

### LiveKit connection failed
Make sure LiveKit container is running:
```bash
docker-compose ps
docker-compose logs livekit
```

### CORS errors
Ensure `FRONTEND_URL` is set correctly in backend `.env`

### Token generation failed
Check backend logs and ensure LiveKit server is accessible

## License

MIT
