import { Router } from 'express';
import { erc20Abi } from 'viem';
import { publicClient, ipeMarketAddress, ipeTokenAddress, usdcTokenAddress } from '../chain.js';

export const treasuryRouter = Router();

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const isReal = (a: string) => !!a && a.toLowerCase() !== ZERO_ADDRESS;

treasuryRouter.get('/', async (_req, res) => {
  // In gateway-only deploys the contract addresses are placeholder zeros —
  // the chain calls below would error out. Return an empty treasury view so
  // the admin page renders without crashing the server.
  if (!isReal(ipeMarketAddress)) {
    return res.json({
      treasuryAddress: null,
      configured: false,
      balances: [],
      note: 'Onchain contracts not deployed yet — IPE_MARKET_ADDRESS is the zero address.',
    });
  }

  try {
    const treasury = (await publicClient.readContract({
      address: ipeMarketAddress,
      abi: [{ type: 'function', name: 'treasury', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }],
      functionName: 'treasury',
    })) as `0x${string}`;

    const tokens = [
      { symbol: 'IPE', address: ipeTokenAddress, decimals: 18 },
      { symbol: 'USDC', address: usdcTokenAddress, decimals: 6 },
    ].filter((t) => isReal(t.address));

    const balances = await Promise.all(
      tokens.flatMap(({ symbol, address, decimals }) => [
        publicClient
          .readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [treasury] })
          .then((v) => ({ symbol, decimals, location: 'treasury', balance: (v as bigint).toString() })),
        publicClient
          .readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [ipeMarketAddress] })
          .then((v) => ({ symbol, decimals, location: 'contract', balance: (v as bigint).toString() })),
      ]),
    );

    res.json({ treasuryAddress: treasury, configured: true, balances });
  } catch (err) {
    // Swallow chain errors so a misconfigured RPC / unreachable contract
    // doesn't crash the entire server. Surface a useful message to the admin UI.
    console.error('[treasury] read failed', err instanceof Error ? err.message : err);
    res.status(503).json({
      error: 'treasury read failed — contract unreachable or not deployed',
      treasuryAddress: null,
      configured: false,
      balances: [],
    });
  }
});
