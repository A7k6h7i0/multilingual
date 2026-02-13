

import { createServer } from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/config';
import { generateAccessToken, listRooms, ensureRoom } from './services/livekitService';
import { initTranslationWebSocket, getActiveSessionCount, cleanupAllSessions } from './services/translationService';
import { TokenRequest, ErrorResponse } from './types';

// Initialize Express app
const app = express();

// Create HTTP server (required for WebSocket)
const server = createServer(app);

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Enable CORS for frontend
app.use(cors({
  origin: config.server.isDevelopment
    ? ['http://localhost:5173', 'http://localhost:3000'] // Vite and Next.js defaults
    : process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * POST /api/token
 * 
 * Generate a LiveKit access token for a participant to join a room.
 * 
 * REQUEST BODY:
 * {
 *   "roomName": "conference-123",
 *   "participantName": "Alice",
 *   "targetLanguage": "en"
 * }
 * 
 * RESPONSE:
 * {
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "roomName": "conference-123",
 *   "participantName": "Alice",
 *   "targetLanguage": "en"
 * }
 * 
 * This token:
 * - Authenticates the participant with LiveKit
 * - Grants permissions to join the room
 * - Contains metadata (like target language)
 */
app.post('/api/token', async (req: Request, res: Response) => {
  try {
    const { roomName, participantName, targetLanguage } = req.body as TokenRequest;

    // Validate required fields
    if (!roomName || !participantName) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: roomName and participantName',
        statusCode: 400
      } as ErrorResponse);
    }

    // Ensure room exists in LiveKit
    await ensureRoom(roomName);

    // Generate access token
    const tokenResponse = await generateAccessToken({
      roomName,
      participantName,
      targetLanguage: targetLanguage || 'en'
    });

    console.log(`[API] ✓ Token generated for ${participantName} in room ${roomName}`);

    res.json(tokenResponse);
  } catch (error: any) {
    console.error('[API] ✗ Error generating token:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to generate token',
      statusCode: 500
    } as ErrorResponse);
  }
});

/**
 * POST /api/worker/start
 * 
 * Legacy endpoint - translation now happens via WebSocket.
 * Kept for backward compatibility, returns success immediately.
 * 
 * The frontend should connect to ws://localhost:3001/ws/translate instead.
 */
app.post('/api/worker/start', async (req: Request, res: Response) => {
  try {
    const { roomName } = req.body;

    if (!roomName) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: roomName',
        statusCode: 400
      } as ErrorResponse);
    }

    // Just return success - actual translation happens via WebSocket
    console.log(`[API] ✓ Translation enabled for room: ${roomName} (via WebSocket)`);

    res.json({
      success: true,
      message: `Translation enabled for room: ${roomName}`,
      wsEndpoint: `ws://localhost:${config.server.port}/ws/translate`,
      note: 'Connect to WebSocket endpoint to start translation'
    });
  } catch (error: any) {
    console.error('[API] ✗ Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      statusCode: 500
    } as ErrorResponse);
  }
});

/**
 * POST /api/worker/stop
 * 
 * Legacy endpoint - kept for backward compatibility.
 */
app.post('/api/worker/stop', async (req: Request, res: Response) => {
  const { roomName } = req.body;
  console.log(`[API] Worker stop requested for room: ${roomName}`);
  res.json({
    success: true,
    message: `Translation disabled for room: ${roomName}`
  });
});

/**
 * GET /api/translation/status
 * 
 * Get status of the WebSocket translation service.
 */
app.get('/api/translation/status', (req: Request, res: Response) => {
  res.json({
    activeSessions: getActiveSessionCount(),
    wsEndpoint: `ws://localhost:${config.server.port}/ws/translate`
  });
});

/**
 * GET /api/rooms
 * 
 * List all active LiveKit rooms.
 * Useful for debugging and monitoring.
 * 
 * NOTE: Requires RoomList permission on API key.
 */
app.get('/api/rooms', async (req: Request, res: Response) => {
  try {
    const rooms = await listRooms();
    res.json({
      rooms,
      totalRooms: rooms.length
    });
  } catch (error: any) {
    console.error('[API] ✗ Error listing rooms:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to list rooms',
      statusCode: 500
    } as ErrorResponse);
  }
});

/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring.
 * Returns server status and uptime.
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'multilingual-conferencing-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    translationSessions: getActiveSessionCount(),
    config: {
      livekitUrl: config.livekit.url,
      wsEndpoint: `/ws/translate`
    }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * 404 handler for unknown routes
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    statusCode: 404
  } as ErrorResponse);
});

/**
 * Global error handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.server.isDevelopment ? err.message : 'An unexpected error occurred',
    statusCode: 500
  } as ErrorResponse);
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Start the Express server with WebSocket support
 */
async function startServer() {
  try {
    // Validate configuration
    console.log('\n=== Multilingual Conferencing Backend ===\n');
    console.log('Configuration:');
    console.log(`  Node Environment: ${config.server.nodeEnv}`);
    console.log(`  Server Port: ${config.server.port}`);
    console.log(`  LiveKit URL: ${config.livekit.url}`);
    console.log(`  OpenAI API Key: ${config.openai.apiKey.substring(0, 10)}...`);
    console.log(`  Audio Buffer: ${config.audio.bufferDurationMs}ms`);
    console.log('');

    // Initialize WebSocket translation service
    initTranslationWebSocket(server);

    // Start listening
    server.listen(config.server.port, () => {
      console.log(`✓ Server running on http://localhost:${config.server.port}`);
      console.log(`✓ WebSocket: ws://localhost:${config.server.port}/ws/translate`);
      console.log(`✓ Health check: http://localhost:${config.server.port}/api/health`);
      console.log('');
      console.log('Ready to accept connections!\n');
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 * Stops all workers and closes connections
 */
async function gracefulShutdown(signal: string) {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  try {
    // Cleanup WebSocket sessions
    cleanupAllSessions();
    
    // Close HTTP server
    server.close(() => {
      console.log('[Server] ✓ HTTP server closed');
    });

    console.log('[Server] ✓ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Server] ✗ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();
