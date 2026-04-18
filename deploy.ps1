# PowerShell script for quick deployment
param (
    [parameter(Mandatory=$false)]
    [string]$msg = "fix: performance and UI alignment"
)

Write-Host "🚀 Starting Deployment..." -ForegroundColor Cyan

Write-Host "➕ Adding changes..."
git add .

Write-Host "💾 Committing changes..."
git commit -m "$msg"

Write-Host "📤 Pushing to production (GitHub)..."
git push --force origin main

Write-Host "✅ Deployment Complete!" -ForegroundColor Green
