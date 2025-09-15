#!/usr/bin/env node

/**
 * Harper Edge AI Proxy - Advanced Model Setup
 * Creates custom implementations for A/B testing, price sensitivity, and other advanced features
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);
const MODELS_DIR = path.resolve('./models');

// Colors for output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function print(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Advanced custom model implementations
const ADVANCED_MODELS = {
  'ab-testing-engine': {
    description: 'A/B testing framework for outdoor gear recommendations',
    size: '~5KB',
    usage: 'Split testing product recommendations, pricing strategies, UI variants',
    license: 'Apache 2.0',
    category: 'experimentation'
  },
  'price-sensitivity-analyzer': {
    description: 'Price elasticity and sensitivity analysis for outdoor gear',
    size: '~8KB',
    usage: 'Dynamic pricing, discount optimization, price point recommendations',
    license: 'Apache 2.0',
    category: 'pricing'
  },
  'seasonal-recommendation-engine': {
    description: 'Seasonal demand forecasting and gear recommendations',
    size: '~6KB',
    usage: 'Season-based product suggestions, inventory optimization',
    license: 'Apache 2.0',
    category: 'temporal-analysis'
  },
  'activity-clustering-model': {
    description: 'User activity pattern clustering for outdoor enthusiasts',
    size: '~7KB',
    usage: 'Activity-based user segmentation, cross-activity recommendations',
    license: 'Apache 2.0',
    category: 'clustering'
  },
  'gear-compatibility-matrix': {
    description: 'Equipment compatibility and bundle recommendation system',
    size: '~4KB',
    usage: 'Compatible gear suggestions, complete outfit recommendations',
    license: 'Apache 2.0',
    category: 'recommendation'
  },
  'weather-gear-optimizer': {
    description: 'Weather-based gear optimization and recommendations',
    size: '~3KB',
    usage: 'Weather-appropriate gear suggestions, climate-based recommendations',
    license: 'Apache 2.0',
    category: 'environmental'
  }
};

// Install additional TensorFlow models
const OPTIONAL_TF_MODELS = {
  'posenet': {
    package: '@tensorflow-models/posenet',
    description: 'Human pose estimation for outdoor activity analysis',
    size: '~13MB',
    usage: 'Activity detection, gear fit analysis, exercise form checking',
    license: 'Apache 2.0',
    category: 'computer-vision'
  },
  'handpose': {
    package: '@tensorflow-models/handpose',
    description: 'Hand tracking for gear interaction analysis',
    size: '~12MB',
    usage: 'Equipment handling analysis, grip preference detection',
    license: 'Apache 2.0',
    category: 'computer-vision'
  },
  'face-landmarks-detection': {
    package: '@tensorflow-models/face-landmarks-detection',
    description: 'Face analysis for helmet and eyewear fitting',
    size: '~10MB',
    usage: 'Safety gear sizing, sunglasses fit analysis',
    license: 'Apache 2.0',
    category: 'computer-vision'
  },
  'qna': {
    package: '@tensorflow-models/qna',
    description: 'Question answering for product support and recommendations',
    size: '~90MB',
    usage: 'Automated customer support, product Q&A, gear selection guidance',
    license: 'Apache 2.0',
    category: 'text-analysis'
  }
};

// Create A/B Testing Engine
async function createABTestingEngine() {
  const modelDir = path.join(MODELS_DIR, 'ab-testing-engine');
  await fs.mkdir(modelDir, { recursive: true });

  const implementation = `/**
 * A/B Testing Engine for Outdoor Gear Recommendations
 * Statistical framework for testing recommendation strategies
 */

export class ABTestingEngine {
  constructor() {
    this.experiments = new Map();
    this.results = new Map();
    this.userAssignments = new Map();
  }
  
