// getSocket.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Create the socket connection only once
    socket = io("http://localhost:3000", {
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
