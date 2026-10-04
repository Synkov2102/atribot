# Cloudflare Worker для доступа к Telegram API

Нужен, если с сервера бота `api.telegram.org` недоступен. Воркер принимает запросы бота
и пересылает их в Telegram. Бесплатного тарифа Cloudflare (100 000 запросов в день) хватает с запасом.

Через воркер проходят все запросы бота вместе с токеном, поэтому он пропускает
только ботов из `ALLOWED_BOT_IDS`.

## Установка через сайт Cloudflare

1. Зарегистрируйтесь на [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages → Create → Create Worker** → назовите, например, `atribot-api` → **Deploy**.
3. **Edit code** → замените весь код содержимым `worker.js` → **Deploy**.
4. **Settings → Variables and Secrets → Add**: имя `ALLOWED_BOT_IDS`,
   значение — id бота (число до двоеточия в токене) → **Deploy**.
5. Скопируйте адрес воркера вида `https://atribot-api.<аккаунт>.workers.dev`.

## Подключение бота

Проверьте с сервера бота, что воркер доступен (`<id>` — id бота):

```bash
curl -sS -m 15 https://atribot-api.<аккаунт>.workers.dev/bot<id>:x/getMe
```

Ответ `{"ok":false,"error_code":401,...}` — всё в порядке: воркер доступен и достучался до Telegram
(401 из-за ненастоящего токена в проверке). `Forbidden` — не задан или неверный `ALLOWED_BOT_IDS`.
Таймаут — адреса `workers.dev` с сервера недоступны; тогда привяжите к воркеру свой домен
(**Settings → Domains & Routes**).

Затем добавьте в `.env` бота и перезапустите его:

```
TELEGRAM_API_ROOT=https://atribot-api.<аккаунт>.workers.dev
```
