/**
 * Universal Sentence Encoder - Outdoor Gear Personalization
 * Use for: Product similarity, user clustering, semantic search
 */

import * as use from '@tensorflow-models/universal-sentence-encoder';

export class OutdoorGearSimilarity {
  constructor() {
    this.model = null;
    this.productEmbeddings = new Map();
  }
  
  async initialize() {
    console.log('Loading Universal Sentence Encoder...');
    this.model = await use.load();
    console.log('✅ Model loaded successfully');
  }
  
  async embedProducts(products) {
    const descriptions = products.map(p => 
      `${p.name} ${p.category} ${p.features.join(' ')}`
    );
    
    const embeddings = await this.model.embed(descriptions);
    return embeddings;
  }
  
  async findSimilarProducts(targetProduct, candidateProducts, topK = 5) {
    const targetDesc = `${targetProduct.name} ${targetProduct.category} ${targetProduct.features.join(' ')}`;
    const candidateDescs = candidateProducts.map(p => 
      `${p.name} ${p.category} ${p.features.join(' ')}`
    );
    
    const embeddings = await this.model.embed([targetDesc, ...candidateDescs]);
    const embeddingData = await embeddings.data();
    
    // Calculate cosine similarities
    const targetEmbedding = embeddingData.slice(0, 512);
    const similarities = [];
    
    for (let i = 1; i < candidateProducts.length + 1; i++) {
      const candidateEmbedding = embeddingData.slice(i * 512, (i + 1) * 512);
      const similarity = this.cosineSimilarity(targetEmbedding, candidateEmbedding);
      similarities.push({
        product: candidateProducts[i - 1],
        similarity
      });
    }
    
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