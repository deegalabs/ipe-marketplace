import { formatUnits } from 'viem';

export const formatIpe = (raw: string | bigint, decimals = 18) =>
  `${Number(formatUnits(BigInt(raw), decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} IPE`;
