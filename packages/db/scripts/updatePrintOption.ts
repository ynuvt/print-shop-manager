import { PrismaClient } from '../src/generated/prisma/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// ─── CONFIG — edit these before running ──────────────────────────────────────

const FILE_ID = '1902eb50-5c5a-4033-9281-4291e8d6c7dd'; // <── swap this

const UPDATE = {
  paperSize:     'A4'        as const,
  colorMode:     'BW'        as const,  // 'BW' | 'COLOR'
  orientation:   'PORTRAIT'  as const,  // 'PORTRAIT' | 'LANDSCAPE'
  scaleMode:     'FIT'       as const,  // 'FIT' | 'SHRINK' | 'NOSCALE'
  pageRange:     'ALL'       as const,  // 'ALL' | 'CUSTOM'
  customRange:   undefined   as string | undefined,
  duplex:        'ONE'       as const,  // 'ONE' | 'BOTH'
  copies:        1,
  pagesPerSheet: 2,                     // 1 | 2 | 4 | 6 | 9 | 16
};

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (FILE_ID === 'REPLACE_WITH_FILE_ID') {
    console.error('❌  Please set FILE_ID before running this script.');
    process.exit(1);
  }

  // Check the option exists for this file
  const existing = await prisma.printOption.findUnique({
    where: { fileId: FILE_ID },
  });

  if (!existing) {
    console.error(`❌  No printOption found for fileId: ${FILE_ID}`);
    process.exit(1);
  }

  console.log('📄  Current printOption:');
  console.log(existing);

  const updated = await prisma.printOption.update({
    where: { fileId: FILE_ID },
    data: UPDATE,
  });

  console.log('\n✅  Updated printOption:');
  console.log(updated);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
