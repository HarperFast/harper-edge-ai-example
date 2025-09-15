/**
 * MobileNet - Visual Product Similarity
 * Use for: Image-based recommendations, visual product matching
 */

import * as mobilenet from '@tensorflow-models/mobilenet';

export class VisualProductSimilarity {
  constructor() {
    this.model = null;
    this.imageEmbeddings = new Map();
  }
  
  async initialize() {
    console.log('Loading MobileNet...');
    this.model = await mobilenet.load();
    console.log('✅ MobileNet loaded successfully');
  }
  
  async classifyProduct(imageElement) {
    const predictions = await this.model.classify(imageElement);
    return predictions;
  }
  
  async getImageEmbedding(imageElement) {
    // Get intermediate layer activations as embeddings
    const embedding = await this.model.infer(imageElement, true);
    return embedding;
  }
  
  async findVisuallySimilar(targetImageElement, candidateImages, topK = 5) {
    const targetEmbedding = await this.getImageEmbedding(targetImageElement);
    const targetData = await targetEmbedding.data();
    
    const similarities = [];
    
    for (let i = 0; i < candidateImages.length; i++) {
      const candidateEmbedding = await this.getImageEmbedding(candidateImages[i].element);
      const candidateData = await candidateEmbedding.data();
      
      const similarity = this.cosineSimilarity(targetData, candidateData);
      similarities.push({
        product: candidateImages[i].product,
        similarity
      });
      
      candidateEmbedding.dispose();
    }
    
    targetEmbedding.dispose();
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
  
  cosineSimilarity(a, b) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}