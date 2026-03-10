import express from "express";
import cors from "cors";
import jobRoutes from "./routes/jobRoutes";
import authMiddleware from "./middleware/authMiddleware";
const app = express();
app.use(cors());
app.use(express.json());

app.get("/healthz", (req, res) => {
  res.json({ message: "The backend is healthy!" });
});
app.use("/api/jobs", jobRoutes);

export default app;
