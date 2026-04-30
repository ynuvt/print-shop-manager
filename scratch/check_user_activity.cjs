
const { PrismaClient } = require('../packages/db/dist/generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const userId = '7aa55cf0-af2c-407f-91ca-f49fc0840306';
  const jobs = await prisma.printJob.findMany({
    where: {
      OR: [
        { userId: userId },
        { userMetadataId: userId }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(jobs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