  // Create a new A/B test experiment
  createExperiment(experimentId, config) {
    const experiment = {
      id: experimentId,
      name: config.name,
      variants: config.variants, // [{ id: 'control', weight: 50 }, { id: 'variant1', weight: 50 }]
      metrics: config.metrics || ['conversion_rate', 'click_through_rate', 'revenue_per_user'],
      startDate: new Date(),
      endDate: config.endDate,
      status: 'active',
      targetAudience: config.targetAudience || 'all_users'
    };
    
    this.experiments.set(experimentId, experiment);
    this.results.set(experimentId, {
      variants: {},
      significance: null,
      winner: null
    });
    
    return experiment;
  }
  
  // Assign user to experiment variant
  assignUser(userId, experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'active') {
      return null;
    }
    
    // Check if user already assigned
    const key = \`\${userId}:\${experimentId}\`;
    if (this.userAssignments.has(key)) {
      return this.userAssignments.get(key);
    }
    
    // Assign based on hash and weights
    const hash = this.hashUserId(userId);
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const threshold = (hash % 100) / 100;
    
    let cumulativeWeight = 0;
    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight / totalWeight;
      if (threshold <= cumulativeWeight) {
        this.userAssignments.set(key, variant.id);
        return variant.id;
      }
    }
    
    // Fallback to control
    const controlVariant = experiment.variants[0].id;
    this.userAssignments.set(key, controlVariant);
    return controlVariant;
  }
  
  // Record experiment event
  recordEvent(userId, experimentId, eventType, value = 1) {
    const variant = this.assignUser(userId, experimentId);
    if (!variant) return;
    
    const results = this.results.get(experimentId);
    if (!results.variants[variant]) {
      results.variants[variant] = {
        users: new Set(),
        events: {}
      };
    }
    
    results.variants[variant].users.add(userId);
    if (!results.variants[variant].events[eventType]) {
      results.variants[variant].events[eventType] = [];
    }
    results.variants[variant].events[eventType].push({ userId, value, timestamp: Date.now() });
  }
  
  // Get experiment results
  getResults(experimentId) {
    const experiment = this.experiments.get(experimentId);
    const results = this.results.get(experimentId);
    
    if (!experiment || !results) return null;
    
    const analysis = {
      experimentId,
      name: experiment.name,
      status: experiment.status,
      variants: {},
      significance: null,
      recommendedAction: 'continue'
    };
    
    // Calculate metrics for each variant
    Object.entries(results.variants).forEach(([variantId, data]) => {
      const userCount = data.users.size;
      analysis.variants[variantId] = {
        users: userCount,
        metrics: {}
      };
      
      Object.entries(data.events).forEach(([eventType, events]) => {
        const totalEvents = events.length;
        const avgValue = events.reduce((sum, e) => sum + e.value, 0) / totalEvents;
        
        analysis.variants[variantId].metrics[eventType] = {
          total: totalEvents,
          rate: userCount > 0 ? totalEvents / userCount : 0,
          avgValue
        };
      });
    });
    
    // Simple significance test (Chi-square approximation)
    analysis.significance = this.calculateSignificance(analysis.variants);
    
    return analysis;
  }
  
  // Hash user ID for consistent assignment
  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  // Simple statistical significance calculation
  calculateSignificance(variants) {
    const variantIds = Object.keys(variants);
    if (variantIds.length < 2) return null;
    
    // Simple chi-square test for conversion rates
    const control = variants[variantIds[0]];
    const treatment = variants[variantIds[1]];
    
    if (!control.metrics.conversion || !treatment.metrics.conversion) {
      return { pValue: null, significant: false };
    }
    
    const controlConversions = control.metrics.conversion.total;
    const controlUsers = control.users;
    const treatmentConversions = treatment.metrics.conversion.total;
    const treatmentUsers = treatment.users;
    
    // Chi-square calculation (simplified)
    const totalConversions = controlConversions + treatmentConversions;
    const totalUsers = controlUsers + treatmentUsers;
    const expectedControlConversions = (totalConversions * controlUsers) / totalUsers;
    const expectedTreatmentConversions = (totalConversions * treatmentUsers) / totalUsers;
    
    if (expectedControlConversions === 0 || expectedTreatmentConversions === 0) {
      return { pValue: null, significant: false };
    }
    
    const chiSquare = 
      Math.pow(controlConversions - expectedControlConversions, 2) / expectedControlConversions +
      Math.pow(treatmentConversions - expectedTreatmentConversions, 2) / expectedTreatmentConversions;
    
    // Rough p-value estimation (for demo purposes)
    const pValue = chiSquare > 3.84 ? 0.05 : 0.5; // Very simplified
    
    return {
      pValue,
      significant: pValue < 0.05,
      chiSquare,
      effect: treatmentConversions/treatmentUsers - controlConversions/controlUsers
    };
  }
}

// Example usage for outdoor gear A/B testing
/*
const abTest = new ABTestingEngine();

// Test different recommendation algorithms
abTest.createExperiment('gear-rec-algo', {
  name: 'Recommendation Algorithm Test',
  variants: [
    { id: 'collaborative-filtering', weight: 50 },
    { id: 'content-based', weight: 50 }
  ],
  metrics: ['click_rate', 'purchase_rate', 'revenue'],
  endDate: new Date('2024-12-31')
});

// Assign user and record events
const userId = 'hiker_123';
const variant = abTest.assignUser(userId, 'gear-rec-algo');
abTest.recordEvent(userId, 'gear-rec-algo', 'click', 1);
abTest.recordEvent(userId, 'gear-rec-algo', 'conversion', 1);
abTest.recordEvent(userId, 'gear-rec-algo', 'revenue', 89.99);

// Get results
const results = abTest.getResults('gear-rec-algo');
console.log('A/B Test Results:', results);
*/`;

