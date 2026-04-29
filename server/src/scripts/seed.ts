import { db, schema } from '../db/client.js';

// Per-currency prices: each currency stands on its own (no oracle conversion).
// IPE prices favor token holders; USDC and BRL track market.
// Stored as strings because drizzle's numeric(mode:bigint) expects string on insert.
const PRICES = {
  tshirt:  { ipe: (50n  * 10n ** 18n).toString(), usdc: (30n  * 10n ** 6n).toString(), brl: 15000n  },
  hoodie:  { ipe: (120n * 10n ** 18n).toString(), usdc: (80n  * 10n ** 6n).toString(), brl: 40000n  },
  cup:     { ipe: (25n  * 10n ** 18n).toString(), usdc: (15n  * 10n ** 6n).toString(), brl: 7500n   },
  cap:     { ipe: (40n  * 10n ** 18n).toString(), usdc: (25n  * 10n ** 6n).toString(), brl: 12500n  },
};

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
      priceIpe: PRICES.tshirt.ipe,
      priceUsdc: PRICES.tshirt.usdc,
      priceBrl: PRICES.tshirt.brl,
      maxSupply: '100',
      royaltyBps: 500,
      physicalStock: 100,
      pickupAvailable: true,
      shippingAvailable: true,
    },
    {
      name: 'Ipê Hoodie',
      description: 'Mid-weight pullover hoodie in champagne yellow.',
      category: 'hoodie',
      imageUrl: PLACEHOLDER('Ipê%20Hoodie'),
      priceIpe: PRICES.hoodie.ipe,
      priceUsdc: PRICES.hoodie.usdc,
      priceBrl: PRICES.hoodie.brl,
      maxSupply: '50',
      royaltyBps: 500,
      physicalStock: 50,
      pickupAvailable: true,
      shippingAvailable: true,
    },
    {
      name: 'Ipê Cup',
      description: 'Ceramic 350ml mug with the passport sigil.',
      category: 'cup',
      imageUrl: PLACEHOLDER('Ipê%20Cup'),
      priceIpe: PRICES.cup.ipe,
      priceUsdc: PRICES.cup.usdc,
      priceBrl: PRICES.cup.brl,
      maxSupply: '200',
      royaltyBps: 500,
      physicalStock: 200,
      pickupAvailable: true,
      shippingAvailable: true,
    },
    {
      name: 'Ipê Cap',
      description: 'Embroidered low-profile dad cap.',
      category: 'cap',
      imageUrl: PLACEHOLDER('Ipê%20Cap'),
      priceIpe: PRICES.cap.ipe,
      priceUsdc: PRICES.cap.usdc,
      priceBrl: PRICES.cap.brl,
      maxSupply: '80',
      royaltyBps: 500,
      physicalStock: 80,
      pickupAvailable: true,
      shippingAvailable: true,
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
