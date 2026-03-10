import { io, Socket } from "socket.io-client";

declare global {
  // Allows storing the socket globally to persist across module reloads (dev only)
  var __socket__: Socket | undefined;
}

// Only create one socket instance
const socket: Socket =
  global.__socket__ ||
  io(process.env.socket_url, {
    autoConnect: true, // connect automatically
    reconnection: true,
  });

// Store it globally in dev to avoid multiple connections on hot reload
if (process.env.NODE_ENV !== "production") {
  global.__socket__ = socket;
}

export default socket;
