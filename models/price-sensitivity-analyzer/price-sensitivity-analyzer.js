/**
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
*/