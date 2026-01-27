#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Validating Next.js Frontend...\n');

const checks = [
  {
    name: 'package.json exists',
    check: () => fs.existsSync(path.join(__dirname, 'package.json')),
  },
  {
    name: 'node_modules exists',
    check: () => fs.existsSync(path.join(__dirname, 'node_modules')),
  },
  {
    name: 'next.config.js exists',
    check: () => fs.existsSync(path.join(__dirname, 'next.config.js')),
  },
  {
    name: 'app directory exists',
    check: () => fs.existsSync(path.join(__dirname, 'app')),
  },
  {
    name: 'tailwind.config.js exists',
    check: () => fs.existsSync(path.join(__dirname, 'tailwind.config.js')),
  },
  {
    name: 'tsconfig.json exists',
    check: () => fs.existsSync(path.join(__dirname, 'tsconfig.json')),
  },
];

let allPassed = true;

for (const check of checks) {
  try {
    const passed = check.check();
    if (passed) {
      console.log(`✅ ${check.name}`);
    } else {
      console.log(`❌ ${check.name}`);
      allPassed = false;
    }
  } catch (error) {
    console.log(`❌ ${check.name}: ${error.message}`);
    allPassed = false;
  }
}

console.log('\n' + '='.repeat(50));

if (allPassed) {
  console.log('🎉 Frontend validation successful!');
  console.log('You can now run: npm run dev');
} else {
  console.log('⚠️  Some frontend checks failed. Please check the errors above.');
  process.exit(1);
}