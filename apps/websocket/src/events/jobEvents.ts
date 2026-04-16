import { Server, Socket } from "socket.io";

export function jobEvents(socket: Socket, io: Server) {
  socket.on("job-created", (shopId: string) => {
    console.log(`Job created for shop ${shopId}`);
    io.to(shopId).emit("job-created", shopId);
  });
  socket.on(
    "job-status-updated",
    (userId: string, jobId: string, msg: string) => {
      console.log(`Job updated for shop ${userId}`);
      io.to(userId).emit("job-status-updated", userId, jobId, msg);
    },
  );
  //Join user to listed to specific job updates like file added, processing started, etc
  socket.on("join-job-updates", (jobId: string) => {
    socket.join(jobId);
    console.log(`${socket.id} joined job updates for job ${jobId}`);
  });

  socket.on("leave-job-updates", (jobId: string) => {
    socket.leave(jobId);
    console.log(`${socket.id} left job updates for job ${jobId}`);
  });

  socket.on("job-file-added", (jobId: string) => {
    io.to(jobId).emit("job-file-added", jobId);
  });
}
