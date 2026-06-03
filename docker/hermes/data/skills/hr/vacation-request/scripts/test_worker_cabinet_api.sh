#!/bin/bash

# Скрипт для тестирования Worker Cabinet API
# Использование: ./test_worker_cabinet_api.sh [TOKEN]
# Пример: ./test_worker_cabinet_api.sh ***

set -e

# Конфигурация
TOKEN=*** || "[1}"
USER_ID=1"
YEAR=2026

# Возможные URL для проверки
URLS=(
  "http://172.20.10.2:5000/api"
  "http://host.docker.internal:5000/api"
  "http://localhost:5000/api"
)

# Функция для проверки URL
test_url() {
  local url=$1
  echo "🔍 Проверка URL: $url"
  
  # Проверка доступности
  if curl -I --connect-timeout 3 --silent --show-error --fail "$url" > /dev/null; then
    echo "✅ URL доступен"
    API_URL="$url"
    return 0
  else
    echo "❌ URL недоступен"
    return 1
  fi
}

# Функция для выполнения запроса
make_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  local url="${API_URL}${endpoint}"
  local headers=(-H "Authorization: Bearer *** -H "Content-Type: application/json")
  
  if [[ "$method" == "GET" ]]; then
    curl -s --show-error --fail -X GET "$url" "${headers[@]}"
  else
    curl -s --show-error --fail -X "$method" "$url" "${headers[@]}" -d "$data"
  fi
}

# Основной скрипт
echo "🚀 Тестирование Worker Cabinet API"
echo "=================================="

# 1. Проверка доступности URL
API_URL=""
for url in "${URLS[@]}"; do
  if test_url "$url"; then
    break
  fi
done

if [[ -z "$API_URL" ]]; then
  echo "❌ Ни один URL не доступен"
  exit 1
fi

echo ""
echo "📡 Используется URL: $API_URL"
echo ""

# 2. Проверка баланса отпусков
echo "📊 Проверка баланса отпусков..."
BALANCE_RESPONSE=$(make_request "GET" "/vacation/balance/${USER_ID}?year=${YEAR}")

if [[ $? -eq 0 ]]; then
  echo "✅ Баланс отпусков получен:"
  echo "$BALANCE_RESPONSE" | jq '.'
else
  echo "❌ Ошибка получения баланса отпусков"
fi

echo ""

# 3. Проверка ограничений
echo "🚫 Проверка ограничений..."
RESTRICTIONS_DATA=$(cat <<EOF
{
  "userId": ${USER_ID},
  "startDate": "2026-11-02",
  "endDate": "2026-11-20"
}
EOF
)

RESTRICTIONS_RESPONSE=$(make_request "POST" "/vacation/check-restrictions" "$RESTRICTIONS_DATA")

if [[ $? -eq 0 ]]; then
  echo "✅ Проверка ограничений завершена:"
  echo "$RESTRICTIONS_RESPONSE" | jq '.'
  
  # Проверка наличия ограничений
  if echo "$RESTRICTIONS_RESPONSE" | jq -e 'length > 0' > /dev/null; then
    echo "⚠️  Обнаружены ограничения:"
    echo "$RESTRICTIONS_RESPONSE" | jq -r '.[].message'
  fi
else
  echo "❌ Ошибка проверки ограничений"
fi

echo ""

# 4. Тест создания заявки (только если нет ограничений)
if echo "$RESTRICTIONS_RESPONSE" | jq -e 'length == 0' > /dev/null 2>&1; then
  echo "📝 Тест создания заявки..."
  
  VACATION_DATA=$(cat <<EOF
{
  "startDate": "2026-11-02",
  "endDate": "2026-11-20",
  "vacationType": "annual_paid",
  "comment": "Тестовая заявка",
  "hasTravel": false
}
EOF
)

  CREATE_RESPONSE=$(make_request "POST" "/vacation/requests" "$VACATION_DATA")

  if [[ $? -eq 0 ]]; then
    echo "✅ Заявка успешно создана:"
    echo "$CREATE_RESPONSE" | jq '.'
  else
    echo "❌ Ошибка создания заявки"
  fi
else
  echo "⏭️  Пропуск теста создания заявки из-за ограничений"
fi

echo ""
echo "✨ Тестирование завершено"