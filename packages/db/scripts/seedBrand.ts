import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/client.js";

async function main() {
  console.log('Cleaning up database brands...');

  // Delete all existing brands (and their related cascading records)
  await prisma.brand.deleteMany({});

  console.log('Creating Kaapi brand...');
  const hashedPassword = await bcrypt.hash('kapikapi', 10);

  const brand = await prisma.brand.create({
    data: {
      name: 'Kaapi',
      slug: 'kaapi',
      email: 'kaapi@gmail.com',
      password: hashedPassword,
      plan: 'PRO_PLUS',
      logo: 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&w=150&q=80',
      offers: {
        create: [
          {
            offerType: 'FIRST_TIME',
            name: 'Welcome Offer 50% Off',
            description: 'Get 50% off on your first order with us!',
            discountType: 'PERCENTAGE',
            discountValue: 50,
            isActive: true,
            campaignType: 'COUPON',
          },
          {
            offerType: 'RETURNING',
            name: 'Loyalty Flat 20 Off',
            description: 'Flat Rs 20 off on your next order',
            discountType: 'FLAT',
            discountValue: 20,
            isActive: true,
            campaignType: 'COUPON',
          }
        ]
      },
    },
    include: {
      offers: true,
    }
  });

  console.log('Successfully created Kaapi brand:');
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
