import { Server } from "socket.io";
import connectionManager from "./managers/connectionManager";
import { jobEvents } from "./events/jobEvents";

const io = new Server(3000, {
  cors: { origin: "*" }, // allow cross-origin for testing
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join a room
  socket.on("join-room", (id) => {
    //named it id cause it can be shopId or userId based on the context
    socket.join(id);
    connectionManager.addConnection(socket.id, id);
    console.log(`${socket.id} joined room ${id}`);
  });
  jobEvents(socket, io);
  socket.on("leave-room", (id) => {
    socket.leave(id);
    connectionManager.removeConnection(socket.id);
    console.log(`${socket.id} left room ${id}`);
  });
  socket.on("disconnect", () => {
    connectionManager.removeConnection(socket.id);
    console.log("User disconnected:", socket.id);
  });
});
