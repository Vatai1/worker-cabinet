param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

function Log-Info { Write-Host "ℹ $args" -ForegroundColor Blue }
function Log-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Log-Warning { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Log-Error { Write-Host "✗ $args" -ForegroundColor Red }

function Check-Requirements {
    Log-Info "Проверка зависимостей..."
    
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Log-Error "Docker не установлен"
        exit 1
    }
    
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Log-Error "docker-compose не установлен"
        exit 1
    }
    
    Log-Success "Все зависимости установлены"
}

function Check-EnvFile {
    if (-not (Test-Path "$SCRIPT_DIR\.env")) {
        Log-Error "Файл .env не найден в директории deploy\"
        Log-Info "Создайте файл deploy\.env на основе deploy\.env.example"
        exit 1
    }
}

function Build-Images {
    Log-Info "Сборка Docker образов..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml build
    Pop-Location
    Log-Success "Образы собраны"
}

function Start-Services {
    Log-Info "Запуск сервисов..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml up -d
    Pop-Location
    Log-Success "Сервисы запущены"
    Log-Info "Приложение доступно на http://localhost"
}

function Stop-Services {
    Log-Info "Остановка сервисов..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml down
    Pop-Location
    Log-Success "Сервисы остановлены"
}

function Restart-Services {
    Log-Info "Перезапуск сервисов..."
    Stop-Services
    Start-Services
}

function Show-Logs {
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml logs -f
    Pop-Location
}

function Show-Status {
    Log-Info "Статус сервисов:"
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml ps
    Pop-Location
}

function Run-Migrations {
    Log-Info "Запуск миграций..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml exec backend npm run migrate
    Pop-Location
    Log-Success "Миграции выполнены"
}

function Cleanup {
    Log-Warning "Это удалит все данные (БД, файлы, логи)!"
    $response = Read-Host "Продолжить? (yes/no)"
    if ($response -eq 'yes') {
        Log-Info "Очистка..."
        Push-Location $SCRIPT_DIR
        docker-compose -f docker-compose.prod.yml down -v --remove-orphans
        docker system prune -f
        Pop-Location
        Log-Success "Очистка завершена"
    } else {
        Log-Info "Отменено"
    }
}

function Deploy-Full {
    Log-Info "🚀 Полный деплой..."
    Check-Requirements
    Check-EnvFile
    Build-Images
    Start-Services
    Start-Sleep -Seconds 10
    Run-Migrations
    Log-Success "✅ Деплой завершен! Приложение доступно на http://localhost"
}

function Show-Help {
    Write-Host ""
    Write-Host "Скрипт продакшн деплоя" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Использование: .\prod.ps1 [COMMAND]"
    Write-Host ""
    Write-Host "Команды:"
    Write-Host "  deploy      Полный деплой (проверка, сборка, запуск, миграции)"
    Write-Host "  build       Сборка Docker образов"
    Write-Host "  start       Запуск сервисов"
    Write-Host "  stop        Остановка сервисов"
    Write-Host "  restart     Перезапуск сервисов"
    Write-Host "  logs        Просмотр логов"
    Write-Host "  status      Статус сервисов"
    Write-Host "  migrate     Запуск миграций"
    Write-Host "  cleanup     Полная очистка (удаление volumes)"
    Write-Host "  help        Показать эту справку"
    Write-Host ""
    Write-Host "Примеры:"
    Write-Host "  .\prod.ps1 deploy          Полный деплой"
    Write-Host "  .\prod.ps1 build           Только сборка образов"
    Write-Host "  .\prod.ps1 logs            Просмотр логов"
    Write-Host "  .\prod.ps1 restart         Перезапуск"
    Write-Host ""
}

switch ($Command) {
    "deploy" {
        Deploy-Full
    }
    "build" {
        Check-Requirements
        Check-EnvFile
        Build-Images
    }
    "start" {
        Check-EnvFile
        Start-Services
    }
    "stop" {
        Stop-Services
    }
    "restart" {
        Check-EnvFile
        Restart-Services
    }
    "logs" {
        Show-Logs
    }
    "status" {
        Show-Status
    }
    "migrate" {
        Run-Migrations
    }
    "cleanup" {
        Cleanup
    }
    {$_ -in "help", "-help", "-h", "--help"} {
        Show-Help
    }
    default {
        Log-Error "Неизвестная команда: $Command"
        Show-Help
        exit 1
    }
}
