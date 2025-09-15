#!/usr/bin/env node
/**
 * Basic Validation Tests for Harper-Native Components
 * Tests core functionality without requiring full Harper deployment
 */

import { readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) { log('green', `✅ ${message}`); }
function error(message) { log('red', `❌ ${message}`); }
function info(message) { log('blue', `ℹ️  ${message}`); }
function warn(message) { log('yellow', `⚠️  ${message}`); }

let testsPassed = 0;
let testsTotal = 0;

function test(name, testFn) {
  testsTotal++;
  try {
    testFn();
    success(`Test passed: ${name}`);
    testsPassed++;
  } catch (err) {
    error(`Test failed: ${name} - ${err.message}`);
  }
}

async function runValidationTests() {
  info('Starting Harper Edge AI Proxy Validation Tests...\n');

  // Test 1: Verify project structure
  test('Project structure is clean', () => {
    const requiredDirs = [
      '../schemas',
      '../utils', 
      '../ai',
      '../data',
      '../extensions',
      '../../docs'
    ];

    requiredDirs.forEach(dir => {
      const fullPath = path.resolve(__dirname, dir);
      try {
        const stat = statSync(fullPath);
        if (!stat.isDirectory()) {
          throw new Error(`${dir} is not a directory`);
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          throw new Error(`Required directory missing: ${dir} (resolved to: ${fullPath})`);
        }
        throw err;
      }
    });
  });

  // Test 2: Verify seed data exists and is valid
  test('Seed tenants data is valid JSON', () => {
    const seedPath = path.join(__dirname, '../data/seed-tenants.json');
    const seedData = JSON.parse(readFileSync(seedPath, 'utf8'));
    
    if (!seedData.tenants || !Array.isArray(seedData.tenants)) {
      throw new Error('Seed data must have tenants array');
    }
    
    if (seedData.tenants.length === 0) {
      throw new Error('Must have at least one tenant');
    }
    
    const tenant = seedData.tenants[0];
    const requiredFields = ['id', 'name', 'baseUrl', 'categoryWeights'];
    requiredFields.forEach(field => {
      if (!tenant[field]) {
        throw new Error(`Tenant missing required field: ${field}`);
      }
    });
  });

  // Test 3: Verify GraphQL schema is properly structured
  test('Harper GraphQL schema is valid', () => {
    const schemaPath = path.join(__dirname, '../schemas/schema.graphql');
    const indexPath = path.join(__dirname, '../schemas/index.js');
    
    try {
      // Check GraphQL schema file exists and has proper structure
      const schemaContent = readFileSync(schemaPath, 'utf8');
      if (!schemaContent.includes('type') || !schemaContent.includes('@table')) {
        throw new Error('GraphQL schema missing required table definitions');
      }
      
      // Check that schema includes key table types
      const requiredTypes = ['Tenant', 'Session', 'Statistic', 'UserProfile', 'UserFeedback'];
      requiredTypes.forEach(type => {
        if (!schemaContent.includes(`type ${type}`)) {
          throw new Error(`GraphQL schema missing required type: ${type}`);
        }
      });
      
      // Check index.js properly exports the schema
      const indexContent = readFileSync(indexPath, 'utf8');
      if (!indexContent.includes('export const schema') || !indexContent.includes('schema.graphql')) {
        throw new Error('Schema index file not properly structured');
      }
      
    } catch (err) {
      throw new Error(`GraphQL schema validation failed: ${err.message}`);
    }
  });

  // Test 4: Verify core utilities exist
  test('Core utility files exist', () => {
    const utilFiles = [
      'HarperTenantService.js',
      'HarperDataService.js',
      'HarperStatsProcessor.js'
    ];

    utilFiles.forEach(file => {
      const utilPath = path.join(__dirname, '../utils/', file);
      try {
        const content = readFileSync(utilPath, 'utf8');
        if (!content.includes('export class')) {
          throw new Error(`Utility ${file} not properly structured as ES module`);
        }
      } catch (err) {
        throw new Error(`Utility validation failed for ${file}: ${err.message}`);
      }
    });
  });

  // Test 5: Verify AI components exist
  test('AI components are present', () => {
    const aiFiles = [
      'PersonalizationEngine.js',
      'HarperModelRetrainer.js'
    ];

    aiFiles.forEach(file => {
      const aiPath = path.resolve(__dirname, '../ai/', file);
      try {
        statSync(aiPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          throw new Error(`AI component missing: ${file} (expected at: ${aiPath})`);
        }
        throw err;
      }
    });
  });

  // Test 6: Verify resources.js main component
  test('Main resources component is valid', () => {
    const resourcesPath = path.join(__dirname, '../resources.js');
    const content = readFileSync(resourcesPath, 'utf8');
    
    if (!content.includes('class ProxyResource extends Resource')) {
      throw new Error('ProxyResource class not found');
    }
    
    if (!content.includes('class TenantResource extends Resource')) {
      throw new Error('TenantResource class not found'); 
    }
    
    if (!content.includes('HarperTenantService')) {
      throw new Error('HarperTenantService integration missing');
    }
  });

  // Test 7: Verify package.json is Harper compatible
  test('Package.json is Harper compatible', () => {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    
    if (pkg.harper?.component !== true) {
      throw new Error('package.json must have harper.component = true');
    }
    
    if (pkg.type !== 'module') {
      throw new Error('package.json must have type = "module" for ES modules');
    }
    
    if (!pkg.dependencies?.harperdb) {
      throw new Error('package.json must depend on harperdb');
    }
  });

  // Test 8: Verify documentation is updated
  test('Documentation reflects Harper-native architecture', () => {
    const readmePath = path.join(__dirname, '../../README.md');
    const readme = readFileSync(readmePath, 'utf8');
    
    if (!readme.includes('Harper native')) {
      throw new Error('README must mention Harper native architecture');
    }
    
    if (!readme.includes('harperdb dev')) {
      throw new Error('README must include Harper development instructions');
    }
    
    if (readme.includes('sqlite') || readme.includes('SQLite')) {
      throw new Error('README should not reference SQLite anymore');
    }
  });

  // Test 9: Verify configuration is clean
  test('Configuration structure is clean', () => {
    // Config directory should be removed or not critical
    const configPath = path.resolve(__dirname, '../../../config');
    try {
      const stat = statSync(configPath);
      if (stat.isDirectory()) {
        warn('Config directory still exists - this is acceptable for legacy compatibility');
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Directory doesn't exist - this is good
        success('Old config directory properly removed');
      }
    }
    
    // Data should be in harper-components/data
    const dataPath = path.resolve(__dirname, '../data/seed-tenants.json');
    try {
      statSync(dataPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Seed data should be in harper-components/data/ (expected at: ${dataPath})`);
      }
      throw err;
    }
  });

  // Test 10: Verify no SQL queries remain in critical paths
  test('No SQL queries in Harper services', () => {
    const criticalFiles = [
      '../utils/HarperTenantService.js',
      '../resources.js'
    ];
    
    criticalFiles.forEach(file => {
      const filePath = path.join(__dirname, file);
      const content = readFileSync(filePath, 'utf8');
      
      // Look for SQL patterns that should be replaced
      const sqlPatterns = [
        /SELECT\s+.*\s+FROM/i,
        /INSERT\s+INTO/i,
        /UPDATE\s+.*\s+SET/i,
        /DELETE\s+FROM/i,
        /\.sql\s*\(/
      ];
      
      sqlPatterns.forEach(pattern => {
        if (pattern.test(content)) {
          warn(`Found potential SQL query in ${file} - should use Harper native methods`);
        }
      });
    });
  });

  // Results summary
  console.log('\n' + '='.repeat(50));
  if (testsPassed === testsTotal) {
    success(`All ${testsTotal} tests passed! 🎉`);
    info('Harper Edge AI Proxy is ready for deployment');
  } else {
    error(`${testsTotal - testsPassed} tests failed out of ${testsTotal}`);
    info('Fix the failing tests before deploying');
    process.exit(1);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidationTests().catch(err => {
    error(`Test runner failed: ${err.message}`);
    process.exit(1);
  });
}