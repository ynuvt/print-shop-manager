import { Server } from "socket.io";
import connectionManager from "./managers/connectionManager";

const io = new Server(3000, {
  cors: { origin: "*" }, // allow cross-origin for testing
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join a room
  socket.on("joinRoom", (id) => {
    //named it id cause it can be shopId or userId based on the context
    socket.join(id);
    connectionManager.addConnection(socket.id, id);
    console.log(`${socket.id} joined room ${id}`);
  });

  socket.on("disconnect", () => {
    connectionManager.removeConnection(socket.id);
    console.log("User disconnected:", socket.id);
  });
});