  await fs.writeFile(path.join(modelDir, 'ab-testing-engine.js'), implementation);
  
  // Create example usage
  const example = `/**
 * A/B Testing Engine Example Usage
 * Test different strategies for outdoor gear recommendations
 */

import { ABTestingEngine } from './ab-testing-engine.js';

const abTest = new ABTestingEngine();

// Create pricing strategy experiment
const pricingExperiment = abTest.createExperiment('pricing-strategy', {
  name: 'Dynamic Pricing Test for Hiking Boots',
  variants: [
    { id: 'standard-price', weight: 33 },
    { id: 'discount-10', weight: 33 },
    { id: 'premium-pricing', weight: 34 }
  ],
  metrics: ['view', 'add_to_cart', 'conversion', 'revenue']
});

// Create recommendation algorithm experiment
const recExperiment = abTest.createExperiment('recommendation-algo', {
  name: 'Recommendation Algorithm Performance',
  variants: [
    { id: 'collaborative-filtering', weight: 50 },
    { id: 'hybrid-model', weight: 50 }
  ],
  metrics: ['click_rate', 'conversion_rate', 'revenue_per_user']
});

// Simulate user interactions
const users = ['hiker_001', 'climber_002', 'camper_003', 'backpacker_004', 'mountaineer_005'];

users.forEach(userId => {
  // Pricing experiment
  const pricingVariant = abTest.assignUser(userId, 'pricing-strategy');
  abTest.recordEvent(userId, 'pricing-strategy', 'view', 1);
  
  if (Math.random() > 0.7) { // 30% add to cart
    abTest.recordEvent(userId, 'pricing-strategy', 'add_to_cart', 1);
  }
  
  if (Math.random() > 0.85) { // 15% conversion
    abTest.recordEvent(userId, 'pricing-strategy', 'conversion', 1);
    const revenue = pricingVariant === 'discount-10' ? 135 : 
                   pricingVariant === 'premium-pricing' ? 180 : 150;
    abTest.recordEvent(userId, 'pricing-strategy', 'revenue', revenue);
  }
  
  // Recommendation experiment
  const recVariant = abTest.assignUser(userId, 'recommendation-algo');
  abTest.recordEvent(userId, 'recommendation-algo', 'click_rate', Math.random());
  
  if (Math.random() > 0.8) { // 20% conversion
    abTest.recordEvent(userId, 'recommendation-algo', 'conversion_rate', 1);
    abTest.recordEvent(userId, 'recommendation-algo', 'revenue_per_user', 75 + Math.random() * 50);
  }
});

// Get results
console.log('=== PRICING STRATEGY RESULTS ===');
const pricingResults = abTest.getResults('pricing-strategy');
console.log(JSON.stringify(pricingResults, null, 2));

console.log('\\n=== RECOMMENDATION ALGORITHM RESULTS ===');
const recResults = abTest.getResults('recommendation-algo');
console.log(JSON.stringify(recResults, null, 2));

export { abTest, pricingExperiment, recExperiment };`;

