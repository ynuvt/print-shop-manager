import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/client.js";

async function main() {
  console.log("Seeding test brands, offers, ads, and coupons...");

  // Delete existing test brand records
  await prisma.brand.deleteMany({
    where: { slug: { in: ["test-cafe", "burger-house"] } },
  });

  const hashedPassword = await bcrypt.hash("password123", 10);

  // 1. Create Test Cafe (Issues coupons)
  const cafeBrand = await prisma.brand.create({
    data: {
      name: "Test Cafe",
      slug: "test-cafe",
      email: "cafe@test.com",
      password: hashedPassword,
      plan: "PRO",
      outlets: {
        create: [
          {
            name: "Main St Cafe Outlet",
            outletCode: "TC-MAIN-001",
            address: "123 Main St, Tech City",
            isActive: true,
            workers: {
              create: [
                {
                  name: "Cafe Worker Alice",
                  phoneNumber: "+919999999999", // standard test number
                  isActive: true,
                },
              ],
            },
          },
        ],
      },
      offers: {
        create: [
          {
            offerType: "FIRST_TIME",
            name: "Welcome Offer 50% Off",
            description: "Get 50% off on your first order with us!",
            discountType: "PERCENTAGE",
            discountValue: 50,
            isActive: true,
            campaignType: "COUPON",
          },
          {
            offerType: "RETURNING",
            name: "Loyalty Flat 20 Off",
            description: "Flat Rs 20 off on your next order",
            discountType: "FLAT",
            discountValue: 20,
            isActive: true,
            campaignType: "COUPON",
          },
        ],
      },
    },
    include: {
      outlets: { include: { workers: true } },
      offers: true,
    },
  });

  // 2. Create Burger House (Featured advertisements)
  const burgerBrand = await prisma.brand.create({
    data: {
      name: "Burger House",
      slug: "burger-house",
      email: "burger@test.com",
      password: hashedPassword,
      plan: "PRO",
      outlets: {
        create: [
          {
            name: "Tech Park Burger Outlet",
            outletCode: "BH-TECH-001",
            address: "456 Tech Park, Tech City",
            isActive: true,
          },
        ],
      },
      offers: {
        create: [
          {
            offerType: "FIRST_TIME",
            name: "Try our Double Cheese Burger!",
            description: "Try our new premium double cheese burger today and get 15% off!",
            discountType: "PERCENTAGE",
            discountValue: 15,
            isActive: true,
            campaignType: "ADVERTISEMENT",
            imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
          },
        ],
      },
    },
    include: {
      outlets: true,
      offers: true,
    },
  });

  console.log("Successfully created Test Cafe & Burger House brands.");

  // 3. Find all users in the system and assign a pre-made coupon from Test Cafe
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users in the database.`);

  const cafeFirstTimeOffer = cafeBrand.offers.find((o) => o.offerType === "FIRST_TIME")!;
  const cafeOutlet = cafeBrand.outlets[0]!;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  for (const user of users) {
    // Generate a unique code
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const code = `CAF-${suffix}`;

    await prisma.coupon.create({
      data: {
        code,
        brandId: cafeBrand.id,
        offerId: cafeFirstTimeOffer.id,
        userId: user.id,
        nearestOutletId: cafeOutlet.id,
        discountType: cafeFirstTimeOffer.discountType,
        discountValue: cafeFirstTimeOffer.discountValue,
        description: cafeFirstTimeOffer.description,
        offerType: "FIRST_TIME",
        validUntil,
        status: "ACTIVE",
      },
    });
    console.log(`Assigned coupon ${code} to user ${user.id}`);
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding test coupons:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
