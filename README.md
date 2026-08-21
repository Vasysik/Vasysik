# Vasysik profile README graphics

Это версия именно для репозитория профиля `Vasysik/Vasysik`.

## Идея

Не «аниме-дашборд», а две спокойные системные пластины:

1. `hero` — имя, четыре реальные метрики и один Steins;Gate-мотив: Nixie/world-line readout.
2. `activity` — настоящий contribution calendar + компактный language mass.

Никаких персонажей, случайного японского текста, фейковых системных показателей или десятка декоративных карточек.

## Установка

Скопируй в корень `Vasysik/Vasysik`:

- `.github/workflows/update-profile.yml`
- `scripts/update.mjs`
- папку `assets/generated`

После этого вставь содержимое `README-INSERT.md` в свой профильный `README.md`.

Зайди в `Actions` → `Update profile graphics` → `Run workflow`. После первого запуска SVG получат полный contribution calendar.

Встроенного `GITHUB_TOKEN` достаточно для публичных данных. Если хочешь учитывать доступные только тебе private contributions, создай персональный токен с минимально необходимым read-доступом и добавь его как repository secret `PROFILE_TOKEN`.

## Почему без git.vasys.ru

Для profile README это надёжнее: SVG лежат в том же репозитории, GitHub отображает их как обычные изображения. Домен можно оставить для отдельной страницы, но он не нужен для самой графики профиля.
