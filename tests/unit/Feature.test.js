import { describe, test, after } from 'node:test';
import assert from 'node:assert';

describe('Feature Table (Native Harper)', () => {
	const testEntities = ['user_123', 'user_456', 'test_entity'];

	after(async () => {
		// Cleanup all test features
		for (const entityId of testEntities) {
			for await (const feature of tables.Feature.search({ entityId })) {
				await tables.Feature.delete(feature.id);
			}
		}
	});

	test('should write and read features for an entity', async () => {
		const timestamp = Date.now();

		// Write features
		await tables.Feature.put({
			entityId: 'user_123',
			featureName: 'age',
			featureValue: JSON.stringify(25),
			timestamp,
		});
		await tables.Feature.put({
			entityId: 'user_123',
			featureName: 'city',
			featureValue: JSON.stringify('SF'),
			timestamp,
		});
		await tables.Feature.put({
			entityId: 'user_123',
			featureName: 'active',
			featureValue: JSON.stringify(true),
			timestamp,
		});

		// Read features back
		const age = await tables.Feature.get('user_123:age');
		const city = await tables.Feature.get('user_123:city');
		const active = await tables.Feature.get('user_123:active');

		assert.strictEqual(JSON.parse(age.featureValue), 25);
		assert.strictEqual(JSON.parse(city.featureValue), 'SF');
		assert.strictEqual(JSON.parse(active.featureValue), true);
	});

	test('should query all features for an entity', async () => {
		const timestamp = Date.now();

		// Write multiple features
		await tables.Feature.put({
			entityId: 'user_456',
			featureName: 'age',
			featureValue: JSON.stringify(30),
			timestamp,
		});
		await tables.Feature.put({
			entityId: 'user_456',
			featureName: 'city',
			featureValue: JSON.stringify('NYC'),
			timestamp,
		});

		// Query all features for entity
		const features = {};
		for await (const record of tables.Feature.search({ entityId: 'user_456' })) {
			features[record.featureName] = JSON.parse(record.featureValue);
		}

		assert.strictEqual(features.age, 30);
		assert.strictEqual(features.city, 'NYC');
		assert.strictEqual(Object.keys(features).length, 2);
	});

	test('should return undefined for non-existent feature', async () => {
		const feature = await tables.Feature.get('non_existent:age');
		assert.strictEqual(feature, undefined);
	});

	test('should handle complex feature values', async () => {
		const timestamp = Date.now();
		const complexValue = {
			name: 'Alice',
			preferences: { theme: 'dark' },
			scores: [95, 87, 92],
		};

		await tables.Feature.put({
			entityId: 'test_entity',
			featureName: 'userProfile',
			featureValue: JSON.stringify(complexValue),
			timestamp,
		});

		const retrieved = await tables.Feature.get('test_entity:userProfile');
		assert.deepStrictEqual(JSON.parse(retrieved.featureValue), complexValue);
	});

	test('should track timestamps for features', async () => {
		const timestamp = Date.now();

		await tables.Feature.put({
			entityId: 'test_entity',
			featureName: 'score',
			featureValue: JSON.stringify(95),
			timestamp,
		});

		const feature = await tables.Feature.get('test_entity:score');
		assert.strictEqual(feature.timestamp, timestamp);
	});

	test('should delete features', async () => {
		const timestamp = Date.now();

		await tables.Feature.put({
			entityId: 'test_entity',
			featureName: 'temp',
			featureValue: JSON.stringify('test'),
			timestamp,
		});

		// Verify exists
		let feature = await tables.Feature.get('test_entity:temp');
		assert.ok(feature);

		// Delete
		await tables.Feature.delete('test_entity:temp');

		// Verify deleted
		feature = await tables.Feature.get('test_entity:temp');
		assert.strictEqual(feature, undefined);
	});

	test('should overwrite features with same key', async () => {
		const timestamp1 = Date.now();

		await tables.Feature.put({
			entityId: 'test_entity',
			featureName: 'version',
			featureValue: JSON.stringify(1),
			timestamp: timestamp1,
		});

		const timestamp2 = timestamp1 + 1000;

		await tables.Feature.put({
			entityId: 'test_entity',
			featureName: 'version',
			featureValue: JSON.stringify(2),
			timestamp: timestamp2,
		});

		const feature = await tables.Feature.get('test_entity:version');
		assert.strictEqual(JSON.parse(feature.featureValue), 2);
		assert.strictEqual(feature.timestamp, timestamp2);
	});
});
