import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const content = fs.readFileSync('src/routes/oldanalysisdata.js', 'utf8');
  
  // Fix the syntax error at the very beginning
  let fixedContent = content.replace(/^const thir{/, 'const data1 = {');
  
  // To avoid evaluating blindly, let's just use eval to grab the objects.
  // We'll append an export statement.
  fixedContent += '\nmodule.exports = { data1 };\n';
  
  // But wait, there might be multiple variables. Let's see what variables there are.
  const variableDeclarations = [...fixedContent.matchAll(/const ([a-zA-Z0-9_]+)\s*=\s*{/g)];
  console.log("Found variables:", variableDeclarations.map(m => m[1]));
}

main().catch(console.error);
