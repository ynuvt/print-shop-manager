
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

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

  const total = jobs.length;
  const completed = jobs.filter(j => j.status === 'COMPLETED').length;

  console.log(`User ID: ${userId}`);
  console.log(`Total Jobs: ${total}`);
  console.log(`Completed Jobs: ${completed}`);
  console.log('\nRecent Jobs:');
  jobs.forEach(j => {
    console.log(`- ID: ${j.id}, Status: ${j.status}, CreatedAt: ${j.createdAt}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
