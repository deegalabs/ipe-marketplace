#!/usr/bin/env node
// Copies ABIs from contracts/out into shared/src/abi as TS modules.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const outDir = resolve(here, '..', 'src', 'abi');
mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'IpeMarket', path: 'contracts/out/IpeMarket.sol/IpeMarket.json' },
  { name: 'MockIPE', path: 'contracts/out/MockIPE.sol/MockIPE.json' },
  { name: 'MockUSDC', path: 'contracts/out/MockUSDC.sol/MockUSDC.json' },
];

for (const { name, path } of targets) {
  const artifact = JSON.parse(readFileSync(resolve(root, path), 'utf-8'));
  const content = `// Auto-generated from ${path}. Do not edit by hand.\nexport const ${name}Abi = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`;
  writeFileSync(resolve(outDir, `${name}.ts`), content);
  console.log(`wrote ${name}.ts (${artifact.abi.length} entries)`);
}

const indexContent = targets.map(({ name }) => `export { ${name}Abi } from './${name}.js';`).join('\n') + '\n';
writeFileSync(resolve(outDir, 'index.ts'), indexContent);
console.log('wrote index.ts');
