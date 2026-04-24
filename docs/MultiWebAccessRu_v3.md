# MultiWebAccessRu_v3

## Цель

Сделать LW2B максимально доступной для игроков из РФ и в целом для плохих/ограниченных сетей, без опоры на «удачный» маршрут, Google STUN или один хрупкий transport path.

Документ фиксирует:
- текущее состояние
- ключевые риски
- целевую сетевую схему
- пошаговый план переделки
- критерии успеха

---

## 1. Что видно сейчас

### Текущий публичный origin
- `https://w2.kislota.today/`
- same-origin online paths:
  - `/peerjs`
  - `/api/ice`
  - `/ws-relay`
  - `/mwc`

### Найденные публичные IP и точки
- `w2.kislota.today -> 116.203.107.226`
- `rts.kislota.today -> 204.168.242.157` (исторический / старый realtime host)
- Google STUN fallback:
  - `stun:stun.l.google.com:19302`
  - `stun:stun1.l.google.com:19302`
- Public PeerJS fallback:
  - `0.peerjs.com:443`

### Что уже есть хорошего
- self-hosted TURN
- short-lived TURN credentials через `/api/ice`
- TURN/TLS включён
- `TURN_PREFER_TLS=true`
- `ws-relay` уже есть
- `mwc` уже есть
- `mwc` и `ws-relay` используют same-origin WSS defaults

### Что сейчас слабое место
1. `w2.kislota.today` выглядит размещённым на Hetzner Germany, что может быть отдельным фактором плохой доступности из РФ.
2. TURN/TLS сейчас не на `443`, а на `5349`.
3. Google STUN всё ещё присутствует в runtime ICE config.
4. Нужно убедиться, что клиент реально умеет уходить в fallback path, а не только имеет этот path «на бумаге».
5. Есть риск скрытых хвостов старой infra-логики, если где-то остались ручные или старые build-конфиги.

---

## 2. Главная инженерная идея v3

Не пытаться спасать доступность одной настройкой.

Нужно сделать устойчивую многоуровневую схему:
- доступность frontend
- доступность signaling / control plane
- доступность relay / fallback transport
- доступность TURN
- понятная деградация при проблемах с UDP/WebRTC

Ключевой принцип:
**controlled same-origin ingress + TURN/TLS on 443 + websocket-based fallback + минимальная зависимость от Google и внешних публичных сервисов.**

---

## 3. Целевая схема

### 3.1. Единый боевой ingress
Желательно свести всё к одному публичному origin, который реально лучше достижим из РФ.

Предпочтительный кандидат после подтверждения тестами:
- **Hetzner Helsinki VPS**

Целевой origin:
- `https://w2.kislota.today/`

Целевые same-origin paths:
- `https://w2.kislota.today/peerjs/id`
- `https://w2.kislota.today/api/ice`
- `wss://w2.kislota.today/ws-relay`
- `wss://w2.kislota.today/mwc`

### 3.2. Целевой transport priority
Для плохих сетей и РФ приоритет должен быть не «Google STUN сначала», а controlled transport-first.

Желательная приоритетная схема:
1. `turns:w2.kislota.today:443?transport=tcp`
2. `turn:w2.kislota.today:3478?transport=tcp`
3. `turn:w2.kislota.today:3478?transport=udp`
4. optional own STUN / minimal fallback
5. Google STUN только как хвостовой запасной вариант или убрать совсем

### 3.3. Целевой fallback policy
- если основной WebRTC / PeerJS path не взлетает, не зависать молча
- должен быть явный переход на:
  - `ws-relay`, или
  - `mwc`, в зависимости от выбранной основной online-модели

### 3.4. Целевой минимальный внешний dependency footprint
Желательно не зависеть критически от:
- Google STUN
- public `0.peerjs.com`
- старого `rts.kislota.today`

---

## 4. Как это настроено сейчас

