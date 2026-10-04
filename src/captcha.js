import { randomInt } from 'node:crypto';

// Простой пример, который человек решит в уме за пару секунд
export function generateProblem() {
	const op = ['+', '-', '×'][randomInt(3)];

	if (op === '×') {
		const a = randomInt(2, 10);
		const b = randomInt(2, 10);
		return { question: `${a} × ${b}`, answer: a * b };
	}

	const a = randomInt(10, 50);
	const b = randomInt(1, 10);
	return op === '+'
		? { question: `${a} + ${b}`, answer: a + b }
		: { question: `${a} - ${b}`, answer: a - b };
}

// Правильный ответ и правдоподобные неправильные рядом с ним, вперемешку
export function generateOptions(answer, count = 6) {
	const options = new Set([answer]);
	while (options.size < count) {
		const candidate = answer + randomInt(-10, 11);
		if (candidate >= 0) options.add(candidate);
	}

	const list = [...options];
	for (let i = list.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[list[i], list[j]] = [list[j], list[i]];
	}
	return list;
}
