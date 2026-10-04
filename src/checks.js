import * as store from './store.js';

/**
 * Проверка новичка, который ещё не ответил.
 *
 * @typedef {{
 *   chatId: number,
 *   userId: number,
 *   messageId: number,
 *   joinMessageId?: number,
 *   answer: number,
 *   attempts: number,
 *   deadline: number,
 *   restoreTo?: { permissions: object, until_date?: number },
 * }} Check
 */

/** @type {Map<string, Check>} */
const checks = new Map();

export const keyOf = (chatId, userId) => `${chatId}:${userId}`;

const save = () => store.save([...checks.values()]);

export const saveChecks = save;

export const getCheck = (chatId, userId) => checks.get(keyOf(chatId, userId));

/** @param {Check} check */
export function addCheck(check) {
	checks.set(keyOf(check.chatId, check.userId), check);
	save();
}

export function removeCheck(chatId, userId) {
	const key = keyOf(chatId, userId);
	const check = checks.get(key);
	if (!check) return null;
	checks.delete(key);
	save();
	return check;
}

/**
 * Забирает просроченные проверки.
 * @param {(check: Check) => boolean} isBusy проверки, которые прямо сейчас обрабатываются, пропускаются
 */
export function takeExpired(now, isBusy) {
	const expired = [];
	for (const [key, check] of checks) {
		if (check.deadline <= now && !isBusy(check)) {
			checks.delete(key);
			expired.push(check);
		}
	}
	if (expired.length) save();
	return expired;
}

export function loadChecks() {
	for (const check of store.load()) {
		checks.set(keyOf(check.chatId, check.userId), check);
	}
}
