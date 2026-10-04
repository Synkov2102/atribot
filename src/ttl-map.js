// Map, записи которого живут ограниченное время. Срок у каждой записи свой,
// поэтому повторная запись того же ключа не удаляется таймером от предыдущей
export class TtlMap {
	#items = new Map();

	constructor(ttlMs) {
		this.ttlMs = ttlMs;
	}

	set(key, value) {
		this.#prune();
		this.#items.set(key, { value, expires: Date.now() + this.ttlMs });
	}

	get(key) {
		const item = this.#items.get(key);
		if (!item) return undefined;
		if (item.expires <= Date.now()) {
			this.#items.delete(key);
			return undefined;
		}
		return item.value;
	}

	has(key) {
		return this.get(key) !== undefined;
	}

	// Достаёт значение и удаляет запись
	take(key) {
		const value = this.get(key);
		this.#items.delete(key);
		return value;
	}

	#prune() {
		const now = Date.now();
		for (const [key, item] of this.#items) {
			if (item.expires <= now) this.#items.delete(key);
		}
	}
}
