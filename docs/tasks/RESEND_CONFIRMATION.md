# Задание Dexter — engine-action `RESEND_CONFIRMATION` (повторная отправка письма-подтверждения)

## Контекст
UI в Cloud Sync теперь показывает дружелюбный блок «confirm your email» после
Create account (когда `enable()` кидает `AUTH_CONFIRM_REQUIRED`). В блоке есть
кнопка **Resend email**. Сейчас она **заглушка**: UI зовёт
`api.resendConfirmation(email)` → `sendMessage({ action: 'RESEND_CONFIRMATION',
payload: { type: 'signup', email } })`, но такого action в движке нет → в
реальном расширении кнопка ловит ошибку и показывает тост «Could not resend
right now». Нужно довести до реальной отправки.

Это `background/` — твоя зона. В `app/` уже всё готово, менять там ничего не надо.

## Что нужно сделать

**1. `background/sync.js` — новая экспортируемая функция** (рядом с
`signUpWithPassword`, переиспользует `SUPABASE_URL` / `SUPABASE_KEY`):

```js
export async function resendConfirmation(email) {
  if (!email) throw new Error('AUTH_FAILED: email required');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'signup', email }),
  });
  if (!res.ok) {
    let msg = `resend failed (${res.status})`;
    try { const j = await res.json(); msg = j.msg || j.error_description || j.message || msg; } catch {}
    throw new Error('RESEND_FAILED: ' + msg);
  }
  return { ok: true };
}
```

**2. `background/service-worker.js` — новый case** (рядом с `SET_SYNC_ENABLED`,
~строка 836):

```js
case 'RESEND_CONFIRMATION': {
  await sync.resendConfirmation(payload.email);
  return { ok: true };
}
```

(и строчку в шапке-доке экшенов, как у соседей)

## Контракт (то, что ждёт UI)
- **Action:** `RESEND_CONFIRMATION`, **payload:** `{ type: 'signup', email }`
  (Supabase ожидает `type: 'signup'`; UI шлёт его уже в payload).
- **Успех:** резолв `{ ok: true }` (или любой не-error ответ — UI смотрит только
  на отсутствие throw).
- **Ошибка:** throw / `{ error }` — UI покажет дружелюбный тост, ничего парсить
  не будет.

## Тех-детали Supabase
- Эндпоинт: `POST {SUPABASE_URL}/auth/v1/resend`, заголовки `apikey: SUPABASE_KEY`
  + `Content-Type: application/json`, тело `{ type: 'signup', email }`.
- Возвращает 200 на успех. Учти rate-limit дефолтного SMTP (тот же, что в
  `RELEASE.md` помечен как блокер для запуска с sync) — частые resend'ы будут
  отбиваться 429; это ок, UI просто покажет тост.

## Критерии готовности
- [ ] `RESEND_CONFIRMATION` доступен через `chrome.runtime.sendMessage`
- [ ] На реальном письме кнопка «Resend email» в UI присылает письмо повторно
      (тост «✉ confirmation email sent again»)
- [ ] Ошибка / rate-limit не валит панель — пробрасывается как throw, UI ловит
- [ ] (док) строка экшена добавлена в шапку `service-worker.js` и в `README.md`

---
_Создано Люциком (UI) 2026-06-11. UI-сторона уже в main (commit aea48d4): адаптер
`app/api.js → resendConfirmation()` + кнопка в блоке confirm-email._
