import { format } from 'node:util';
import { Bot, InlineKeyboard } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { generateOptions, generateProblem } from './captcha.js';
import { addCheck, getCheck, keyOf, loadChecks, removeCheck, saveChecks, takeExpired } from './checks.js';
import { loadConfig } from './config.js';
import { clientOptions, describeConnection } from './telegram-client.js';
import { TtlMap } from './ttl-map.js';

const config = loadConfig();

// В текстах сетевых ошибок есть URL запроса, а в нём токен — в логи он попадать не должен
for (const method of ['log', 'error', 'warn']) {
	const original = console[method].bind(console);
	console[method] = (...args) => original(format(...args).replaceAll(config.token, '<token>'));
}

const PERMISSION_KEYS = [
	'can_send_messages',
	'can_send_audios',
	'can_send_documents',
	'can_send_photos',
	'can_send_videos',
	'can_send_video_notes',
	'can_send_voice_notes',
	'can_send_polls',
	'can_send_other_messages',
	'can_add_web_page_previews',
	'can_change_info',
	'can_invite_users',
	'can_pin_messages',
	'can_manage_topics',
];

const permissionsWith = (value) => Object.fromEntries(PERMISSION_KEYS.map((key) => [key, value]));

const MUTED = permissionsWith(false);
// Все права true снимают ограничения: дальше действуют общие права группы
const UNRESTRICTED = permissionsWith(true);

const bot = new Bot(config.token, { client: clientOptions(config) });

/**
 * Telegram присылает служебное сообщение о входе и событие chat_member отдельно,
 * в любом порядке. Здесь сообщение о входе ждёт, пока появится проверка.
 */
const joinMessages = new TtlMap(60_000);
// Только что проваленные проверки — чтобы удалить «бот удалил …» / «… покинул группу»
const recentlyFailed = new TtlMap(60_000);
// Проверки, по которым прямо сейчас идёт запрос к Telegram: таймер их не трогает
const busy = new Set();

const deleteMessage = (chatId, messageId) => {
	if (messageId) bot.api.deleteMessage(chatId, messageId).catch(() => null);
};

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const mention = (user) =>
	`<a href="tg://user?id=${user.id}">${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(' '))}</a>`;

const isInChat = (member) =>
	['member', 'administrator', 'creator'].includes(member.status) ||
	(member.status === 'restricted' && member.is_member);

/**
 * Возвращает права, которые были до проверки. Если админ раньше ограничил человека,
 * ограничение сохраняется — иначе капча снимала бы любой мут.
 */
function restore({ chatId, userId, restoreTo }) {
	const stillActive = restoreTo && (!restoreTo.until_date || restoreTo.until_date * 1000 > Date.now());
	return stillActive
		? bot.api.restrictChatMember(chatId, userId, restoreTo.permissions, { until_date: restoreTo.until_date || 0 })
		: bot.api.restrictChatMember(chatId, userId, UNRESTRICTED);
}

// Бан на несколько минут: выкидывает из чата и не даёт сразу вернуться, чтобы перебрать ответы
const kick = (chatId, userId) =>
	bot.api
		.banChatMember(chatId, userId, { until_date: Math.floor(Date.now() / 1000) + config.kickBanSec })
		.catch((err) => console.error(`Не удалось удалить ${userId} из чата ${chatId}:`, err));

// Убирает следы проверки. Если она не пройдена — и сообщение о входе тоже
function cleanUp(check, { passed }) {
	deleteMessage(check.chatId, check.messageId);
	if (!passed) {
		deleteMessage(check.chatId, check.joinMessageId);
		recentlyFailed.set(keyOf(check.chatId, check.userId), true);
	}
}

async function fail(check) {
	cleanUp(check, { passed: false });
	await kick(check.chatId, check.userId);
}

bot.on('chat_member', async (ctx) => {
	const { chat, old_chat_member: oldMember, new_chat_member: newMember } = ctx.chatMember;
	const user = newMember.user;
	if (user.is_bot) return;

	const wasIn = isInChat(oldMember);
	const isIn = isInChat(newMember);

	// Ушёл, не пройдя проверку. Ограничения в Telegram переживают выход,
	// поэтому снимаем свой мут — иначе при следующем входе он выглядел бы как мут от админа
	if (wasIn && !isIn) {
		const check = removeCheck(chat.id, user.id);
		if (check) {
			cleanUp(check, { passed: false });
			await restore(check).catch((err) => console.error(`Не удалось снять ограничение с ${user.id}:`, err));
		}
		return;
	}

	if (wasIn || !isIn || getCheck(chat.id, user.id)) return;
	if (newMember.status === 'administrator' || newMember.status === 'creator') return;

	const restoreTo =
		newMember.status === 'restricted'
			? {
				permissions: Object.fromEntries(PERMISSION_KEYS.map((key) => [key, Boolean(newMember[key])])),
				until_date: newMember.until_date,
			}
			: undefined;

	try {
		await ctx.api.restrictChatMember(chat.id, user.id, MUTED);
	} catch (err) {
		console.error(`Не удалось ограничить ${user.id} в чате ${chat.id} — у бота есть право банить?`, err);
		return;
	}

	const { question, answer } = generateProblem();
	const columns = config.options > 6 ? 4 : 3;
	const keyboard = new InlineKeyboard();
	generateOptions(answer, config.options).forEach((option, i) => {
		keyboard.text(String(option), `cap:${user.id}:${option}`);
		if (i % columns === columns - 1) keyboard.row();
	});

	let message;
	try {
		message = await ctx.api.sendMessage(
			chat.id,
			`👋 ${mention(user)}, добро пожаловать! Чтобы писать в чате, выберите правильный ответ:\n\n` +
				`<b>${question} = ?</b>\n\n` +
				`На ответ ${Math.round(config.timeoutMs / 1000)} сек.`,
			{ parse_mode: 'HTML', reply_markup: keyboard },
		);
	} catch (err) {
		// Без сообщения ответить нечем — не оставляем человека немым
		console.error(`Не удалось отправить пример в чат ${chat.id}:`, err);
		await restore({ chatId: chat.id, userId: user.id, restoreTo }).catch(console.error);
		return;
	}

	addCheck({
		chatId: chat.id,
		userId: user.id,
		messageId: message.message_id,
		joinMessageId: joinMessages.take(keyOf(chat.id, user.id)),
		answer,
		attempts: 0,
		deadline: Date.now() + config.timeoutMs,
		restoreTo,
	});
});