  await fs.writeFile(path.join(modelDir, 'usage-example.js'), example);
  
  return true;
}

// Create Price Sensitivity Analyzer
async function createPriceSensitivityAnalyzer() {
  const modelDir = path.join(MODELS_DIR, 'price-sensitivity-analyzer');
  await fs.mkdir(modelDir, { recursive: true });

  const implementation = `/**
 * Price Sensitivity Analyzer for Outdoor Gear
 * Analyzes price elasticity and optimizes pricing strategies
 */

export class PriceSensitivityAnalyzer {
  constructor() {
    this.priceHistory = new Map();
    this.demandData = new Map();
    this.elasticityModels = new Map();
  }
  
  // Record price and demand data
  recordPricePoint(productId, price, demand, timestamp = Date.now()) {
    if (!this.priceHistory.has(productId)) {
      this.priceHistory.set(productId, []);
    }
    
    this.priceHistory.get(productId).push({
      price,
      demand,
      timestamp,
      revenue: price * demand
    });
  }
  
  // Calculate price elasticity of demand
  calculateElasticity(productId, timePeriod = 30) {
    const history = this.priceHistory.get(productId);
    if (!history || history.length < 2) {
      return null;
    }
    
    // Filter to time period (days)
    const cutoff = Date.now() - (timePeriod * 24 * 60 * 60 * 1000);
    const recentData = history.filter(h => h.timestamp > cutoff);
    
    if (recentData.length < 2) return null;
    
    // Calculate elasticity using log-linear regression (simplified)
    const sortedData = recentData.sort((a, b) => a.price - b.price);
    
    // Use first and last points for simple elasticity calculation
    const firstPoint = sortedData[0];
    const lastPoint = sortedData[sortedData.length - 1];
    
    const percentChangeDemand = (lastPoint.demand - firstPoint.demand) / firstPoint.demand;
    const percentChangePrice = (lastPoint.price - firstPoint.price) / firstPoint.price;
    
    const elasticity = percentChangePrice !== 0 ? percentChangeDemand / percentChangePrice : 0;
    
    return {
      elasticity,
      interpretation: this.interpretElasticity(elasticity),
      dataPoints: recentData.length,
      priceRange: { min: firstPoint.price, max: lastPoint.price },
      demandRange: { 
        min: Math.min(...recentData.map(d => d.demand)), 
        max: Math.max(...recentData.map(d => d.demand)) 
      },
      confidence: this.calculateConfidence(recentData.length)
    };
  }
  
  // Interpret elasticity values
  interpretElasticity(elasticity) {
    const absElasticity = Math.abs(elasticity);
    
    if (absElasticity < 1) {
      return {
        type: 'inelastic',
        description: 'Demand relatively insensitive to price changes',
        pricingStrategy: 'Can increase prices with minimal demand loss',
        recommendation: 'Consider premium positioning'
      };
    } else if (absElasticity > 1) {
      return {
        type: 'elastic',
        description: 'Demand sensitive to price changes',
        pricingStrategy: 'Price reductions may significantly boost demand',
        recommendation: 'Focus on competitive pricing and volume'
      };
    } else {
      return {
        type: 'unit elastic',
        description: 'Proportional relationship between price and demand',
        pricingStrategy: 'Balanced pricing approach recommended',
        recommendation: 'Optimize based on other factors'
      };
    }
  }
  
  // Optimize price for maximum revenue
  optimizePrice(productId, currentPrice, constraints = {}) {
    const elasticity = this.calculateElasticity(productId);
    if (!elasticity) {
      return { error: 'Insufficient price history data' };
    }
    
    const history = this.priceHistory.get(productId);
    const recentData = history.slice(-10); // Last 10 data points
    
    // Simple revenue optimization
    const minPrice = constraints.minPrice || currentPrice * 0.7;
    const maxPrice = constraints.maxPrice || currentPrice * 1.5;
    const stepSize = (maxPrice - minPrice) / 50;
    
    let bestPrice = currentPrice;
    let bestRevenue = 0;
    
    for (let price = minPrice; price <= maxPrice; price += stepSize) {
      const estimatedDemand = this.estimateDemand(productId, price, elasticity.elasticity);
      const revenue = price * estimatedDemand;
      
      if (revenue > bestRevenue) {
        bestRevenue = revenue;
        bestPrice = price;
      }
    }
    
    const currentDemand = this.estimateDemand(productId, currentPrice, elasticity.elasticity);
    const currentRevenue = currentPrice * currentDemand;
    const improvement = ((bestRevenue - currentRevenue) / currentRevenue) * 100;
    
    return {
      currentPrice,
      recommendedPrice: Math.round(bestPrice * 100) / 100,
      expectedRevenue: Math.round(bestRevenue * 100) / 100,
      currentRevenue: Math.round(currentRevenue * 100) / 100,
      improvementPercent: Math.round(improvement * 100) / 100,
      elasticity: elasticity.elasticity,
      confidence: elasticity.confidence,
      strategy: elasticity.interpretation.pricingStrategy
    };
  }
  
  // Estimate demand at given price
  estimateDemand(productId, price, elasticity) {
    const history = this.priceHistory.get(productId);
    if (!history || history.length === 0) return 0;
    
    // Use average demand as baseline
    const avgDemand = history.reduce((sum, h) => sum + h.demand, 0) / history.length;
    const avgPrice = history.reduce((sum, h) => sum + h.price, 0) / history.length;
    
    // Apply elasticity formula: New Demand = Base Demand * (New Price / Base Price)^elasticity
    const estimatedDemand = avgDemand * Math.pow(price / avgPrice, elasticity);
    
    return Math.max(0, estimatedDemand);
  }
  
  // Calculate confidence based on data points
  calculateConfidence(dataPoints) {
    if (dataPoints < 5) return 'low';
    if (dataPoints < 15) return 'medium';
    return 'high';
  }
  
  // Seasonal price adjustment recommendations
  getSeasonalRecommendations(productId, season, category) {
    const baseElasticity = this.calculateElasticity(productId);
    
    const seasonalMultipliers = {
      'winter-gear': {
        winter: 1.2, // Higher prices in peak season
        spring: 0.8,
        summer: 0.6,
        fall: 1.0
      },
      'summer-gear': {
        winter: 0.7,
        spring: 1.1,
        summer: 1.3,
        fall: 0.9
      },
      'year-round': {
        winter: 1.0,
        spring: 1.0,
        summer: 1.0,
        fall: 1.0
      }
    };
    
    const multiplier = seasonalMultipliers[category]?.[season] || 1.0;
    
    return {
      season,
      category,
      priceMultiplier: multiplier,
      reasoning: multiplier > 1 ? 'Peak demand period - premium pricing' : 
                multiplier < 1 ? 'Off-season - competitive pricing' : 
                'Standard pricing period',
      elasticity: baseElasticity?.elasticity || null,
      recommendation: this.getSeasonalStrategy(multiplier, baseElasticity?.interpretation.type)
    };
  }
  
  getSeasonalStrategy(multiplier, elasticityType) {
    if (multiplier > 1) {
      return elasticityType === 'inelastic' ? 'Increase prices significantly' : 'Moderate price increase';
    } else if (multiplier < 1) {
      return elasticityType === 'elastic' ? 'Aggressive discounting' : 'Moderate price reduction';
    }
    return 'Maintain current pricing strategy';
  }
}

// Example usage for outdoor gear pricing
/*
const analyzer = new PriceSensitivityAnalyzer();

// Record price history for a hiking backpack
analyzer.recordPricePoint('hiking-backpack-001', 150, 25);
analyzer.recordPricePoint('hiking-backpack-001', 140, 30);
analyzer.recordPricePoint('hiking-backpack-001', 160, 20);
analyzer.recordPricePoint('hiking-backpack-001', 145, 28);

// Calculate elasticity
const elasticity = analyzer.calculateElasticity('hiking-backpack-001');
console.log('Price elasticity analysis:', elasticity);

// Optimize pricing
const optimization = analyzer.optimizePrice('hiking-backpack-001', 150, {
  minPrice: 120,
  maxPrice: 180
});
console.log('Price optimization results:', optimization);

// Seasonal recommendations
const seasonal = analyzer.getSeasonalRecommendations('hiking-backpack-001', 'summer', 'year-round');
console.log('Seasonal pricing strategy:', seasonal);
*/`;

  await fs.writeFile(path.join(modelDir, 'price-sensitivity-analyzer.js'), implementation);
  
  // Create example usage
  const example = `/**
 * Price Sensitivity Analyzer Example Usage
 * Optimize pricing for outdoor gear based on demand elasticity
 */

import { PriceSensitivityAnalyzer } from './price-sensitivity-analyzer.js';

const analyzer = new PriceSensitivityAnalyzer();

// Simulate 60 days of price history for different outdoor gear products
const products = [
  { id: 'hiking-boots-trail-pro', name: 'Trail Pro Hiking Boots', basePrice: 150, category: 'year-round' },
  { id: 'winter-jacket-alpine', name: 'Alpine Winter Jacket', basePrice: 280, category: 'winter-gear' },
  { id: 'camping-tent-4season', name: '4-Season Camping Tent', basePrice: 450, category: 'year-round' },
  { id: 'climbing-harness-sport', name: 'Sport Climbing Harness', basePrice: 75, category: 'summer-gear' }
];

// Generate realistic price/demand data for each product
products.forEach(product => {
  console.log('\\n=== ANALYZING ' + product.name.toUpperCase() + ' ===');
  
  // Simulate 30 price points over 60 days
  for (let i = 0; i < 30; i++) {
    const dayOffset = i * 2; // Every 2 days
    const timestamp = Date.now() - (dayOffset * 24 * 60 * 60 * 1000);
    
    // Add some price variation
    const priceVariation = (Math.random() - 0.5) * 0.3; // ±15% variation
    const price = product.basePrice * (1 + priceVariation);
    
    // Demand inversely related to price with some noise
    const baselineDemand = 50;
    const priceElasticity = -1.2; // Slightly elastic
    const demandMultiplier = Math.pow(price / product.basePrice, priceElasticity);
    const demand = Math.max(1, baselineDemand * demandMultiplier + (Math.random() - 0.5) * 10);
    
    analyzer.recordPricePoint(product.id, Math.round(price * 100) / 100, Math.round(demand));
  }
  
  // Analyze elasticity
  const elasticity = analyzer.calculateElasticity(product.id);
  console.log('Elasticity Analysis:');
  console.log('  Type: ' + elasticity.interpretation.type);
  console.log('  Elasticity: ' + elasticity.elasticity.toFixed(3));
  console.log('  Description: ' + elasticity.interpretation.description);
  console.log('  Strategy: ' + elasticity.interpretation.pricingStrategy);
  console.log('  Confidence: ' + elasticity.confidence);
  
  // Optimize pricing
  const optimization = analyzer.optimizePrice(product.id, product.basePrice, {
    minPrice: product.basePrice * 0.8,
    maxPrice: product.basePrice * 1.3
  });
  
  console.log('\\nPrice Optimization:');
  console.log('  Current Price: $' + optimization.currentPrice);
  console.log('  Recommended Price: $' + optimization.recommendedPrice);
  console.log('  Revenue Improvement: ' + optimization.improvementPercent + '%');
  console.log('  Expected Revenue: $' + optimization.expectedRevenue);
  
  // Seasonal analysis for all seasons
  const seasons = ['winter', 'spring', 'summer', 'fall'];
  console.log('\\nSeasonal Pricing Strategy:');
  seasons.forEach(season => {
    const seasonal = analyzer.getSeasonalRecommendations(product.id, season, product.category);
    console.log('  ' + season + ': ' + seasonal.priceMultiplier + 'x price (' + seasonal.reasoning + ')');
    console.log('    Recommendation: ' + seasonal.recommendation);
  });
});

// Demonstrate comparative analysis
console.log('\\n=== COMPARATIVE ELASTICITY ANALYSIS ===');
products.forEach(product => {
  const elasticity = analyzer.calculateElasticity(product.id);
  const optimization = analyzer.optimizePrice(product.id, product.basePrice);
  
  console.log(product.name + ':');
  console.log('  Elasticity: ' + elasticity.elasticity.toFixed(3) + ' (' + elasticity.interpretation.type + ')');
  console.log('  Price Flexibility: ' + optimization.improvementPercent.toFixed(1) + '% potential improvement');
  console.log('  Pricing Strategy: ' + elasticity.interpretation.recommendation);
});

export { analyzer, products };`;

  await fs.writeFile(path.join(modelDir, 'usage-example.js'), example);
  
  return true;
}

