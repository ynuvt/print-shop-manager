import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/client.js";

async function main() {
  console.log('Cleaning up database brands...');

  // Delete all existing related cascading records first
  await prisma.couponRedemption.deleteMany({});
  await prisma.outletWorker.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.outlet.deleteMany({});
  await prisma.brand.deleteMany({});

  console.log('Creating Kaapi brand...');
  const hashedPassword = await bcrypt.hash('madrasi_kaapi_house', 10);

  const brand = await prisma.brand.create({
    data: {
      name: 'Madrasi Kaapi House',
      slug: 'madrasi_kaapi_house',
      email: 'madrasikaapi@gmail.com',
      password: hashedPassword,
      plan: 'PRO_PLUS',
      logo: 'https://pub-b55502a002314dd5bf5762f4be783cad.r2.dev/brand/madrasi-kaapi/logo_filterkapi.png',
      offers: {
        create: [
          {
            offerType: 'FIRST_TIME',
            name: 'Welcome Offer 10% Off',
            description: 'Get 10% off on your first order with us!',
            discountType: 'PERCENTAGE',
            discountValue: 10,
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
