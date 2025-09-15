/**
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

console.log('\n=== RECOMMENDATION ALGORITHM RESULTS ===');
const recResults = abTest.getResults('recommendation-algo');
console.log(JSON.stringify(recResults, null, 2));

export { abTest, pricingExperiment, recExperiment };