### ICE API
Сейчас `/api/ice` собирает конфиг так:
- Google STUN
- затем relay URLs
- при `TURN_ENABLE_TLS=true` и `TURN_PREFER_TLS=true` первым relay URL идёт:
  - `turns:w2.kislota.today:5349?transport=tcp`
- затем:
  - `turn:w2.kislota.today:3478?transport=tcp`
  - `turn:w2.kislota.today:3478?transport=udp`

### ws-relay
- сервер уже есть
- путь: `/ws-relay`
- клиентский default: same-origin `wss://<host>/ws-relay`

### MWC
- сервер уже есть
- путь: `/mwc`
- клиентский default: same-origin `wss://<host>/mwc`

### PeerJS
- self-hosted path на `w2.kislota.today`
- runtime ICE API default: `./api/ice`
- fallback ICE servers still include Google STUN

---

## 5. План переделки v3

## Phase 0. Подтверждение гипотезы доступности

### Задача
Подтвердить, что проблема действительно связана с текущим ingress / маршрутом / хостом, а не только с UDP/WebRTC.

### Что проверить
1. Сравнить доступность из РФ:
   - текущего `w2.kislota.today`
   - GitHub Pages fallback
   - Helsinki-host IP / будущего ingress
2. Разделить сбои по слоям:
   - frontend
   - `/peerjs`
   - `/api/ice`
   - `/ws-relay`
   - `/mwc`
   - TURN `3478`
   - TURN/TLS `443` / `5349`

### Результат фазы
- решение, переносим ли весь боевой ingress на Helsinki
- список реально проблемных слоёв

---

## Phase 1. Перенос боевого ingress на Helsinki

### Цель
Сделать Helsinki новым главным live-host для LW2B, если тесты подтверждают, что он лучше по доступности.

### Что переносим
- `w2.kislota.today`
- nginx / TLS termination
- frontend build serve
- `/peerjs`
- `/api/ice`
- `/ws-relay`
- `/mwc`
- TURN

### Почему лучше переносить весь ingress, а не куски
Если frontend останется на более проблемной площадке, игрок всё равно может не дойти до игры, даже если backend хороший.

### Результат фазы
- единый origin на Helsinki
- меньше split-архитектуры
- проще диагностика и ручные тесты

---

## Phase 2. TURN/TLS hardening

### Цель
Сделать relay path максимально похожим на обычный разрешённый TLS traffic.

### Изменения
1. Перевести TURN/TLS на `443`.
2. Если нужно, развести HTTPS ingress и TURN/TLS так, чтобы `turns:443` реально работал без конфликтов.
3. Сохранить `3478 tcp/udp` как secondary path.
4. Проверить, что `/api/ice` отдаёт `turns:...:443` первым.

### Почему это важно
`5349` нормален как стандартный TURN TLS порт, но `443` практичнее для плохих и ограниченных сетей.

### Результат фазы
- `turns:w2.kislota.today:443?transport=tcp` становится главным relay path

---

## Phase 3. Снижение зависимости от Google STUN

### Цель
Убрать Google из критического пути подключения.

### Изменения
1. Пересобрать `buildIceConfig()` так, чтобы controlled TURN шёл первым и был главным.
2. Google STUN либо:
   - уходит в хвост как слабый fallback, либо
   - выключается совсем в production режиме
3. Проверить fallback поведение без Google STUN.

### Результат фазы
- production connectivity опирается в первую очередь на controlled relay, а не на Google

---

## Phase 4. Реальный fallback policy в клиенте

### Цель
Сделать так, чтобы fallback существовал не только в архитектурных документах, но и в реальном user flow.

### Изменения
1. Явно определить primary online mode.
2. Явно определить, при каких ошибках делается fallback:
   - ICE timeout
   - PeerJS connect failure
   - websocket path failure
   - room create/join failure class
3. Реализовать или упростить переход на:
   - `ws-relay`
   - `mwc`
4. Логировать transport decision path так, чтобы потом можно было разбирать реальные сбои из РФ.

