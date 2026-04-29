import { Router } from 'express';
import { erc20Abi } from 'viem';
import { publicClient, ipeMarketAddress, ipeTokenAddress, usdcTokenAddress } from '../chain.js';

export const treasuryRouter = Router();

treasuryRouter.get('/', async (_req, res) => {
  const treasury = (await publicClient.readContract({
    address: ipeMarketAddress,
    abi: [{ type: 'function', name: 'treasury', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }],
    functionName: 'treasury',
  })) as `0x${string}`;

  const tokens = [
    { symbol: 'IPE', address: ipeTokenAddress, decimals: 18 },
    { symbol: 'USDC', address: usdcTokenAddress, decimals: 6 },
  ];

  const balances = await Promise.all(
    tokens.flatMap(({ symbol, address, decimals }) => [
      publicClient.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [treasury] })
        .then((v) => ({ symbol, decimals, location: 'treasury', balance: (v as bigint).toString() })),
      publicClient.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [ipeMarketAddress] })
        .then((v) => ({ symbol, decimals, location: 'contract', balance: (v as bigint).toString() })),
    ]),
  );

  res.json({ treasuryAddress: treasury, balances });
});
