import { Router } from 'express';
import { erc20Abi } from 'viem';
import { publicClient, ipeMarketAddress, ipeTokenAddress } from '../chain.js';

export const treasuryRouter = Router();

treasuryRouter.get('/', async (_req, res) => {
  const [marketBalance, marketTreasury] = await Promise.all([
    publicClient.readContract({
      address: ipeTokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [ipeMarketAddress],
    }),
    publicClient.readContract({
      address: ipeMarketAddress,
      abi: [{ type: 'function', name: 'treasury', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }],
      functionName: 'treasury',
    }),
  ]);

  const treasuryBalance = await publicClient.readContract({
    address: ipeTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [marketTreasury],
  });

  res.json({
    treasuryAddress: marketTreasury,
    treasuryBalanceIpe: treasuryBalance.toString(),
    marketContractBalanceIpe: marketBalance.toString(),
  });
});
