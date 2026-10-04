import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TtlMap } from '../src/ttl-map.js';

test('запись истекает по своему сроку, а не по сроку предыдущей', (t) => {
	t.mock.timers.enable({ apis: ['Date'] });
	const map = new TtlMap(1000);

	map.set('a', 1);
	t.mock.timers.tick(800);
	map.set('a', 2);
	t.mock.timers.tick(500);
	assert.equal(map.get('a'), 2);

	t.mock.timers.tick(600);
	assert.equal(map.get('a'), undefined);
});

test('take достаёт и удаляет', () => {
	const map = new TtlMap(1000);
	map.set('a', 1);
	assert.equal(map.take('a'), 1);
	assert.equal(map.has('a'), false);
});
