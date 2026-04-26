import { Server } from "socket.io";
import connectionManager from "./managers/connectionManager";
import { jobEvents } from "./events/jobEvents";

// Process-level crash guards — prevent the server from dying on unexpected errors
process.on("uncaughtException", (err) => {
  console.error("[WEBSOCKET UNCAUGHT EXCEPTION]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[WEBSOCKET UNHANDLED REJECTION]", reason);
});

const io = new Server(4001, {
  cors: { origin: "*" }, // allow cross-origin for testing
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join a room
  socket.on("join-room", (id) => {
    try {
      //named it id cause it can be shopId or userId based on the context
      socket.join(id);
      connectionManager.addConnection(socket.id, id);
      console.log(`${socket.id} joined room ${id}`);
    } catch (err) {
      console.error("[join-room error]", err);
    }
  });
  jobEvents(socket, io);
  socket.on("leave-room", (id) => {
    try {
      socket.leave(id);
      connectionManager.removeConnection(socket.id);
      console.log(`${socket.id} left room ${id}`);
    } catch (err) {
      console.error("[leave-room error]", err);
    }
  });
  socket.on("disconnect", () => {
    try {
      connectionManager.removeConnection(socket.id);
      console.log("User disconnected:", socket.id);
    } catch (err) {
      console.error("[disconnect error]", err);
    }
  });
});
