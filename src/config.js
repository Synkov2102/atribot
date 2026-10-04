/**
 * Читает настройки из переменных окружения и проверяет их.
 * Неправильное значение — ошибка при старте, а не странное поведение потом:
 * например, бан короче 30 секунд Telegram считает вечным.
 */
export function parseConfig(env) {
	const errors = [];

	const int = (name, fallback, min, max) => {
		const raw = env[name];
		if (raw === undefined || raw === '') return fallback;
		const value = Number(raw);
		if (!Number.isInteger(value) || value < min || value > max) {
			errors.push(`${name}=${raw}: нужно целое число от ${min} до ${max}`);
			return fallback;
		}
		return value;
	};

	const url = (name, protocols) => {
		const raw = env[name];
		if (!raw) return undefined;
		try {
			const parsed = new URL(raw);
			if (protocols.includes(parsed.protocol)) return raw.replace(/\/+$/, '');
		} catch {
			// ниже общая ошибка
		}
		errors.push(`${name}: нужен адрес вида ${protocols.map((p) => p + '//…').join(' или ')}`);
		return undefined;
	};

	if (!env.BOT_TOKEN) {
		errors.push('BOT_TOKEN не задан. Скопируйте .env.example в .env и впишите токен.');
	}

	const config = {
		token: env.BOT_TOKEN,
		timeoutMs: int('CAPTCHA_TIMEOUT_SEC', 120, 10, 3600) * 1000,
		maxAttempts: int('CAPTCHA_MAX_ATTEMPTS', 1, 1, 10),
		options: int('CAPTCHA_OPTIONS', 8, 2, 12),
		kickBanSec: int('KICK_BAN_SEC', 300, 31, 365 * 24 * 60 * 60),
		// Для серверов, откуда api.telegram.org недоступен напрямую
		proxy: url('TELEGRAM_PROXY', ['socks5:', 'socks5h:', 'socks4:', 'http:', 'https:']),
		apiRoot: url('TELEGRAM_API_ROOT', ['https:', 'http:']),
	};

	if (config.maxAttempts >= config.options) {
		errors.push('CAPTCHA_MAX_ATTEMPTS должно быть меньше CAPTCHA_OPTIONS, иначе перебором проходит кто угодно');
	}

	if (errors.length) {
		throw new Error('Ошибки в настройках:\n- ' + errors.join('\n- '));
	}
	return config;
}

export function loadConfig() {
	try {
		return parseConfig(process.env);
	} catch (err) {
		console.error(err.message);
		process.exit(1);
	}
}
