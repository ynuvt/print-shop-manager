import "dotenv/config";
import { prisma } from "@printowl/db";
import jwt from "jsonwebtoken";

async function run() {
  try {
    const user = await prisma.user.findFirst();
    console.log("Found user:", user);
    if (!user) {
      console.log("No users found in database");
      return;
    }
    const token = jwt.sign(
      {
        uid: user.id,
        role: "customer",
        createdAt: Date.now(),
      },
      process.env.JWT_SECRET || "supersecretkey"
    );
    console.log("Generated token:", token);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}
run();
