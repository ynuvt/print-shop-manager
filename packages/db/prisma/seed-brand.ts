// Seed script: creates a test brand with outlets, workers, and offers
// Run: cd packages/db && npx tsx prisma/seed-brand.ts

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding brand data...\n");

  // 1. Create Brand
  const hashedPassword = await bcrypt.hash("test1234", 10);

  const brand = await prisma.brand.upsert({
    where: { email: "kaapi@test.com" },
    update: {},
    create: {
      name: "Madrasi Kaapi House",
      slug: "madrasi-kaapi",
      email: "kaapi@test.com",
      password: hashedPassword,
      plan: "PRO_PLUS",
      logo: null,
    },
  });
  console.log(`✅ Brand: ${brand.name} (${brand.email})`);
  console.log(`   ID: ${brand.id}`);
  console.log(`   Plan: ${brand.plan}`);

  // 2. Create Outlets
  const outlet1 = await prisma.outlet.upsert({
    where: { outletCode: "MKH-KRM-01" },
    update: {},
    create: {
      brandId: brand.id,
      name: "Koramangala Branch",
      address: "1st Block, Koramangala, Bangalore",
      outletCode: "MKH-KRM-01",
      latitude: 12.9352,
      longitude: 77.6245,
      mapLink: "https://maps.google.com/?q=12.9352,77.6245",
    },
  });

  const outlet2 = await prisma.outlet.upsert({
    where: { outletCode: "MKH-IND-01" },
    update: {},
    create: {
      brandId: brand.id,
      name: "Indiranagar Branch",
      address: "100 Feet Road, Indiranagar, Bangalore",
      outletCode: "MKH-IND-01",
      latitude: 12.9784,
      longitude: 77.6408,
      mapLink: "https://maps.google.com/?q=12.9784,77.6408",
    },
  });

  console.log(`✅ Outlets: ${outlet1.name}, ${outlet2.name}`);

  // 3. Create Workers
  const worker1 = await prisma.outletWorker.upsert({
    where: { phoneNumber: "919876543210" },
    update: {},
    create: {
      outletId: outlet1.id,
      name: "Ravi Kumar",
      phoneNumber: "919876543210",
    },
  });

  const worker2 = await prisma.outletWorker.upsert({
    where: { phoneNumber: "919876543211" },
    update: {},
    create: {
      outletId: outlet2.id,
      name: "Priya Singh",
      phoneNumber: "919876543211",
    },
  });

  console.log(`✅ Workers: ${worker1.name} (${outlet1.name}), ${worker2.name} (${outlet2.name})`);

  // 4. Create Offers
  const firstTimeOffer = await prisma.brandOffer.upsert({
    where: { brandId_offerType: { brandId: brand.id, offerType: "FIRST_TIME" } },
    update: {},
    create: {
      brandId: brand.id,
      offerType: "FIRST_TIME",
      name: "Welcome to Kaapi!",
      description: "Get 15% off on your first visit",
      discountType: "PERCENTAGE",
      discountValue: 15,
      isActive: true,
    },
  });

  const returningOffer = await prisma.brandOffer.upsert({
    where: { brandId_offerType: { brandId: brand.id, offerType: "RETURNING" } },
    update: {},
    create: {
      brandId: brand.id,
      offerType: "RETURNING",
      name: "Kaapi Regular Reward",
      description: "Flat ₹20 off for loyal customers",
      discountType: "FLAT",
      discountValue: 20,
      isActive: true,
    },
  });

  console.log(`✅ Offers: First-time (${firstTimeOffer.discountValue}% OFF), Returning (₹${returningOffer.discountValue} OFF)`);



  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔑 LOGIN CREDENTIALS:");
  console.log("   Email:    kaapi@test.com");
  console.log("   Password: test1234");
  console.log("   URL:      http://localhost:5173/brand/login");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
