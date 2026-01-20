/**
 * Globals Singleton
 *
 * Provides a singleton instance for storing shared state across Harper workers.
 * Used to store initialized instances like ModelFetchWorker that need to be
 * accessed from multiple resources.
 *
 * Pattern from bigquery-ingestor for proper Harper worker lifecycle management.
 */

class Globals {
	constructor() {
		if (Globals.instance) {
			return Globals.instance;
		}
		this.data = {};
		Globals.instance = this;
	}

	set(key, value) {
		if (typeof logger !== 'undefined') {
			logger.debug(`[Globals.set] Setting '${key}'`);
		}
		this.data[key] = value;
	}

	get(key) {
		const value = this.data[key];
		if (typeof logger !== 'undefined') {
			if (value === undefined) {
				logger.debug(`[Globals.get] Key '${key}' not found`);
			} else {
				logger.debug(`[Globals.get] Retrieved '${key}'`);
			}
		}
		return value;
	}
}

const globals = new Globals();

export { globals, Globals };

export default Globals;
