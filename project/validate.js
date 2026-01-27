#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const services = [
  'account-service',
  'payment-service',
  'notification-service',
  'audit-service',
  'analytics-service',
  'risk-assessment-service',
  'currency-service',
  'settlement-service',
  'reporting-service',
  'event-store-service'
];

console.log('🔍 Validating service implementations...\n');

let allValid = true;

for (const service of services) {
  const servicePath = path.join(__dirname, 'src', 'services', service, 'server.js');

  try {
    // Check if file exists
    if (!fs.existsSync(servicePath)) {
      console.log(`❌ ${service}: File not found`);
      allValid = false;
      continue;
    }

    // Try to import the module (syntax check)
    await import(servicePath);
    console.log(`✅ ${service}: Syntax valid`);

  } catch (error) {
    console.log(`❌ ${service}: ${error.message}`);
    allValid = false;
  }
}

console.log('\n' + '='.repeat(50));

if (allValid) {
  console.log('🎉 All services validated successfully!');
  console.log('The Advanced Transaction Microservices System is ready.');
} else {
  console.log('⚠️  Some services have issues. Please check the errors above.');
  process.exit(1);
}