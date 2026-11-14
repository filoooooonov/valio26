import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Explicitly configured in index.ts; tests stay memory-only unless testing persistence deliberately.
const path = process.env.COMMERCE_LEDGER_PATH;
const ledger: Record<string, unknown> = path && existsSync(path) ? JSON.parse(readFileSync(path,'utf8')) : {};
export const readLedger = <T>(key: string, fallback: T): T => (ledger[key] as T) ?? fallback;
export function writeLedger(key: string, value: unknown) {
  ledger[key] = value;
  if (!path) return;
  mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path+'.tmp',JSON.stringify(ledger,null,2));
  renameSync(path+'.tmp',path);
}
