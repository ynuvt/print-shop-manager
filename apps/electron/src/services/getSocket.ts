// getSocket.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
const SOCKET_BASE = (
  import.meta.env.VITE_SOCKET_BASE_URL ?? "https://zopysocket.devlocstudio.in"
).replace(/\/$/, "");

export function getSocket(): Socket {
  if (!socket) {
    // Create the socket connection only once
    socket = io(SOCKET_BASE, {
      transports: ["websocket"], // use websocket transport
      autoConnect: true, // automatically connect
    });

    socket.on("connect", () => {
      console.log("Connected to WebSocket server:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason);
    });
  }

  return socket;
}
