<#
.SYNOPSIS
    Production deployment script for Worker Cabinet
#>

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

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
    
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Log-Error "docker-compose is not installed"
        exit 1
    }
    
    Log-Success "All dependencies are installed"
}

function Check-EnvFile {
    if (-not (Test-Path "$SCRIPT_DIR\.env")) {
        Log-Error ".env file not found in deploy\ directory"
        Log-Info "Create deploy\.env based on deploy\.env.example"
        exit 1
    }
}

function Build-Images {
    Log-Info "Building Docker images..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml build
    Pop-Location
    Log-Success "Images built"
}

function Start-Services {
    Log-Info "Starting services..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml up -d
    Pop-Location
    Log-Success "Services started"
    Log-Info "Application available at http://localhost"
}

function Stop-Services {
    Log-Info "Stopping services..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml down
    Pop-Location
    Log-Success "Services stopped"
}

function Restart-Services {
    Log-Info "Restarting services..."
    Stop-Services
    Start-Services
}

function Show-Logs {
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml logs -f
    Pop-Location
}

function Show-Status {
    Log-Info "Services status:"
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml ps
    Pop-Location
}

function Run-Migrations {
    Log-Info "Running migrations..."
    Push-Location $SCRIPT_DIR
    docker-compose -f docker-compose.prod.yml exec backend npm run migrate
    Pop-Location
    Log-Success "Migrations completed"
}

function Cleanup {
    Log-Warning "This will delete all data (DB, files, logs)!"
    $response = Read-Host "Continue? (yes/no)"
    if ($response -eq 'yes') {
        Log-Info "Cleaning up..."
        Push-Location $SCRIPT_DIR
        docker-compose -f docker-compose.prod.yml down -v --remove-orphans
        docker system prune -f
        Pop-Location
        Log-Success "Cleanup completed"
    } else {
        Log-Info "Cancelled"
    }
}

function Deploy-Full {
    Log-Info "Starting full deployment..."
    Check-Requirements
    Check-EnvFile
    Build-Images
    Start-Services
    Start-Sleep -Seconds 10
    Run-Migrations
    Log-Success "Deployment complete! Application available at http://localhost"
}

function Show-Help {
    Write-Host ""
    Write-Host "Production deployment script" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Usage: .\prod.ps1 [COMMAND]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  deploy      Full deployment (check, build, start, migrate)"
    Write-Host "  build       Build Docker images"
    Write-Host "  start       Start services"
    Write-Host "  stop        Stop services"
    Write-Host "  restart     Restart services"
    Write-Host "  logs        View logs"
    Write-Host "  status      Services status"
    Write-Host "  migrate     Run migrations"
    Write-Host "  cleanup     Full cleanup (delete volumes)"
    Write-Host "  help        Show this help"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\prod.ps1 deploy          Full deployment"
    Write-Host "  .\prod.ps1 build           Build images only"
    Write-Host "  .\prod.ps1 logs            View logs"
    Write-Host "  .\prod.ps1 restart         Restart"
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
        Log-Error "Unknown command: $Command"
        Show-Help
        exit 1
    }
}
