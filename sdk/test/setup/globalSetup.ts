/**
 * Vitest globalSetup — starts Anvil before tests, stops after.
 */

import { spawn, type ChildProcess } from 'node:child_process';

let anvil: ChildProcess | null = null;

export async function setup() {
  console.log('[globalSetup] Starting Anvil...');

  // --code-size-limit: Crown(29KB), Parliament(36KB), SupremeCourt(29KB) exceed EIP-170 24KB limit.
  // --timestamp 1: Start at Unix epoch so we can warpTo any test timestamp.
  anvil = spawn('anvil', [
    '--port', '8545',
    '--accounts', '20',
    '--balance', '10000',
    '--code-size-limit', '100000',
    '--timestamp', '1',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Collect stderr for error messages
  let stderr = '';
  anvil.stderr!.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Anvil startup timeout. stderr: ${stderr}`));
    }, 15_000);

    anvil!.stdout!.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('Listening on')) {
        clearTimeout(timeout);
        console.log('[globalSetup] Anvil ready');
        resolve();
      }
    });

    anvil!.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Anvil spawn error: ${err.message}`));
    });

    anvil!.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Anvil exited with code ${code}. stderr: ${stderr}`));
      }
    });
  });
}

export async function teardown() {
  if (anvil) {
    console.log('[globalSetup] Stopping Anvil');
    anvil.kill('SIGTERM');

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      anvil!.on('exit', () => resolve());
      setTimeout(resolve, 3000); // Fallback timeout
    });

    anvil = null;
  }
}