bot.callbackQuery(/^cap:(\d+):(-?\d+)$/, async (ctx) => {
	const userId = Number(ctx.match[1]);
	const value = Number(ctx.match[2]);
	const chatId = ctx.chat?.id;

	if (ctx.from.id !== userId) {
		await ctx.answerCallbackQuery('Это проверка для другого участника');
		return;
	}

	const check = getCheck(chatId, userId);
	if (!check) {
		await ctx.answerCallbackQuery('Проверка уже завершена');
		return;
	}

	if (value === check.answer) {
		// Сначала снимаем ограничение и только потом закрываем проверку:
		// если Telegram не ответит, человек сможет нажать ещё раз
		const key = keyOf(chatId, userId);
		busy.add(key);
		try {
			await restore(check);
		} catch (err) {
			console.error(`Не удалось снять ограничение с ${userId} в чате ${chatId}:`, err);
			await ctx.answerCallbackQuery({ text: 'Не получилось открыть доступ, нажмите ещё раз', show_alert: true });
			return;
		} finally {
			busy.delete(key);
		}

		removeCheck(chatId, userId);
		cleanUp(check, { passed: true });
		await ctx.answerCallbackQuery('Верно! Теперь вы можете писать в чате');
		return;
	}

	check.attempts += 1;
	const left = config.maxAttempts - check.attempts;
	if (left > 0) {
		saveChecks();
		await ctx.answerCallbackQuery({ text: `Неверно. Осталось попыток: ${left}`, show_alert: true });
		return;
	}

	removeCheck(chatId, userId);
	await ctx.answerCallbackQuery({
		text: `Неверно. Вернуться в чат можно через ${Math.ceil(config.kickBanSec / 60)} мин.`,
		show_alert: true,
	});
	await fail(check);
});

bot.on('message:new_chat_members', (ctx) => {
	for (const user of ctx.message.new_chat_members) {
		const check = getCheck(ctx.chat.id, user.id);
		if (check) {
			check.joinMessageId = ctx.message.message_id;
			saveChecks();
		} else {
			joinMessages.set(keyOf(ctx.chat.id, user.id), ctx.message.message_id);
		}
	}
});

// «Бот удалил …» и «… покинул группу» от тех, кто не прошёл проверку
bot.on('message:left_chat_member', (ctx) => {
	const { id } = ctx.message.left_chat_member;
	if (ctx.from.id === ctx.me.id || getCheck(ctx.chat.id, id) || recentlyFailed.has(keyOf(ctx.chat.id, id))) {
		deleteMessage(ctx.chat.id, ctx.message.message_id);
	}
});

bot.chatType('private').command('start', (ctx) =>
	ctx.reply(
		'Я проверяю новых участников группы: при входе прошу решить простой пример.\n\n' +
			'Чтобы подключить меня, добавьте бота в группу админом с правами ' +
			'«Блокировка пользователей» и «Удаление сообщений».',
	),
);

bot.catch((err) => console.error('Ошибка при обработке обновления:', err.error));

// Проверки, начатые до перезапуска, продолжаются; просроченные завершатся при первом обходе
loadChecks();

// Один обход вместо таймера на каждую проверку: проще восстановление и остановка
const sweeper = setInterval(() => {
	const expired = takeExpired(Date.now(), (check) => busy.has(keyOf(check.chatId, check.userId)));
	for (const check of expired) fail(check).catch(console.error);
}, 2000);

const shutdown = () => {
	clearInterval(sweeper);
	bot.stop();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

console.log(`Подключаюсь к Telegram ${describeConnection(config)}…`);

// bot.start() и auto-retry при недоступном Telegram молча повторяют попытки бесконечно.
// Проверяем связь сами, до подключения auto-retry: лучше понятная ошибка и перезапуск контейнера
try {
	bot.botInfo = await bot.api.getMe();
} catch (err) {
	const cause = err.error?.cause ?? err.error;
	console.error('Не удалось подключиться к Telegram:', err.message ?? err, cause?.code ?? cause?.message ?? '');
	process.exit(1);
}

// При наплыве новичков Telegram отвечает 429 — запрос повторяется, а не теряется
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

await bot.start({
	allowed_updates: ['message', 'chat_member', 'callback_query'],
	onStart: ({ username }) => console.log(`Бот @${username} запущен`),
});
