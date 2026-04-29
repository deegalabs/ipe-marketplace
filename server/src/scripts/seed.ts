import { db, schema } from '../db/client.js';

const PRICE_50 = 50n * 10n ** 18n;
const PRICE_120 = 120n * 10n ** 18n;
const PRICE_25 = 25n * 10n ** 18n;
const PRICE_40 = 40n * 10n ** 18n;

const PLACEHOLDER = (label: string) =>
  `https://placehold.co/600x600/0a3a2f/f8f5ec?text=${encodeURIComponent(label)}`;

async function main() {
  const existing = await db.query.products.findMany();
  if (existing.length > 0) {
    console.log(`[seed] already have ${existing.length} products, skipping`);
    return;
  }

  await db.insert(schema.products).values([
    {
      name: 'Ipê T-Shirt',
      description: 'Heavyweight cotton tee with the ipê.city wordmark.',
      category: 't-shirt',
      imageUrl: PLACEHOLDER('Ipê%20Tee'),
      priceIpe: PRICE_50,
      maxSupply: 100n,
      royaltyBps: 500,
      physicalStock: 100,
    },
    {
      name: 'Ipê Hoodie',
      description: 'Mid-weight pullover hoodie in champagne yellow.',
      category: 'hoodie',
      imageUrl: PLACEHOLDER('Ipê%20Hoodie'),
      priceIpe: PRICE_120,
      maxSupply: 50n,
      royaltyBps: 500,
      physicalStock: 50,
    },
    {
      name: 'Ipê Cup',
      description: 'Ceramic 350ml mug with the passport sigil.',
      category: 'cup',
      imageUrl: PLACEHOLDER('Ipê%20Cup'),
      priceIpe: PRICE_25,
      maxSupply: 200n,
      royaltyBps: 500,
      physicalStock: 200,
    },
    {
      name: 'Ipê Cap',
      description: 'Embroidered low-profile dad cap.',
      category: 'cap',
      imageUrl: PLACEHOLDER('Ipê%20Cap'),
      priceIpe: PRICE_40,
      maxSupply: 80n,
      royaltyBps: 500,
      physicalStock: 80,
    },
  ]);
  console.log('[seed] inserted 4 products');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
