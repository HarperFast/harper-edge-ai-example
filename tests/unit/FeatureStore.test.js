import { describe, test } from 'node:test';
import assert from 'node:assert';
import { FeatureStore } from '../../src/core/FeatureStore.js';

describe('FeatureStore', () => {
	test('should write and read features for an entity', async () => {
		const store = new FeatureStore();

		// Write features
		await store.writeFeatures('user_123', {
			age: 25,
			city: 'SF',
			active: true,
		});

		// Read all features
		const features = await store.getFeatures('user_123', ['age', 'city', 'active']);

		// Verify
		assert.strictEqual(features.age, 25);
		assert.strictEqual(features.city, 'SF');
		assert.strictEqual(features.active, true);
	});

	test('should return only requested features', async () => {
		const store = new FeatureStore();

		await store.writeFeatures('user_456', {
			age: 30,
			city: 'NYC',
			country: 'USA',
		});

		// Request subset
		const features = await store.getFeatures('user_456', ['age', 'country']);

		assert.strictEqual(features.age, 30);
		assert.strictEqual(features.country, 'USA');
		assert.strictEqual(features.city, undefined); // Not requested
	});

	test('should return empty object for non-existent entity', async () => {
		const store = new FeatureStore();

		const features = await store.getFeatures('non_existent', ['age']);

		assert.deepStrictEqual(features, {});
	});
});
