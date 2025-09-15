/**
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
    const key = `${userId}:${experimentId}`;
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
*/