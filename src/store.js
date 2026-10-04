import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Незавершённые проверки переживают перезапуск бота,
// иначе новички так и остались бы без права писать
const dir = fileURLToPath(new URL('../data/', import.meta.url));
const file = dir + 'pending.json';

export function load() {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		if (err.code !== 'ENOENT') console.error('Не удалось прочитать', file, err);
		return [];
	}
}

// Ошибка записи не должна ронять бота: проверки продолжат работать из памяти
export function save(items) {
	try {
		mkdirSync(dir, { recursive: true });
		writeFileSync(file + '.tmp', JSON.stringify(items, null, '\t'));
		renameSync(file + '.tmp', file);
	} catch (err) {
		console.error('Не удалось сохранить', file, err);
	}
}
