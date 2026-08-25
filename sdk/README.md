# @king/sdk

A TypeScript client for the constitutional monarchy contracts. It deploys the
governance contracts to a local chain and wraps them in typed helpers, so you
can drive the constitution — bills, confidence votes, justice appointments,
elections, referendums, budgets — from TypeScript instead of Solidity.

Built on [viem](https://viem.sh). The test suite is a TypeScript port of the
Foundry tests: 638 tests over the eight core contracts.

## Requirements

- Node.js 20 or later
- [Foundry](https://book.getfoundry.sh/) — both `forge` and `anvil` on your PATH

## Setup

The SDK reads contract ABIs and bytecode from Foundry's build output at import
time, so **the contracts must be built first**:

```shell
cd contracts
forge build
```

Then install and run:

```shell
cd sdk
npm ci
npm test          # vitest, 638 tests
npm run build     # tsc --noEmit, typecheck only
```

Do not start Anvil yourself. `test/setup/globalSetup.ts` spawns it on port
8545 and stops it afterwards; a manually started instance causes an "address
already in use" conflict.

## Usage

`deployGov` follows the deployment sequence from `TestBase.sol`: deploy
`Constitution`, deploy the nine other governance contracts plus a mock ballot
verifier against it, then register all their addresses in the Constitution
registry.

```ts
import { createAnvilClients, deployGov } from '@king/sdk/client';

const { publicClient, walletClient } = createAnvilClients(
  'http://127.0.0.1:8545',
  deployerAddress,
);

const { contracts, addresses } = await deployGov(publicClient, walletClient);

await contracts.parliament.write('submitBill', [billHash, 'Tax Reform']);
const count = await contracts.parliament.read('billCount');
```

Every contract wrapper exposes `read(fn, args)`, `write(fn, args)` and
`encode(fn, args)`. `write` guards both ends of a transaction: it simulates
first, so a revert throws with the decoded error, and it checks the receipt
afterwards, so a transaction that simulates cleanly but reverts when mined
raises rather than passing silently. It also sends 25% above the gas estimate,
because estimation and execution happen in different blocks and a function
whose cost depends on block-level values can be more expensive when mined.

`deployGov` stops at registry initialization. Coronation, seating members of
parliament, forming a government and the other setup an actual scenario needs
live in the test fixtures (`test/setup/fixtures.ts` and `test/setup/mixins.ts`).
Those are not exported from the package, but they are the reference for how each
sequence is driven.

## Known limitations

**Node only.** `src/abi/index.ts` uses `node:fs` to read `contracts/out/` at
import time, so the package cannot be bundled for a browser as it stands. A
browser build would need the artifacts inlined.

**Anvil runs with a raised code-size limit.** `globalSetup.ts` passes
`--code-size-limit 100000` because three contracts exceed the EIP-170 limit of
24,576 bytes: Parliament (36,153), Crown (28,914) and SupremeCourt (28,865).
They deploy fine against a local node configured this way, and will not deploy
to a chain that enforces the standard limit.
