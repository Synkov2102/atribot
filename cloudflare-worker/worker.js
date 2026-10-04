/**
 * Cloudflare Worker, пересылающий запросы бота на api.telegram.org.
 * Нужен, если с сервера бота Telegram недоступен напрямую.
 *
 * Переменная окружения воркера ALLOWED_BOT_IDS — id ботов через запятую
 * (число до двоеточия в токене). Без неё воркер отвечает 403 на всё,
 * чтобы им не могли пользоваться чужие боты.
 */
export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		const match = /^\/(?:file\/)?bot(\d+):[\w-]+\//.exec(url.pathname);
		if (!match) {
			return new Response('Not found', { status: 404 });
		}

		const allowed = (env.ALLOWED_BOT_IDS ?? '').split(',').map((id) => id.trim());
		if (!allowed.includes(match[1])) {
			return new Response('Forbidden', { status: 403 });
		}

		url.protocol = 'https:';
		url.hostname = 'api.telegram.org';
		url.port = '';

		// Метод, заголовки и тело запроса переносятся как есть
		return fetch(new Request(url, request));
	},
};
