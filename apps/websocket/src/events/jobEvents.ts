import { Server, Socket } from "socket.io";

function jobEvents(socket: Socket, io: Server) {
  socket.on("job-created", (shopId: string) => {
    console.log(`Job created for shop ${shopId}`);
    io.to(shopId).emit("jobCreated", shopId);
  });
  socket.on("job-status-updated", (userId: string) => {
    console.log(`Job updated for shop ${userId}`);
    io.to(userId).emit("jobUpdated", userId);
  });
}
