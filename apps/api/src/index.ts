import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import v1Routes from "./routes/index.js";
const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDistPath = path.resolve(__dirname, "../../web/dist");
const webIndexPath = path.join(webDistPath, "index.html");

app.get("/healthz", (req, res) => {
  res.json({ message: "The backend is healthy!" });
});
app.use("/api/v1", v1Routes);

if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));

  // Let React Router handle non-API routes in the browser.
  app.get(/^(?!\/api\/v1|\/healthz).*/, (req, res) => {
    res.sendFile(webIndexPath);
  });
}

app.listen(process.env.PORT || 4000, () => {
  console.log(
    `API server running on http://localhost:${process.env.PORT || 4000}`,
  );
});
export default app;
