#!/usr/bin/env node

// Test Harper .env configuration loading

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Testing Harper .env configuration...\n');

// 1. Test direct .env file reading
console.log('1. Reading .env file directly:');
try {
  const envContent = readFileSync(join(__dirname, '.env'), 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  console.log(`Found ${envLines.length} environment variables in .env file`);
  envLines.slice(0, 5).forEach(line => {
    const [key] = line.split('=');
    console.log(`  - ${key}`);
  });
} catch (error) {
  console.log('Error:', error.message);
}

console.log('\n2. Current process environment variables:');
const envVarsToCheck = [
  'PORT',
  'NODE_ENV',
  'PROXY_API_KEY',
  'CACHE_MAX_SIZE',
  'CACHE_DEFAULT_TTL',
  'CACHE_PERSONALIZATION_TTL',
  'INFERENCE_TIMEOUT'
];

envVarsToCheck.forEach(varName => {
  const value = process.env[varName];
  console.log(`  ${varName}: ${value || '(not set)'}`);
});

// 3. Test our config loading logic
console.log('\n3. Testing ProxyResource config loading:');
const config = {
  cacheDefaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300,
  cachePersonalizationTTL: parseInt(process.env.CACHE_PERSONALIZATION_TTL) || 60,
  cacheMaxSize: process.env.CACHE_MAX_SIZE || '2GB',
  inferenceTimeout: parseInt(process.env.INFERENCE_TIMEOUT) || 30000,
  fallbackToCache: process.env.FALLBACK_TO_CACHE === 'true',
  personalizeAnonymous: process.env.PERSONALIZE_ANONYMOUS === 'true',
  proxyApiKey: process.env.PROXY_API_KEY || 'demo-alpine-key-2024'
};

console.log('Config object:');
Object.entries(config).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});

console.log('\n4. Reading Harper config.yaml:');
try {
  const configPath = join(__dirname, 'harper-components', 'config.yaml');
  const configContent = readFileSync(configPath, 'utf8');
  console.log('config.yaml exists and contains LoadEnv configuration');
  console.log('First few lines:');
  console.log(configContent.split('\n').slice(0, 10).join('\n'));
} catch (error) {
  console.log('Error reading config.yaml:', error.message);
}

console.log('\nTest completed!');