### Результат фазы
- игрок не застревает на хрупком первичном transport path
- есть управляемая деградация

---

## Phase 5. Очистка старых хвостов

### Цель
Убрать ложные, старые и опасные зависимости.

### Что зачистить
- `rts.kislota.today` как случайный runtime target
- старые manual env values
- старые build vars
- ненужные public PeerJS fallback assumptions
- outdated docs, если они создают неверную инженерную картину

### Результат фазы
- одна каноническая схема
- меньше скрытых путей поломки

---

## 6. Как должна выглядеть желаемая конечная схема

### Для доступа к сайту / игре
- `https://w2.kislota.today/` открывается стабильно из РФ
- есть резервный frontend entry при необходимости для диагностики, но не как основной костыль

### Для online server path
- `https://w2.kislota.today/peerjs/id` работает
- `https://w2.kislota.today/api/ice` работает
- TURN работает по:
  - `443/tcp` для `turns`
  - `3478/tcp`
  - `3478/udp`

### Для MWC path
- `wss://w2.kislota.today/mwc` стабильно доступен
- room create / join / in-match sync проходят через same-origin WSS

### Для fallback
- `wss://w2.kislota.today/ws-relay` стабильно доступен
- клиент умеет туда уйти при провале primary path

---

## 7. Практический приоритет работ

### P0
- подтвердить, что Helsinki лучше Germany по доступности для РФ
- подтвердить, что текущий `w2` действительно подозрителен как ingress

### P1
- перенести боевой ingress на Helsinki

### P2
- включить реальный `turns:443`
- сделать его первым relay path

### P3
- убрать Google STUN из приоритетного production path

### P4
- довести fallback policy до реального runtime поведения

### P5
- зачистить старые хвосты и обновить docs

---

## 8. Критерии успеха

Считать задачу выполненной, когда:
1. Игрок из РФ стабильно открывает `w2.kislota.today` и доходит до меню.
2. Online path не зависит критически от Google STUN.
3. TURN/TLS на `443` реально используется и помогает на плохих сетях.
4. При провале primary transport клиент не умирает молча, а переходит в рабочий fallback.
5. MWC path и fallback path проходят ручные боевые тесты.
6. В документации и runtime остаётся одна понятная каноническая схема.

---

## 9. V3 Implementation Checklist

Ниже не просто идея, а исполнимый чеклист для следующей `/new`-сессии.

### 9.1. Discovery и freeze текущего состояния

Перед изменениями:
1. зафиксировать текущий DNS для `w2.kislota.today`
2. зафиксировать текущий прод-IP и хостинг-площадку
3. снять текущие ответы и доступность:
   - `/`
   - `/peerjs/id`
   - `/api/ice`
   - `/mwc`
   - `/ws-relay`
   - `3478 tcp/udp`
   - `5349 tcp`
4. сохранить текущие env / compose / nginx значения
5. проверить, нет ли runtime-хвостов на `rts.kislota.today`

### 9.2. Решение по целевому ingress

Нужно принять одно явное решение:
- **цель: весь боевой публичный ingress переносится на Helsinki**

Это значит, что Helsinki должен стать домом для:
- `w2.kislota.today`
- frontend
- `/peerjs`
- `/api/ice`
- `/ws-relay`
- `/mwc`
- TURN

### 9.3. Инфраструктурная подготовка Helsinki

Подготовить на Helsinki:
1. nginx / TLS termination
2. сертификаты для `w2.kislota.today`
3. frontend serving
4. reverse proxy для:
   - `/peerjs`
   - `/api/ice`
   - `/ws-relay`
   - `/mwc`
5. coturn
6. peerjs container/service
7. ice-api
8. ws-relay
9. MultiWebCore runtime

### 9.4. TURN/TLS на 443

Нужно отдельно спроектировать и внедрить:
1. как дать `turns:443` без конфликта с HTTPS ingress
2. как будет устроено host-side routing / socket binding
3. как протестировать, что `turns:443` реально работает
4. сохранить `3478 tcp/udp` как secondary path

