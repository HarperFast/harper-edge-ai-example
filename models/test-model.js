/**
 * Universal Sentence Encoder - Simple Usage Example
 */

import '@tensorflow/tfjs-node'; // Import backend first
import * as use from '@tensorflow-models/universal-sentence-encoder';

async function testUniversalSentenceEncoder() {
	console.log('🧪 Testing Universal Sentence Encoder\n');

	try {
		console.log('Loading model...');
		const model = await use.load();
		console.log('✅ Model loaded successfully\n');

		// Test semantic similarity
		const sentences = ['trail running shoes', 'lightweight hiking boots', 'waterproof rain jacket', 'running footwear'];

		console.log('Computing embeddings for:');
		sentences.forEach((s, i) => console.log(`  ${i + 1}. "${s}"`));
		console.log();

		const embeddings = await model.embed(sentences);
		const embeddingData = await embeddings.array();

		console.log('Similarity scores (compared to first sentence):');
		for (let i = 1; i < embeddingData.length; i++) {
			const similarity = cosineSimilarity(embeddingData[0], embeddingData[i]);
			console.log(`  "${sentences[0]}" ↔ "${sentences[i]}": ${similarity.toFixed(3)}`);
		}

		embeddings.dispose();
		console.log('\n✅ Test completed successfully');
	} catch (error) {
		console.error('❌ Test failed:', error);
		process.exit(1);
	}
}

function cosineSimilarity(a, b) {
	const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
	const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
	const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
	return dotProduct / (magnitudeA * magnitudeB);
}

testUniversalSentenceEncoder();
