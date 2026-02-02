#!/usr/bin/env node
/**
 * Copy built web assets from the main Moniezi app into the native shell
 * Run this after building the web app: npm run build
 */

import { cpSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const shellRoot = join(__dirname, '..');
const webRoot = join(shellRoot, '..');

const source = join(webRoot, 'dist');
const dest = join(shellRoot, 'www');

console.log('📦 Copying web assets to native shell...');
console.log(`   Source: ${source}`);
console.log(`   Dest:   ${dest}`);

if (!existsSync(source)) {
  console.error('❌ Web build not found! Run "npm run build" in the main app first.');
  process.exit(1);
}

// Clean destination
if (existsSync(dest)) {
  rmSync(dest, { recursive: true });
}

// Copy
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });

console.log('✅ Web assets copied successfully!');
console.log('');
console.log('Next steps:');
console.log('  1. npx cap sync');
console.log('  2. npx cap open android  (or ios)');