### 9.5. ICE API v3

Нужно обновить `infra/ice-server.js` так, чтобы production ICE order был ближе к:
1. `turns:w2.kislota.today:443?transport=tcp`
2. `turn:w2.kislota.today:3478?transport=tcp`
3. `turn:w2.kislota.today:3478?transport=udp`
4. optional minimal fallback
5. Google STUN только в хвосте или убрать в prod

Отдельно решить:
- будет ли production режим без Google STUN совсем
- нужен ли own STUN path
- как отличать local/dev vs prod ICE policy

### 9.6. Client/runtime config cleanup

Проверить и при необходимости обновить:
- `src/net/transports/peerjs-transport.ts`
- `src/net/transports/ws-relay-transport.ts`
- `src/net/transports/mwc-transport.ts`
- deploy vars / build vars

Цель:
- same-origin defaults остаются каноническими
- runtime не уходит в старые host/path
- fallback-конфиг не тащит старую infra-картину

### 9.7. Fallback policy implementation

Нужно решить и задокументировать:
1. что primary online mode
2. что secondary fallback mode
3. на каких ошибках делается fallback
4. как это видно в UI / logs / debug output

Минимально зафиксировать failure classes:
- ICE timeout
- PeerJS signaling failure
- TURN allocation failure
- websocket handshake failure
- room create/join failure

### 9.8. Observability и ручная диагностика

После переделки нужен короткий боевой набор проверок:
- `https://w2.kislota.today/`
- `https://w2.kislota.today/peerjs/id`
- `https://w2.kislota.today/api/ice`
- `wss://w2.kislota.today/ws-relay`
- `wss://w2.kislota.today/mwc`
- `w2.kislota.today:443`
- `w2.kislota.today:3478 tcp/udp`

И желательно:
- логировать выбранный transport path
- логировать ICE failure class
- логировать fallback decision

### 9.9. Cleanup

После переноса:
1. зачистить старые docs, которые создают неверную live-картину
2. убрать старые env / vars / comments, если они больше не каноничны
3. убедиться, что `rts.kislota.today` не участвует в runtime
4. обновить operator-facing docs и test checklist

### 9.10. Порядок выполнения в следующей `/new`-сессии

Рекомендуемый порядок:
1. подтвердить текущий Germany ingress и собрать фактическое состояние
2. подключиться к Helsinki и проверить текущую live infra
3. спроектировать `turns:443` без конфликтов
4. подготовить Helsinki как новый единый ingress
5. обновить ICE policy
6. обновить / подтвердить fallback policy
7. переключить DNS / live routing
8. провести ручные тесты из разных сетей
9. зачистить хвосты и обновить docs

### 9.11. Что считать completed

Implementation можно считать завершённым, когда:
- `w2.kislota.today` указывает на целевой live ingress
- сайт открывается стабильно
- `/api/ice`, `/peerjs`, `/ws-relay`, `/mwc` живы
- `turns:443` реально работает
- primary + fallback transport проходят ручной матч-тест
- Google STUN больше не является критическим dependency для production path
- docs соответствуют реальной схеме

---

## 10. Следующий практический шаг

Следующий шаг после этого документа:
1. открыть новую `/new`-сессию под выполнение v3
2. начать с discovery + freeze текущего live state
3. затем перейти к ingress/Helsinki и `turns:443` design
4. после этого трогать runtime ICE и fallback behavior

---

## 11. Короткий вывод

Текущая схема уже лучше, чем «голый WebRTC через Google STUN», но для реальной доступности из РФ она ещё недостаточно жёсткая.

Версия v3 должна опираться на:
- единый доступный ingress
- self-controlled TURN
- `turns:443`
- websocket fallback
- MWC / relay как реальные рабочие пути
- минимум внешних зависимостей

Именно это даёт лучший шанс на «супер доступность отовсюду», а не надежда на один удачный хост или один удачный протокол.
