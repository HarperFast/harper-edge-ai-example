#!/usr/bin/env node

console.log('Testing .env file loading...');
console.log('');

// Test if environment variables are loaded
const envVars = [
  'PORT',
  'NODE_ENV', 
  'PROXY_API_KEY',
  'CACHE_MAX_SIZE',
  'CACHE_DEFAULT_TTL',
  'CACHE_PERSONALIZATION_TTL',
  'INFERENCE_TIMEOUT',
  'FALLBACK_TO_CACHE',
  'PERSONALIZE_ANONYMOUS'
];

console.log('Environment variables from .env:');
envVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`  ${varName}: ${value || '(not set)'}`);
});

console.log('');

// Test if we can access the .env file directly
try {
  const { readFileSync } = await import('fs');
  const { join } from await import('path');
  const { fileURLToPath } = await import('url');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = new URL('.', import.meta.url).pathname;
  
  const envContent = readFileSync(join(__dirname, '.env'), 'utf8');
  console.log('.env file exists and contains:');
  console.log(envContent.split('\n').slice(0, 10).join('\n'));
  console.log('...');
} catch (error) {
  console.log('Error reading .env file:', error.message);
}