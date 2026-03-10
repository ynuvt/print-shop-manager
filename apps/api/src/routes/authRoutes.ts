import express from "express";
import { generateUserToken } from "../utils/token.js";

const router = express.Router();

router.get("/register", (req, res) => {
  // In version 1, no real registration logic
  // Just generate a unique token
  const token = generateUserToken();

  res.status(200).json({
    message: "Registration successful!",
    token,
  });
});

export default router;
