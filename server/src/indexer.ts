import { eq, and } from 'drizzle-orm';
import { IpeMarketAbi } from '@ipe/shared';
import { publicClient, ipeMarketAddress } from './chain.js';
import { db, schema } from './db/client.js';
import { env } from './env.js';

const STATE_KEY = 'purchased';

async function getCursor(): Promise<bigint> {
  const row = await db.query.indexerState.findFirst({ where: eq(schema.indexerState.id, STATE_KEY) });
  return row?.lastBlock ?? env.INDEXER_START_BLOCK;
}

async function setCursor(block: bigint) {
  await db
    .insert(schema.indexerState)
    .values({ id: STATE_KEY, lastBlock: block })
    .onConflictDoUpdate({ target: schema.indexerState.id, set: { lastBlock: block, updatedAt: new Date() } });
}

async function tick() {
  const fromBlock = (await getCursor()) + 1n;
  const head = await publicClient.getBlockNumber();
  if (head < fromBlock) return;

  // Both Purchased (crypto) and FiatMinted (PIX) flip an order from pending → paid.
  // We listen to both and reconcile by paymentRef = txHash.
  const [purchasedLogs, fiatMintedLogs] = await Promise.all([
    publicClient.getContractEvents({
      address: ipeMarketAddress,
      abi: IpeMarketAbi,
      eventName: 'Purchased',
      fromBlock,
      toBlock: head,
    }),
    publicClient.getContractEvents({
      address: ipeMarketAddress,
      abi: IpeMarketAbi,
      eventName: 'FiatMinted',
      fromBlock,
      toBlock: head,
    }),
  ]);

  for (const log of [...purchasedLogs, ...fiatMintedLogs]) {
    const txHash = log.transactionHash;
    if (!txHash) continue;

    const result = await db
      .update(schema.orders)
      .set({ status: 'paid', blockNumber: log.blockNumber, updatedAt: new Date() })
      .where(and(eq(schema.orders.paymentRef, txHash), eq(schema.orders.status, 'pending')))
      .returning({ id: schema.orders.id });

    if (result.length > 0) {
      console.log(`[indexer] order ${result[0]!.id} marked paid (tx ${txHash})`);
    }
  }

  await setCursor(head);
}

export function startIndexer() {
  const run = async () => {
    try {
      await tick();
    } catch (err) {
      console.error('[indexer] tick failed', err);
    }
  };
  void run();
  setInterval(run, env.INDEXER_POLL_INTERVAL_MS);
  console.log(`[indexer] polling every ${env.INDEXER_POLL_INTERVAL_MS}ms from block ${env.INDEXER_START_BLOCK}`);
}
