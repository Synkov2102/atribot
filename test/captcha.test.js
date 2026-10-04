import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOptions, generateProblem } from '../src/captcha.js';

const solve = (question) => {
	const [a, op, b] = question.split(' ');
	return { '+': (x, y) => x + y, '-': (x, y) => x - y, '×': (x, y) => x * y }[op](Number(a), Number(b));
};

test('ответ соответствует примеру и не отрицательный', () => {
	for (let i = 0; i < 1000; i++) {
		const { question, answer } = generateProblem();
		assert.equal(answer, solve(question), question);
		assert.ok(answer >= 0, question);
	}
});

test('варианты уникальны, не отрицательны и содержат правильный ответ', () => {
	for (let i = 0; i < 1000; i++) {
		const { answer } = generateProblem();
		for (const count of [2, 6, 8, 12]) {
			const options = generateOptions(answer, count);
			assert.equal(options.length, count);
			assert.equal(new Set(options).size, count);
			assert.ok(options.includes(answer));
			assert.ok(options.every((n) => Number.isInteger(n) && n >= 0));
		}
	}
});

test('правильный ответ стоит на разных местах', () => {
	const positions = new Set();
	for (let i = 0; i < 200; i++) positions.add(generateOptions(20, 8).indexOf(20));
	assert.equal(positions.size, 8);
});
