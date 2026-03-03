<#
.SYNOPSIS
    Dev environment deployment script for Worker Cabinet
#>

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Split-Path -Parent $SCRIPT_DIR

function Log-Info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function Log-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Log-Warning { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Log-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }

function Check-Requirements {
    Log-Info "Checking dependencies..."
    
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Log-Error "Docker is not installed"
        exit 1
    }
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Log-Error "Node.js is not installed"
        exit 1
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Log-Error "npm is not installed"
        exit 1
    }
    
    Log-Success "All dependencies are installed"
}

function Setup-Env {
    if (-not (Test-Path "$PROJECT_DIR\backend\.env")) {
        Log-Warning ".env file not found, copying .env.example"
        Copy-Item "$PROJECT_DIR\backend\.env.example" "$PROJECT_DIR\backend\.env"
    }
}

function Start-Services {
    Log-Info "Starting services (PostgreSQL, MinIO, OnlyOffice)..."
    Push-Location $PROJECT_DIR
    docker-compose up -d postgres minio onlyoffice
    Pop-Location
    Log-Success "Services started"
    
    Log-Info "Waiting for PostgreSQL..."
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
    Log-Success "PostgreSQL is ready"
}

function Install-Dependencies {
    Log-Info "Installing dependencies..."
    Push-Location $PROJECT_DIR
    npm install
    Set-Location backend
    npm install
    Pop-Location
    Log-Success "Dependencies installed"
}

function Run-Migrations {
    Log-Info "Running database migrations..."
    Push-Location "$PROJECT_DIR\backend"
    npm run migrate
    Pop-Location
    Log-Success "Migrations completed"
}

function Seed-Database {
    $response = Read-Host "Seed database with test data? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Log-Info "Seeding database..."
        Push-Location "$PROJECT_DIR\backend"
        npm run seed
        Pop-Location
        Log-Success "Database seeded"
    }
}

function Start-Dev {
    Log-Info "Starting dev server..."
    Push-Location $PROJECT_DIR
    npm run dev
    Pop-Location
}

function Stop-Services {
    Log-Info "Stopping services..."
    Push-Location $PROJECT_DIR
    docker-compose down
    Pop-Location
    Log-Success "Services stopped"
}

function Show-Status {
    Log-Info "Services status:"
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
    Write-Host "Dev environment deployment script" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Usage: .\dev.ps1 [COMMAND]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  start       Full startup (check, services, migrations, dev server)"
    Write-Host "  services    Start only Docker services"
    Write-Host "  deps        Install dependencies"
    Write-Host "  migrate     Run migrations"
    Write-Host "  dev         Start dev server (without services)"
    Write-Host "  stop        Stop Docker services"
    Write-Host "  status      Show services status"
    Write-Host "  logs        Show services logs"
    Write-Host "  help        Show this help"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\dev.ps1 start           Full startup"
    Write-Host "  .\dev.ps1 services        Start DB, MinIO, OnlyOffice"
    Write-Host "  .\dev.ps1 dev             Start dev server"
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
        Log-Error "Unknown command: $Command"
        Show-Help
        exit 1
    }
}
