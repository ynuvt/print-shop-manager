import "dotenv/config";
import express from "express";
import cors from "cors";
import v1Routes from "./routes/index.js";
const app = express();
app.use(cors());
app.use(express.json());

app.get("/healthz", (req, res) => {
  res.json({ message: "The backend is healthy!" });
});
app.use("/api/v1", v1Routes);
app.listen(process.env.PORT || 4000, () => {
  console.log(
    `API server running on http://localhost:${process.env.PORT || 4000}`,
  );
});
export default app;
