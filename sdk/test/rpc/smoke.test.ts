/**
 * Smoke test — verifies SDK foundation works against Anvil.
 *
 * Deploys all contracts, performs coronation, registers citizens,
 * then reads state back to confirm everything matches TestBase.sol.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupGovBase, type GovTestEnv } from '../setup/fixtures.js';
import { setupMajlis, setupGovernment, setupSenate, setupJustices } from '../setup/mixins.js';

describe('SDK Smoke Test', () => {
  let env: GovTestEnv;

  beforeAll(async () => {
    env = await setupGovBase();
  }, 120_000);

  it('deploys all contracts at non-zero addresses', () => {
    const { addresses } = env;
    for (const [name, addr] of Object.entries(addresses)) {
      expect(addr).not.toBe('0x0000000000000000000000000000000000000000');
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it('monarch is set after coronation', async () => {
    const roleMonarch = await env.contracts.constitution.read('ROLE_MONARCH');
    const monarch = await env.contracts.constitution.read('getRole', [roleMonarch]);
    expect((monarch as string).toLowerCase()).toBe(env.actors.monarchAddr.toLowerCase());
  });

  it('registers 9 citizens', async () => {
    const count = await env.contracts.registry.read('citizenCount');
    expect(count).toBe(9n);
  });

  it('verifies citizen registration', async () => {
    const isCitizen = await env.contracts.registry.read('isCitizen', [env.actors.citizen1]);
    expect(isCitizen).toBe(true);
  });

  it('initializes 3 provinces', async () => {
    const count = await env.contracts.pc.read('provinceCount');
    expect(count).toBe(3n);
  });

  it('assigns provinces correctly', async () => {
    const prov6 = await env.contracts.registry.read('citizenProvince', [env.actors.citizen6]);
    const prov7 = await env.contracts.registry.read('citizenProvince', [env.actors.citizen7]);
    const provPm = await env.contracts.registry.read('citizenProvince', [env.actors.pmCandidate]);
    expect(Number(prov6 as any)).toBe(2);
    expect(Number(prov7 as any)).toBe(2);
    expect(Number(provPm as any)).toBe(3);
  });

  it('reads constitution parameters', async () => {
    const paramKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const value = await env.contracts.constitution.read('getParameter', [paramKey]);
    expect(Number(value as bigint)).toBeGreaterThan(0);
  });

  it('crown is not suspended', async () => {
    const suspended = await env.contracts.crown.read('suspended');
    expect(suspended).toBe(false);
  });
});

describe('Mixin: Majlis', () => {
  let env: GovTestEnv;

  beforeAll(async () => {
    env = await setupGovBase();
    await setupMajlis(env);
  }, 120_000);

  it('seats 5 Majlis members', async () => {
    const count = await env.contracts.parliament.read('majlisMemberCount');
    expect(count).toBe(5n);
  });

  it('citizen1-5 are Majlis members', async () => {
    for (const c of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3, env.actors.citizen4, env.actors.citizen5]) {
      const isMember = await env.contracts.parliament.read('isMajlisMember', [c]);
      expect(isMember).toBe(true);
    }
  });
});

describe('Mixin: Government', () => {
  let env: GovTestEnv;

  beforeAll(async () => {
    env = await setupGovBase();
    await setupMajlis(env);
    await setupGovernment(env);
  }, 120_000);

  it('PM is set to pmCandidate', async () => {
    const rolePM = await env.contracts.constitution.read('ROLE_PRIME_MINISTER');
    const pm = await env.contracts.constitution.read('getRole', [rolePM]);
    expect((pm as string).toLowerCase()).toBe(env.actors.pmCandidate.toLowerCase());
  });

  it('formation stage is Idle', async () => {
    const stage = await env.contracts.executive.read('stage');
    expect(stage).toBe(0); // FormationStage.Idle
  });

  it('is not in caretaker mode', async () => {
    const caretaker = await env.contracts.executive.read('caretaker');
    expect(caretaker).toBe(false);
  });
});

describe('Mixin: Senate', () => {
  let env: ReturnType<typeof setupSenate> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    const base = await setupGovBase();
    env = await setupSenate(base);
  }, 120_000);

  it('seats 3 senators', async () => {
    const count = await env.contracts.parliament.read('senateMemberCount');
    expect(count).toBe(3n);
  });

  it('senators are senate members', async () => {
    for (const senator of env.senators) {
      const isMember = await env.contracts.parliament.read('isSenateMember', [senator]);
      expect(isMember).toBe(true);
    }
  });
});

describe('Mixin: Justices', () => {
  let env: ReturnType<typeof setupJustices> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    const base = await setupGovBase();
    const senateEnv = await setupSenate(base);
    env = await setupJustices(senateEnv);
  }, 120_000);

  it('appoints 7 active justices', async () => {
    const count = await env.contracts.court.read('activeJusticeCount');
    expect(count).toBe(7n);
  });
});
