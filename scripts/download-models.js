#!/usr/bin/env node

/**
 * Harper Edge AI Proxy - Real Model Download Script (Node.js)
 * Downloads real TensorFlow.js models for outdoor gear personalization
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MODELS_DIR = path.resolve('./models');
// Using real npm packages instead of fictional repository

// Real TensorFlow.js models available
const REAL_MODELS = {
  'universal-sentence-encoder': {
    package: '@tensorflow-models/universal-sentence-encoder',
    description: 'Text embeddings for product descriptions and user behavior analysis',
    size: '~25MB'
  },
  'mobilenet': {
    package: '@tensorflow-models/mobilenet',
    description: 'Image classification and embeddings for outdoor gear photos',
    size: '~16MB'
  },
  'toxicity': {
    package: '@tensorflow-models/toxicity',
    description: 'Text toxicity detection for review sentiment analysis',
    size: '~8MB'
  }
};

const CORE_MODELS = Object.keys(REAL_MODELS);

// Colors for output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function print(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Check if URL exists
async function urlExists(url) {
  return new Promise((resolve) => {
    const request = https.request(url, { method: 'HEAD' }, (response) => {
      resolve(response.statusCode === 200);
    });
    
    request.on('error', () => resolve(false));
    request.end();
  });
}

// Download file with basic progress
async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadFile(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      const fileStream = createWriteStream(destination);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        process.stdout.write(`\r   Downloaded: ${Math.round(downloadedSize / 1024)}KB`);
      });
      
      response.on('end', () => {
        console.log(''); // New line
        resolve();
      });
      
      response.pipe(fileStream);
      fileStream.on('error', reject);
    });
    
    request.on('error', reject);
  });
}

// Extract using Node.js tar (if available) or fallback to manual creation
async function extractModel(tarPath, modelDir, modelName) {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`tar -xzf "${tarPath}" -C "${modelDir}"`);
    return true;
  } catch (error) {
    // Fallback: create placeholder model structure
    await createPlaceholderModel(modelName);
    return false;
  }
}

// Create a placeholder model for development
async function createPlaceholderModel(modelName) {
  const modelDir = path.join(MODELS_DIR, modelName);
  await fs.mkdir(modelDir, { recursive: true });
  
  // Create model.json
  const modelJson = {
    format: 'layers-model',
    generatedBy: 'Harper Model Setup',
    modelTopology: {
      keras_version: '2.8.0',
      model_config: {
        class_name: 'Sequential',
        config: {
          name: modelName,
          layers: [
            {
              class_name: 'Dense',
              config: { 
                units: 64, 
                activation: 'relu', 
                name: 'dense_1',
                batch_input_shape: [null, 100]
              }
            },
            {
              class_name: 'Dense',
              config: { units: 32, activation: 'softmax', name: 'predictions' }
            }
          ]
        }
      }
    },
    weightsManifest: [{
      paths: ['weights.bin'],
      weights: [
        { name: 'dense_1/kernel', shape: [100, 64], dtype: 'float32' },
        { name: 'dense_1/bias', shape: [64], dtype: 'float32' },
        { name: 'predictions/kernel', shape: [64, 32], dtype: 'float32' },
        { name: 'predictions/bias', shape: [32], dtype: 'float32' }
      ]
    }]
  };
  
  await fs.writeFile(
    path.join(modelDir, 'model.json'),
    JSON.stringify(modelJson, null, 2)
  );
  
  // Create weights.bin
  const weightsSize = (100 * 64 + 64 + 64 * 32 + 32) * 4; // float32 bytes
  const weightsBuffer = crypto.randomBytes(weightsSize);
  await fs.writeFile(path.join(modelDir, 'weights.bin'), weightsBuffer);
  
  print('yellow', `   📁 Created placeholder model for ${modelName}`);
}

// Install npm package for model
async function installModelPackage(modelName) {
  const config = REAL_MODELS[modelName];
  print('blue', `📦 Installing ${config.package}...`);
  
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Check if already installed
    try {
      await execAsync(`npm list ${config.package}`);
      print('green', `✅ ${config.package} already installed`);
      return true;
    } catch (error) {
      // Not installed, proceed with installation
    }
    
    // Install the package with legacy peer deps to resolve conflicts
    print('yellow', `   Installing ${config.package}...`);
    await execAsync(`npm install ${config.package} --legacy-peer-deps`);
    print('green', `✅ ${config.package} installed successfully`);
    return true;
  } catch (error) {
    print('red', `❌ Failed to install ${config.package}: ${error.message}`);
    return false;
  }
}

// Create model info file
async function createModelInfo(modelName) {
  const config = REAL_MODELS[modelName];
  const modelDir = path.join(MODELS_DIR, modelName);
  await fs.mkdir(modelDir, { recursive: true });
  
  const modelInfo = {
    name: modelName,
    type: 'tensorflow-models-package',
    package: config.package,
    description: config.description,
    size: config.size,
    installation: `npm install ${config.package}`,
    created: new Date().toISOString()
  };
  
  await fs.writeFile(
    path.join(modelDir, 'model-info.json'),
    JSON.stringify(modelInfo, null, 2)
  );
  
  print('green', `✅ ${modelName} - Model info created`);
}

// Main download function
async function main() {
  try {
    print('blue', '🤖 Installing real TensorFlow.js models...');
    
    // Create models directory
    await fs.mkdir(MODELS_DIR, { recursive: true });
    
    // Install base TensorFlow.js packages
    print('blue', '📦 Installing base TensorFlow.js packages...');
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync('npm install @tensorflow/tfjs @tensorflow/tfjs-node --legacy-peer-deps');
      print('green', '✅ Base TensorFlow.js packages installed');
    } catch (error) {
      print('yellow', `⚠️  Warning: ${error.message}`);
    }
    
    // Install model packages
    const successfulInstalls = [];
    const failedInstalls = [];
    
    for (const modelName of CORE_MODELS) {
      console.log(`📦 Processing ${modelName}...`);
      
      const success = await installModelPackage(modelName);
      if (success) {
        await createModelInfo(modelName);
        successfulInstalls.push(modelName);
      } else {
        failedInstalls.push(modelName);
      }
    }
    
    console.log('');
    print('green', '🎉 Model installation completed!');
    print('blue', `📁 Models info in: ${MODELS_DIR}`);
    
    if (successfulInstalls.length > 0) {
      print('green', `✅ Successfully installed: ${successfulInstalls.join(', ')}`);
    }
    
    if (failedInstalls.length > 0) {
      print('red', `❌ Failed to install: ${failedInstalls.join(', ')}`);
    }
    
    print('blue', '📖 Next steps:');
    console.log('1. Models are available as npm packages');
    console.log('2. Use them directly in your code');
    console.log('3. See docs/AI_MODELS.md for usage examples');
    console.log('4. Test with: npm run test-models');
    
  } catch (error) {
    console.error(`❌ Installation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}