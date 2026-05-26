import { prisma } from "../src/client";

async function main() {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'PrintShop'
    `;
    console.log("=== COLUMNS IN DATABASE FOR PrintShop ===");
    console.log(columns);
    console.log("=========================================");
  } catch (error) {
    console.error("Failed to query table info:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
