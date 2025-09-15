/**
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
  console.log('\n=== ANALYZING ' + product.name.toUpperCase() + ' ===');
  
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
  
  console.log('\nPrice Optimization:');
  console.log('  Current Price: $' + optimization.currentPrice);
  console.log('  Recommended Price: $' + optimization.recommendedPrice);
  console.log('  Revenue Improvement: ' + optimization.improvementPercent + '%');
  console.log('  Expected Revenue: $' + optimization.expectedRevenue);
  
  // Seasonal analysis for all seasons
  const seasons = ['winter', 'spring', 'summer', 'fall'];
  console.log('\nSeasonal Pricing Strategy:');
  seasons.forEach(season => {
    const seasonal = analyzer.getSeasonalRecommendations(product.id, season, product.category);
    console.log('  ' + season + ': ' + seasonal.priceMultiplier + 'x price (' + seasonal.reasoning + ')');
    console.log('    Recommendation: ' + seasonal.recommendation);
  });
});

// Demonstrate comparative analysis
console.log('\n=== COMPARATIVE ELASTICITY ANALYSIS ===');
products.forEach(product => {
  const elasticity = analyzer.calculateElasticity(product.id);
  const optimization = analyzer.optimizePrice(product.id, product.basePrice);
  
  console.log(product.name + ':');
  console.log('  Elasticity: ' + elasticity.elasticity.toFixed(3) + ' (' + elasticity.interpretation.type + ')');
  console.log('  Price Flexibility: ' + optimization.improvementPercent.toFixed(1) + '% potential improvement');
  console.log('  Pricing Strategy: ' + elasticity.interpretation.recommendation);
});

export { analyzer, products };