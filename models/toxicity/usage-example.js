/**
 * Toxicity Model - Review Sentiment Analysis
 * Use for: Review filtering, sentiment-based recommendation weighting
 */

import * as toxicity from '@tensorflow-models/toxicity';

export class ReviewSentimentAnalyzer {
  constructor(threshold = 0.7) {
    this.model = null;
    this.threshold = threshold;
  }
  
  async initialize() {
    console.log('Loading Toxicity model...');
    this.model = await toxicity.load(this.threshold, []);
    console.log('✅ Toxicity model loaded successfully');
  }
  
  async analyzeReview(reviewText) {
    const predictions = await this.model.classify([reviewText]);
    
    const analysis = {
      text: reviewText,
      isToxic: false,
      toxicityScores: {},
      overallSentiment: 'positive',
      confidence: 0
    };
    
    predictions.forEach(prediction => {
      const label = prediction.label;
      const score = prediction.results[0].probabilities[1]; // Probability of being toxic
      
      analysis.toxicityScores[label] = score;
      
      if (prediction.results[0].match) {
        analysis.isToxic = true;
      }
    });
    
    // Calculate overall sentiment
    const avgToxicity = Object.values(analysis.toxicityScores).reduce((a, b) => a + b, 0) / Object.values(analysis.toxicityScores).length;
    analysis.overallSentiment = avgToxicity > 0.5 ? 'negative' : 'positive';
    analysis.confidence = Math.abs(avgToxicity - 0.5) * 2;
    
    return analysis;
  }
}