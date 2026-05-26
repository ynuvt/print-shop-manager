import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/client.js";

async function main() {
  console.log('Seeding brand data...');

  await prisma.brand.deleteMany({
    where: { slug: 'test-brand' }
  });

  const hashedPassword = await bcrypt.hash('password123', 10);

  const brand = await prisma.brand.create({
    data: {
      name: 'Test Brand',
      slug: 'test-brand',
      email: 'admin@testbrand.com',
      password: hashedPassword,
      plan: 'PRO',
      outlets: {
        create: [
          {
            name: 'Main Street Outlet',
            outletCode: 'TB-MAIN-001',
            address: '123 Main St, Tech City',
            isActive: true,
            workers: {
              create: [
                {
                  name: 'Alice Worker',
                  phoneNumber: '+1234567890',
                  isActive: true,
                },
                {
                  name: 'Bob Worker',
                  phoneNumber: '+1987654321',
                  isActive: true,
                }
              ]
            }
          }
        ]
      },
      offers: {
        create: [
          {
            offerType: 'FIRST_TIME',
            name: 'Welcome Offer 50% Off',
            description: 'Get 50% off on your first order with us!',
            discountType: 'PERCENTAGE',
            discountValue: 50,
            isActive: true,
          },
          {
            offerType: 'RETURNING',
            name: 'Loyalty Flat 20 Off',
            description: 'Flat Rs 20 off on your next order',
            discountType: 'FLAT',
            discountValue: 20,
            isActive: true,
          }
        ]
      },
    },
    include: {
      outlets: {
        include: {
          workers: true
        }
      },
      offers: true,
    }
  });

  console.log('Successfully created test brand with outlets, workers, and offers:');
  console.log(JSON.stringify(brand, null, 2));


}

main()
  .catch((e) => {
    console.error('Error seeding brand:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
