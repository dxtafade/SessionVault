# Задание Dexter — выбор вкладок при сохранении (engine: GET_OPEN_TABS + SAVE_SESSION.tabIds)

> ✅ **ВЫПОЛНЕНО** (2026-06-22, by Lucik по просьбе владельца — реализовано за Dexter).
> `background/service-worker.js`: добавлен `GET_OPEN_TABS`, `SAVE_SESSION` принимает
> `tabIds`, `saveCurrentSession(name, isAuto, tabIds)` фильтрует по общему ключу
> `openTabId = ${windowIndex}:${index}`. Доки обновлены (шапка SW + README). Dexter,
> при желании — отревьюй движковую часть; UI уже совместим.

## Контекст
UI «＋ Save open tabs» теперь открывает **пикер вкладок**: список открытых вкладок
с чекбоксами, выбор папки, «save N tabs» (юзер кладёт, например, только Telegram +
Facebook в папку «Соцсети», а не все вкладки сразу). UI-сторона готова и работает в
превью на mock. Нужны **два экшена в движке** (`background/` — твоя зона), пока их нет
UI грациозно откатывается к старому «сохранить всё».

Это `background/` — твоя зона. В `app/` всё готово, менять не нужно.

## Что нужно

**1. Новый экшен `GET_OPEN_TABS`** — вернуть текущие открытые вкладки для пикера.
`background/service-worker.js` (рядом с `SAVE_SESSION`):

```js
case 'GET_OPEN_TABS': {
  const tabs = await captureCurrentTabs(); // уже фильтрует не-restoreable
  // каждой вкладке нужен СТАБИЛЬНЫЙ id для выбора (UI шлёт его обратно в tabIds)
  return { tabs: tabs.map(t => ({
    id: `${t.windowId ?? 0}:${t.index}`,  // или chrome tab.id, если он есть в captureCurrentTabs
    url: t.url, title: t.title, favIconUrl: t.favIconUrl, pinned: t.pinned,
  })) };
}
```
> `captureCurrentTabs()` сейчас не кладёт `id`/`windowId` в результат — добавь их (или
> верни chrome `tab.id`), чтобы id был стабильным между GET_OPEN_TABS и SAVE_SESSION.

**2. `SAVE_SESSION` — принять необязательный `tabIds`** (подмножество). Сохранять только
выбранные вкладки; без `tabIds` — всё как раньше (обратная совместимость):

```js
case 'SAVE_SESSION': {
  await assertCanSaveManual();
  const session = await saveCurrentSession(payload.name ?? 'Unnamed session', false, payload.tabIds);
  return { session };
}
```
и в `saveCurrentSession`:
```js
async function saveCurrentSession(name, isAuto = false, tabIds = null) {
  let tabs = await captureCurrentTabs();
  if (Array.isArray(tabIds)) {
    const set = new Set(tabIds);
    tabs = tabs.filter(t => set.has(`${t.windowId ?? 0}:${t.index}`)); // тем же ключом, что в GET_OPEN_TABS
  }
  // ... дальше как сейчас (id, createdAt, tabs, folderId:null) ...
}
```

## Контракт (что шлёт/ждёт UI)
- `GET_OPEN_TABS` → `{ tabs: [{ id, url, title, favIconUrl, pinned }] }`.
- `SAVE_SESSION { name, folderId?, tabIds?: string[] }` → `{ session }`. С `tabIds` —
  только выбранные (в исходном порядке); без него — все. **id-схема ОДНА И ТА ЖЕ** в
  обоих экшенах — иначе фильтр не совпадёт.
- Папка: UI после сохранения сам зовёт `MOVE_SESSION_TO_FOLDER` (как и раньше), так что
  `folderId` в SAVE_SESSION можно игнорировать — ничего менять не надо.

## Критерии готовности
- [ ] `GET_OPEN_TABS` возвращает реальные открытые вкладки со стабильными id
- [ ] `SAVE_SESSION` с `tabIds` сохраняет ровно выбранные вкладки; без `tabIds` — все
- [ ] id-ключ совпадает между двумя экшенами (выбор реально фильтрует)
- [ ] (док) строки экшенов добавлены в шапку `service-worker.js` и в `README.md`

---
_UI готов (commit в app/api.js: `getOpenTabs()` + `saveSession(name, folderId, tabIds)`;
app/app.js: пикер `openSavePicker`). До появления экшенов «Save open tabs» работает
по-старому (сохраняет всё) — фолбэк уже встроен._
