#!/usr/bin/env node

/**
 * Harper Edge AI Proxy - Real Model Testing Script
 * Tests real TensorFlow.js model loading and inference functionality
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.resolve('./models');

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function print(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader() {
  print('blue', '╔═══════════════════════════════════════════════════════════╗');
  print('blue', '║                Harper AI Model Testing                   ║');
  print('blue', '║            TensorFlow.js Model Validation                ║');
  print('blue', '╚═══════════════════════════════════════════════════════════╝');
}

// Real TensorFlow.js models to test
const REAL_MODELS = {
  'universal-sentence-encoder': {
    package: '@tensorflow-models/universal-sentence-encoder',
    testData: ['hiking boots', 'waterproof jacket']
  },
  'mobilenet': {
    package: '@tensorflow-models/mobilenet',
    testData: null // Requires image element
  },
  'toxicity': {
    package: '@tensorflow-models/toxicity',
    testData: ['Great hiking boots!']
  }
};

async function checkPackageInstallation() {
  print('blue', '📦 Checking npm package installation...');
  
  let packagesFound = 0;
  let validPackages = 0;
  
  for (const [modelName, config] of Object.entries(REAL_MODELS)) {
    packagesFound++;
    print('yellow', `   Checking ${config.package}...`);
    
    try {
      // Try to import the package
      await import(config.package);
      print('green', `   ✅ ${config.package} - Available`);
      validPackages++;
    } catch (error) {
      print('red', `   ❌ ${config.package} - Not installed`);
    }
  }
  
  print('blue', `Found ${validPackages}/${packagesFound} installed packages`);
  return validPackages === packagesFound;
}

async function checkModelStructure() {
  print('blue', '📁 Checking model info files...');
  
  let modelsFound = 0;
  let validModels = 0;
  
  try {
    const entries = await fs.readdir(MODELS_DIR, { withFileTypes: true });
    const modelDirs = entries.filter(entry => entry.isDirectory());
    
    for (const dir of modelDirs) {
      modelsFound++;
      const modelPath = path.join(MODELS_DIR, dir.name);
      const modelInfoPath = path.join(modelPath, 'model-info.json');
      
      try {
        await fs.access(modelInfoPath);
        // Try to parse the JSON
        const content = await fs.readFile(modelInfoPath, 'utf-8');
        const modelInfo = JSON.parse(content);
        
        if (modelInfo.package && modelInfo.description) {
          print('green', `✅ ${dir.name} - Model info valid`);
          validModels++;
        } else {
          print('yellow', `⚠️  ${dir.name} - Model info incomplete`);
        }
      } catch (error) {
        print('red', `❌ ${dir.name} - Model info missing or invalid`);
      }
    }
  } catch (error) {
    print('yellow', '⚠️  Models directory not found. Run npm run setup-models first.');
    return false;
  }
  
  print('blue', `Found ${validModels}/${modelsFound} valid model configurations`);
  return validModels > 0;
}

async function testRealModelLoading() {
  print('blue', '🧮 Testing real TensorFlow.js model loading...');
  
  let successfulLoads = 0;
  let totalTests = 0;
  
  // Initialize TensorFlow.js backend
  try {
    const tf = await import('@tensorflow/tfjs-node');
    // The backend will be automatically registered when importing tfjs-node
  } catch (error) {
    print('yellow', '   ⚠️  TensorFlow.js Node backend not available, using default backend');
  }
  
  // Test Universal Sentence Encoder
  try {
    totalTests++;
    print('blue', '   Testing Universal Sentence Encoder...');
    
    const use = await import('@tensorflow-models/universal-sentence-encoder');
    const model = await use.load();
    
    // Test with sample text
    const sentences = ['hiking boots', 'waterproof jacket'];
    const embeddings = await model.embed(sentences);
    const data = await embeddings.data();
    
    print('green', `   ✅ Universal Sentence Encoder - Loaded successfully`);
    print('blue', `   📈 Embedding dimension: ${embeddings.shape[1]}`);
    print('blue', `   📊 Sample embedding range: ${Math.min(...data).toFixed(3)} to ${Math.max(...data).toFixed(3)}`);
    
    embeddings.dispose();
    successfulLoads++;
  } catch (error) {
    print('yellow', `   ⚠️  Universal Sentence Encoder - ${error.message}`);
  }
  
  // Test Toxicity Model  
  try {
    totalTests++;
    print('blue', '   Testing Toxicity Model...');
    
    const toxicity = await import('@tensorflow-models/toxicity');
    const model = await toxicity.load(0.7, []);
    
    // Test with sample text
    const predictions = await model.classify(['Great hiking boots!']);
    
    print('green', `   ✅ Toxicity Model - Loaded successfully`);
    print('blue', `   📊 Labels tested: ${predictions.length}`);
    print('blue', `   🔍 Sample prediction: ${predictions[0]?.label || 'none'}`);
    
    successfulLoads++;
  } catch (error) {
    print('yellow', `   ⚠️  Toxicity Model - ${error.message}`);
  }
  
  // Note about MobileNet (requires browser environment for image element)
  totalTests++;
  print('blue', '   Testing MobileNet availability...');
  try {
    await import('@tensorflow-models/mobilenet');
    print('green', '   ✅ MobileNet - Package available (image testing requires browser)');
    successfulLoads++;
  } catch (error) {
    print('yellow', `   ⚠️  MobileNet - ${error.message}`);
  }
  
  print('blue', `Real model loading: ${successfulLoads}/${totalTests} successful`);
  return successfulLoads === totalTests;
}

async function testPersonalizationEngine() {
  print('blue', '🎯 Testing PersonalizationEngine integration...');
  
  try {
    // Try to import and test basic PersonalizationEngine functionality
    const PersonalizationEnginePath = path.resolve('./harper-components/ai/PersonalizationEngine.js');
    
    try {
      await fs.access(PersonalizationEnginePath);
      print('green', '   ✅ PersonalizationEngine file found');
      
      // Test import (basic syntax check)
      try {
        const module = await import('file://' + PersonalizationEnginePath);
        if (module.PersonalizationEngine) {
          print('green', '   ✅ PersonalizationEngine class can be imported');
          return true;
        } else {
          print('yellow', '   ⚠️  PersonalizationEngine class not exported');
          return false;
        }
      } catch (importError) {
        print('yellow', `   ⚠️  PersonalizationEngine import failed: ${importError.message}`);
        return false;
      }
      
    } catch (error) {
      print('yellow', '   ⚠️  PersonalizationEngine file not found');
      return false;
    }
  } catch (error) {
    print('red', `   ❌ PersonalizationEngine test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    printHeader();
    console.log('');
    
    const results = {
      packageInstallation: false,
      modelStructure: false,
      realModelLoading: false,
      personalizationEngine: false
    };
    
    // 1. Check package installation
    results.packageInstallation = await checkPackageInstallation();
    console.log('');
    
    // 2. Check model structure
    results.modelStructure = await checkModelStructure();
    console.log('');
    
    // 3. Test real model loading
    if (results.packageInstallation) {
      results.realModelLoading = await testRealModelLoading();
    } else {
      print('yellow', '🧮 Skipping model loading tests (packages not installed)');
    }
    console.log('');
    
    // 4. Test PersonalizationEngine
    results.personalizationEngine = await testPersonalizationEngine();
    console.log('');
    
    // Summary
    print('blue', '📋 Test Summary:');
    const tests = [
      { name: 'Package Installation', result: results.packageInstallation },
      { name: 'Model Structure', result: results.modelStructure },
      { name: 'Real Model Loading', result: results.realModelLoading },
      { name: 'PersonalizationEngine', result: results.personalizationEngine }
    ];
    
    let passedTests = 0;
    for (const test of tests) {
      const status = test.result ? '✅ PASS' : '❌ FAIL';
      const color = test.result ? 'green' : 'red';
      print(color, `   ${status} - ${test.name}`);
      if (test.result) passedTests++;
    }
    
    console.log('');
    
    if (passedTests === tests.length) {
      print('green', '🎉 All tests passed! Your AI models are ready to use.');
    } else if (passedTests >= 2) {
      print('yellow', `⚠️  ${passedTests}/${tests.length} tests passed. Some functionality may be limited.`);
    } else {
      print('red', `❌ Only ${passedTests}/${tests.length} tests passed. Run npm run setup-models to install models.`);
    }
    
    // Recommendations
    console.log('');
    print('blue', '💡 Next Steps:');
    if (!results.packageInstallation) {
      console.log('1. Install model packages: npm run setup-models');
    }
    if (!results.modelStructure) {
      console.log('2. Create model configurations: npm run setup-models');
    }
    if (results.packageInstallation && !results.realModelLoading) {
      console.log('3. Check network connection and try again');
    }
    if (passedTests === tests.length) {
      console.log('1. Start the proxy server: npm start');
      console.log('2. Test personalization API with curl commands from README');
      console.log('3. See docs/AI_MODELS.md for integration examples');
    }
    
  } catch (error) {
    print('red', `❌ Testing failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}