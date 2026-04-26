import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "../config";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: true,
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
