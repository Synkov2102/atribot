import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';

const base = { BOT_TOKEN: '123:abc' };

test('значения по умолчанию', () => {
	assert.deepEqual(parseConfig(base), {
		token: '123:abc',
		timeoutMs: 120_000,
		maxAttempts: 1,
		options: 8,
		kickBanSec: 300,
	});
});

test('без токена — ошибка', () => {
	assert.throws(() => parseConfig({}), /BOT_TOKEN/);
});

test('бан короче 31 секунды запрещён: Telegram считает его вечным', () => {
	assert.throws(() => parseConfig({ ...base, KICK_BAN_SEC: '10' }), /KICK_BAN_SEC/);
	assert.throws(() => parseConfig({ ...base, KICK_BAN_SEC: '0' }), /KICK_BAN_SEC/);
});

test('не число — ошибка, а не NaN', () => {
	assert.throws(() => parseConfig({ ...base, KICK_BAN_SEC: '5m' }), /KICK_BAN_SEC/);
	assert.throws(() => parseConfig({ ...base, CAPTCHA_TIMEOUT_SEC: '1.5' }), /CAPTCHA_TIMEOUT_SEC/);
});

test('попыток должно быть меньше, чем вариантов', () => {
	assert.throws(() => parseConfig({ ...base, CAPTCHA_MAX_ATTEMPTS: '8', CAPTCHA_OPTIONS: '8' }), /CAPTCHA_MAX_ATTEMPTS/);
});