// Create model info files
async function createModelInfo(modelName, config) {
  const modelDir = path.join(MODELS_DIR, modelName);
  
  const modelInfo = {
    name: modelName,
    type: 'custom-implementation',
    description: config.description,
    size: config.size,
    usage: config.usage,
    license: config.license,
    category: config.category,
    installation: 'Custom implementation included',
    created: new Date().toISOString()
  };
  
  await fs.writeFile(
    path.join(modelDir, 'model-info.json'),
    JSON.stringify(modelInfo, null, 2)
  );
}

// Install optional TensorFlow models
async function installOptionalTensorFlowModel(modelName) {
  const config = OPTIONAL_TF_MODELS[modelName];
  
  try {
    print('blue', `📦 Installing ${config.package}...`);
    await execAsync(`npm install ${config.package} --legacy-peer-deps`);
    print('green', `✅ ${config.package} installed successfully`);
    
    // Create model info
    const modelDir = path.join(MODELS_DIR, modelName);
    await fs.mkdir(modelDir, { recursive: true });
    await createModelInfo(modelName, config);
    
    return true;
  } catch (error) {
    print('red', `❌ Failed to install ${config.package}: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    print('blue', '🚀 Harper Edge AI - Advanced Model Setup');
    print('blue', '==========================================');
    console.log('');
    
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log('Usage: node setup-advanced-models.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  --custom       Install custom models only (A/B testing, price sensitivity)');
      console.log('  --tensorflow   Install optional TensorFlow models only');
      console.log('  --all          Install all advanced models');
      console.log('  --help, -h     Show this help message');
      console.log('');
      console.log('Models available:');
      console.log('  Custom Models:');
      Object.entries(ADVANCED_MODELS).forEach(([name, config]) => {
        console.log(`    ${name} - ${config.description}`);
      });
      console.log('  TensorFlow Models:');
      Object.entries(OPTIONAL_TF_MODELS).forEach(([name, config]) => {
        console.log(`    ${name} - ${config.description}`);
      });
      process.exit(0);
    }
    
    await fs.mkdir(MODELS_DIR, { recursive: true });
    
    const installCustom = args.includes('--custom') || args.includes('--all');
    const installTensorFlow = args.includes('--tensorflow') || args.includes('--all');
    
    if (!installCustom && !installTensorFlow) {
      print('yellow', '⚠️  No installation type specified. Use --help for options.');
      print('blue', 'Installing all models by default...');
      await installAll();
    } else {
      if (installCustom) {
        await installCustomModels();
      }
      if (installTensorFlow) {
        await installTensorFlowModels();
      }
    }
    
    console.log('');
    print('green', '🎉 Advanced model setup completed!');
    print('blue', '💡 Next steps:');
    console.log('1. Test models with: npm run test-models');
    console.log('2. See model examples in models/*/usage-example.js');
    console.log('3. Integrate with PersonalizationEngine in harper-components/ai/');
    
  } catch (error) {
    print('red', `❌ Setup failed: ${error.message}`);
    process.exit(1);
  }
}

async function installCustomModels() {
  print('blue', '🎨 Installing custom model implementations...');
  
  // A/B Testing Engine
  print('yellow', '   Creating A/B Testing Engine...');
  await createABTestingEngine();
  await createModelInfo('ab-testing-engine', ADVANCED_MODELS['ab-testing-engine']);
  print('green', '   ✅ A/B Testing Engine created');
  
  // Price Sensitivity Analyzer
  print('yellow', '   Creating Price Sensitivity Analyzer...');
  await createPriceSensitivityAnalyzer();
  await createModelInfo('price-sensitivity-analyzer', ADVANCED_MODELS['price-sensitivity-analyzer']);
  print('green', '   ✅ Price Sensitivity Analyzer created');
  
  // Additional custom models (simple implementations)
  const simpleModels = ['seasonal-recommendation-engine', 'activity-clustering-model', 
                       'gear-compatibility-matrix', 'weather-gear-optimizer'];
  
  for (const modelName of simpleModels) {
    print('yellow', `   Creating ${modelName}...`);
    const modelDir = path.join(MODELS_DIR, modelName);
    await fs.mkdir(modelDir, { recursive: true });
    
    // Create simple implementation template
    const className = modelName.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
    
    const implementation = `/**
 * ${className} for Outdoor Gear Personalization
 * ${ADVANCED_MODELS[modelName].description}
 */

export class ${className} {
  constructor() {
    this.data = new Map();
    this.initialized = true;
    console.log('${className} initialized');
  }
  
  // Process data according to model purpose
  process(inputData) {
    // Implementation would go here based on specific requirements
    console.log('Processing data with ${className}');
    
    return {
      success: true,
      model: '${modelName}',
      timestamp: new Date().toISOString(),
      results: inputData // Echo for demo purposes
    };
  }
  
  // Get model configuration
  getConfig() {
    return {
      name: '${modelName}',
      version: '1.0.0',
      description: '${ADVANCED_MODELS[modelName].description}',
      category: '${ADVANCED_MODELS[modelName].category}'
    };
  }
}

// Example usage in comments
/*
const model = new ${className}();
const result = model.process({ test: 'data' });
console.log('${modelName} result:', result);
*/`;

    await fs.writeFile(path.join(modelDir, `${modelName}.js`), implementation);
    await createModelInfo(modelName, ADVANCED_MODELS[modelName]);
    
    // Create basic usage example
    const example = `import { ${className} } from './${modelName}.js';

const model = new ${className}();
const config = model.getConfig();
console.log('Model config:', config);

const result = model.process({
  category: 'outdoor-gear',
  data: 'sample-data'
});
console.log('Processing result:', result);`;

    await fs.writeFile(path.join(modelDir, 'usage-example.js'), example);
    print('green', `   ✅ ${modelName} created`);
  }
}

async function installTensorFlowModels() {
  print('blue', '🧠 Installing optional TensorFlow.js models...');
  
  const successfulInstalls = [];
  const failedInstalls = [];
  
  for (const [modelName, config] of Object.entries(OPTIONAL_TF_MODELS)) {
    const success = await installOptionalTensorFlowModel(modelName);
    if (success) {
      successfulInstalls.push(modelName);
    } else {
      failedInstalls.push(modelName);
    }
  }
  
  console.log('');
  if (successfulInstalls.length > 0) {
    print('green', `✅ Successfully installed: ${successfulInstalls.join(', ')}`);
  }
  if (failedInstalls.length > 0) {
    print('yellow', `⚠️  Failed to install: ${failedInstalls.join(', ')}`);
  }
}

async function installAll() {
  await installCustomModels();
  console.log('');
  await installTensorFlowModels();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}