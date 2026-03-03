param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Split-Path -Parent $SCRIPT_DIR

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
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Log-Error "Node.js не установлен"
        exit 1
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Log-Error "npm не установлен"
        exit 1
    }
    
    Log-Success "Все зависимости установлены"
}

function Setup-Env {
    if (-not (Test-Path "$PROJECT_DIR\backend\.env")) {
        Log-Warning "Файл .env не найден, копирую .env.example"
        Copy-Item "$PROJECT_DIR\backend\.env.example" "$PROJECT_DIR\backend\.env"
    }
}

function Start-Services {
    Log-Info "Запуск сервисов (PostgreSQL, MinIO, OnlyOffice)..."
    Push-Location $PROJECT_DIR
    docker-compose up -d postgres minio onlyoffice
    Pop-Location
    Log-Success "Сервисы запущены"
    
    Log-Info "Ожидание готовности PostgreSQL..."
    Start-Sleep -Seconds 5
    $retries = 0
    while ($retries -lt 30) {
        try {
            docker exec worker-cabinet-db pg_isready -U postgres 2>$null
            if ($LASTEXITCODE -eq 0) { break }
        } catch {}
        Start-Sleep -Seconds 1
        $retries++
    }
    Log-Success "PostgreSQL готов к работе"
}

function Install-Dependencies {
    Log-Info "Установка зависимостей..."
    Push-Location $PROJECT_DIR
    npm install
    Set-Location backend
    npm install
    Pop-Location
    Log-Success "Зависимости установлены"
}

function Run-Migrations {
    Log-Info "Запуск миграций базы данных..."
    Push-Location "$PROJECT_DIR\backend"
    npm run migrate
    Pop-Location
    Log-Success "Миграции выполнены"
}

function Seed-Database {
    $response = Read-Host "Заполнить базу тестовыми данными? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Log-Info "Заполнение базы тестовыми данными..."
        Push-Location "$PROJECT_DIR\backend"
        npm run seed
        Pop-Location
        Log-Success "База данных заполнена"
    }
}

function Start-Dev {
    Log-Info "Запуск dev сервера..."
    Push-Location $PROJECT_DIR
    npm run dev
    Pop-Location
}

function Stop-Services {
    Log-Info "Остановка сервисов..."
    Push-Location $PROJECT_DIR
    docker-compose down
    Pop-Location
    Log-Success "Сервисы остановлены"
}

function Show-Status {
    Log-Info "Статус сервисов:"
    Push-Location $PROJECT_DIR
    docker-compose ps
    Pop-Location
}

function Show-Logs {
    Push-Location $PROJECT_DIR
    docker-compose logs -f
    Pop-Location
}

function Show-Help {
    Write-Host ""
    Write-Host "Скрипт запуска dev окружения" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Использование: .\dev.ps1 [COMMAND]"
    Write-Host ""
    Write-Host "Команды:"
    Write-Host "  start       Запуск полного цикла (проверка, сервисы, миграции, dev сервер)"
    Write-Host "  services    Запуск только Docker сервисов"
    Write-Host "  deps        Установка зависимостей"
    Write-Host "  migrate     Запуск миграций"
    Write-Host "  dev         Запуск dev сервера (без сервисов)"
    Write-Host "  stop        Остановка Docker сервисов"
    Write-Host "  status      Статус сервисов"
    Write-Host "  logs        Логи сервисов"
    Write-Host "  help        Показать эту справку"
    Write-Host ""
    Write-Host "Примеры:"
    Write-Host "  .\dev.ps1 start           Полный запуск"
    Write-Host "  .\dev.ps1 services        Запуск БД, MinIO, OnlyOffice"
    Write-Host "  .\dev.ps1 dev             Запуск dev сервера"
    Write-Host ""
}

switch ($Command) {
    "start" {
        Check-Requirements
        Setup-Env
        Start-Services
        Install-Dependencies
        Run-Migrations
        Seed-Database
        Start-Dev
    }
    "services" {
        Check-Requirements
        Start-Services
    }
    "deps" {
        Install-Dependencies
    }
    "migrate" {
        Run-Migrations
    }
    "dev" {
        Start-Dev
    }
    "stop" {
        Stop-Services
    }
    "status" {
        Show-Status
    }
    "logs" {
        Show-Logs
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
