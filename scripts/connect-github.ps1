# ============================================================
#  连接 GitHub —— 设置提交身份、挂上远程、推送
#
#  用法（在项目根目录）：
#     powershell -ExecutionPolicy Bypass -File scripts\connect-github.ps1 `
#         -User 你的GitHub用户名 -Repo 仓库名
#
#  前置：先在 GitHub 网页上建一个【空仓库】（不要勾 README / .gitignore / license）
#  推送时 Git Credential Manager 会弹出登录窗口，按提示授权即可（只需一次）
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$User,
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Name = "",
  [string]$Email = "",
  [ValidateSet('private', 'public')][string]$Visibility = 'private'
)

$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $PSScriptRoot
if (-not $Name)  { $Name  = $User }
if (-not $Email) { $Email = "$User@users.noreply.github.com" }   # GitHub 官方匿名邮箱格式

Write-Host ""
Write-Host "项目目录 : $dir" -ForegroundColor Cyan
Write-Host "提交身份 : $Name <$Email>" -ForegroundColor Cyan
Write-Host "远程地址 : https://github.com/$User/$Repo.git" -ForegroundColor Cyan
Write-Host ""

# --- 1. 必须是 git 仓库 ---
if (-not (Test-Path (Join-Path $dir '.git'))) {
  throw "当前目录不是 git 仓库。请先执行：git init -b main; git add -A; git commit -m 'init'"
}

# --- 2. 设置提交身份（只作用于本仓库）并重写首提交的作者 ---
git -C $dir config user.name  $Name
git -C $dir config user.email $Email
git -C $dir commit --amend --reset-author --no-edit | Out-Null
$author = git -C $dir log -1 --format="%an <%ae>"
Write-Host "[1/4] 提交身份已设为 $author" -ForegroundColor Green

# --- 3. 挂远程 ---
$url = "https://github.com/$User/$Repo.git"
git -C $dir remote remove origin 2>$null | Out-Null
git -C $dir remote add origin $url
Write-Host "[2/4] 已设置 origin = $url" -ForegroundColor Green

# --- 4. 推送前自检（防止把坏版本推上去）---
Write-Host "[3/4] 推送前自检…" -ForegroundColor Yellow
node "$dir\scripts\verify-site.mjs"
if ($LASTEXITCODE -ne 0) {
  Write-Host "自检未通过，已终止推送。请先修复上面的 FAIL 项。" -ForegroundColor Red
  exit 1
}
Write-Host "      自检通过" -ForegroundColor Green

# --- 5. 推送 ---
Write-Host "[4/4] 推送中（首次会弹出登录窗口）…" -ForegroundColor Yellow
git -C $dir push -u origin main

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "推送完成。" -ForegroundColor Green
  Write-Host "仓库：https://github.com/$User/$Repo" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "下一步（二选一，取决于你要不要用 GitHub Pages）："
  Write-Host "  A. GitHub Pages —— 需要仓库为 public（免费账号不支持私有仓库开 Pages）"
  Write-Host "     Settings → Pages → Source 选 GitHub Actions，之后每次 push 自动发布"
  Write-Host "     ⚠ Pages 无法自定义响应头，HTML 默认缓存约 10 分钟，更新会有延迟"
  Write-Host "  B. Cloudflare Pages / Vercel（推荐，可保持 private 仓库，且更新即时生效）"
  Write-Host "     连接同一仓库，Build command 留空，输出目录填 site"
  Write-Host ""
  Write-Host "绑定自定义域名时再继续（按你的要求已在此暂停）。"
} else {
  Write-Host ""
  Write-Host "推送失败。常见原因：" -ForegroundColor Red
  Write-Host "  · 远程仓库还不存在 → 先去 GitHub 网页建一个空仓库"
  Write-Host "  · 仓库名或用户名拼错 → 用 git remote -v 检查"
  Write-Host "  · 认证失败 → 再次运行本脚本，在弹出的窗口里重新授权"
  exit 1
}
