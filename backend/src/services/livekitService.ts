
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config/config';
import { TokenRequest, TokenResponse, ParticipantMetadata } from '../types';

/**
 * LiveKit Room Service Client
 * Used for server-side operations like listing rooms, participants, etc.
 */
export const roomService = new RoomServiceClient(
  config.livekit.url,
  config.livekit.apiKey,
  config.livekit.apiSecret
);

/**
 * Generate an access token for a participant to join a room
 * 
 * @param request - Token request with room name, participant name, and target language
 * @returns Token response with JWT and connection details
 */
export async function generateAccessToken(
  request: TokenRequest
): Promise<TokenResponse> {
  const { roomName, participantName, targetLanguage } = request;

  // Create participant metadata (stored in LiveKit and accessible by all clients)
  const metadata: ParticipantMetadata = {
    targetLanguage,
    isTranslatedTrack: false
  };

  // Create access token
  const token = new AccessToken(
    config.livekit.apiKey,
    config.livekit.apiSecret,
    {
      // Unique identity for this participant
      identity: `${participantName}_${Date.now()}`,
      
      // Human-readable name (displayed in UI)
      name: participantName,
      
      // Custom metadata (target language preference)
      metadata: JSON.stringify(metadata)
    }
  );

  // Grant permissions
  token.addGrant({
    roomJoin: true,              // Can join the room
    room: roomName,              // Specific room name
    canPublish: true,            // Can publish audio/video tracks
    canSubscribe: true,          // Can subscribe to other participants
    canPublishData: true         // Can send data messages
  });

  // Generate JWT
  const jwt = await token.toJwt();

  console.log(`[LiveKit] Generated token for ${participantName} in room ${roomName}`);
  console.log(`[LiveKit] Target language: ${targetLanguage}`);

  return {
    token: jwt,
    url: config.livekit.url,
    roomName
  };
}

/**
 * List all active rooms
 * Useful for debugging and monitoring
 */
export async function listRooms(): Promise<string[]> {
  try {
    const rooms = await roomService.listRooms();
    return rooms.map(room => room.name || 'unknown');
  } catch (error) {
    console.error('[LiveKit] Error listing rooms:', error);
    return [];
  }
}

/**
 * Get participants in a specific room
 * 
 * @param roomName - Name of the room
 * @returns Array of participant information
 */
export async function getRoomParticipants(roomName: string) {
  try {
    const participants = await roomService.listParticipants(roomName);
    return participants.map(p => ({
      id: p.identity,
      name: p.name || 'Unknown',
      metadata: p.metadata ? JSON.parse(p.metadata) as ParticipantMetadata : null,
      tracks: p.tracks.length
    }));
  } catch (error) {
    console.error(`[LiveKit] Error getting participants for room ${roomName}:`, error);
    return [];
  }
}

/**
 * Create or get a room
 * Ensures a room exists before starting translation workers
 * 
 * @param roomName - Name of the room to create/get
 */
export async function ensureRoom(roomName: string): Promise<void> {
  try {
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // Room closes 5 minutes after last participant leaves
      maxParticipants: 50 // Limit for this demo
    });
    console.log(`[LiveKit] Room created/verified: ${roomName}`);
  } catch (error: any) {
    // Room might already exist - that's okay
    if (error?.message?.includes('already exists')) {
      console.log(`[LiveKit] Room already exists: ${roomName}`);
    } else {
      console.error(`[LiveKit] Error creating room ${roomName}:`, error);
    }
  }
}

/**
 * Delete a room (cleanup)
 * 
 * @param roomName - Name of the room to delete
 */
export async function deleteRoom(roomName: string): Promise<void> {
  try {
    await roomService.deleteRoom(roomName);
    console.log(`[LiveKit] Room deleted: ${roomName}`);
  } catch (error) {
    console.error(`[LiveKit] Error deleting room ${roomName}:`, error);
  }
}

/**
 * Get connection URL for WebSocket
 * Converts ws:// to appropriate protocol based on environment
 */
export function getConnectionUrl(): string {
  return config.livekit.url;
}

