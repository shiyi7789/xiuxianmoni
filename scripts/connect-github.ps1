# ============================================================
#  连接 GitHub —— 设置提交身份、挂远程、自检、推送
#
#  用法（在项目根目录）：
#     powershell -ExecutionPolicy Bypass -File scripts\connect-github.ps1 `
#         -User 你的GitHub用户名 -Repo 仓库名
#
#  前置：先在 GitHub 网页建一个【空仓库】
#        ⚠ 不要勾选 "Add a README file" / .gitignore / license
#          勾了也能用本脚本（会自动识别并询问是否覆盖），但要多绕一步
#
#  可选参数：
#     -Name / -Email        提交身份，默认 用户名 / 用户名@users.noreply.github.com
#     -Force                遇到不相干历史时不再询问，直接覆盖
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$User,
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Name = "",
  [string]$Email = "",
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $PSScriptRoot
if (-not $Name)  { $Name  = $User }
if (-not $Email) { $Email = "$User@users.noreply.github.com" }   # GitHub 官方匿名邮箱格式
$url = "https://github.com/$User/$Repo.git"

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

Say ""
Say "项目目录 : $dir" Cyan
Say "提交身份 : $Name <$Email>" Cyan
Say "远程地址 : $url" Cyan
Say ""

# ---------- 0. 环境检查 ----------
if (-not (Test-Path (Join-Path $dir '.git'))) {
  throw "当前目录不是 git 仓库。请先执行：git init -b main; git add -A; git commit -m 'init'"
}

# ---------- 1. 身份 + 重写首提交作者 ----------
git -C $dir config user.name  $Name
git -C $dir config user.email $Email
git -C $dir commit --amend --reset-author --no-edit | Out-Null
$author = (git -C $dir log -1 --format="%an <%ae>")
Say "[1/5] 提交身份已设为 $author" Green

# ---------- 2. 挂远程 ----------
git -C $dir remote remove origin 2>$null | Out-Null
git -C $dir remote add origin $url
Say "[2/5] 已设置 origin" Green

# ---------- 3. 探测远程状态（决定用哪种推送策略）----------
Say "[3/5] 探测远程…" Yellow

# 探测阶段关闭交互式凭据弹窗，避免非交互场景卡住
$env:GIT_TERMINAL_PROMPT = '0'
$remote = git -C $dir ls-remote --heads origin 2>&1
$failCode = $LASTEXITCODE
Remove-Item Env:\GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue

if ($failCode -ne 0) {
  Say ""
  Say "无法访问远程仓库。请检查：" Red
  Say "  · 仓库是否已在 GitHub 上创建（且名称拼写正确）"
  Say "  · 网络是否可达 github.com"
  Say "  · git 的输出：$remote" DarkGray
  exit 1
}

$remoteHasMain = ($remote -match 'refs/heads/main')
$localHead = (git -C $dir rev-parse main)

if (-not $remoteHasMain) {
  Say "      远程还没有 main 分支，直接推送即可" Green
  $strategy = 'plain'
} else {
  git -C $dir fetch origin main 2>$null | Out-Null
  $remoteHead = (git -C $dir rev-parse refs/remotes/origin/main 2>$null)
  $base = (git -C $dir merge-base main refs/remotes/origin/main 2>$null)

  if ($remoteHead -eq $localHead) {
    Say "      远程已与本地一致，无需推送" Green
    $strategy = 'done'
  } elseif ($base) {
    Say "      远程与本地同源，将用 rebase 合并后推送" Green
    $strategy = 'rebase'
  } else {
    # 典型场景：建仓库时勾了 README，GitHub 生成了一个不相干的 Initial commit
    Say ""
    Say "远程已有一个与本地【历史不相干】的提交：" Yellow
    git -C $dir log -1 --stat --oneline refs/remotes/origin/main | ForEach-Object { Say "    $_" DarkGray }
    Say ""
    Say "它通常是创建仓库时勾选 README 自动生成的占位提交，没有实际价值。" Yellow
    Say "继续将用 --force-with-lease 覆盖它（只覆盖远程多出来的提交，不动你的代码）。" Yellow
    Say ""
    $ans = ''
    if (-not $Force) { $ans = Read-Host "确认覆盖远程那个占位提交？输入 y 继续" }
    if ($Force -or $ans -eq 'y' -or $ans -eq 'Y') {
      $strategy = 'force'
    } else {
      Say "已取消，远程未做任何改动。" Red
      Say "若想保留远程那个 README，可手动执行（会冲突，需手工解决 README.md）：" DarkGray
      Say "  git pull --rebase --allow-unrelated-histories origin main" DarkGray
      exit 1
    }
  }
}

# ---------- 4. 推送前自检 ----------
Say "[4/5] 推送前自检…" Yellow
node "$dir\scripts\verify-site.mjs"
if ($LASTEXITCODE -ne 0) {
  Say "自检未通过，已终止推送。请先修复上面的 FAIL 项。" Red
  exit 1
}
Say "      自检通过" Green

# ---------- 5. 推送 ----------
Say "[5/5] 推送中（首次可能弹出登录窗口，授权一次即可）…" Yellow

switch ($strategy) {
  'done'   { $code = 0 }
  'plain'  { git -C $dir push -u origin main;   $code = $LASTEXITCODE }
  'rebase' { git -C $dir pull --rebase origin main; git -C $dir push -u origin main; $code = $LASTEXITCODE }
  'force'  { git -C $dir fetch origin main; git -C $dir push --force-with-lease -u origin main; $code = $LASTEXITCODE }
}

if ($code -ne 0) {
  Say ""
  Say "推送失败。常见原因：" Red
  Say "  · 认证被取消或凭据失效 → 再跑一次本脚本，在弹窗里重新授权"
  Say "  · 仓库名 / 用户名拼写错误 → 用 git remote -v 检查"
  Say "  · 远程在你操作期间又变了 → 再跑一次本脚本（会用新的 lease 重试）"
  exit 1
}

Say ""
Say "推送完成。" Green
Say "仓库地址：https://github.com/$User/$Repo" Cyan
Say ""
Say "下一步（二选一）："
Say "  A. GitHub Pages —— 需仓库为 public（免费账号不支持私有仓库开 Pages）"
Say "     Settings → Pages → Source 选 GitHub Actions，之后每次 push 自动发布"
Say "     ⚠ Pages 无法自定义响应头，HTML 默认缓存约 10 分钟，更新会有延迟"
Say "  B. Cloudflare Pages / Vercel（推荐，可保持 private，且更新即时生效）"
Say "     连接同一仓库，Build command 留空，输出目录填 site"
Say ""
Say "绑定自定义域名时再继续。"
