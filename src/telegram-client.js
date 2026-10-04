import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Настройки подключения к Telegram API для grammY.
 * Таймаут нужен, чтобы при недоступном Telegram бот писал ошибку, а не висел молча.
 * Он больше таймаута long polling (30 сек.), иначе обрывались бы обычные запросы getUpdates.
 */
export function clientOptions({ proxy, apiRoot }) {
	const options = { timeoutSeconds: 60 };

	if (apiRoot) options.apiRoot = apiRoot;

	if (proxy) {
		const agent = proxy.startsWith('socks') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
		options.baseFetchConfig = { agent, compress: true };
	}

	return options;
}

// Адрес прокси без логина и пароля — для логов
export const describeConnection = ({ proxy, apiRoot }) => {
	if (proxy) {
		const { protocol, host } = new URL(proxy);
		return `через прокси ${protocol}//${host}`;
	}
	return apiRoot ? `через ${new URL(apiRoot).host}` : 'напрямую';
};
