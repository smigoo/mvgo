#!/usr/bin/env bash
# dev-share.sh —— 把本机 Vite dev server（默认 2610）分享给手机 / 外网访问
#
# 用法：
#   ./scripts/dev-share.sh status   # 列出当前所有可达地址 + dev server 健康状态
#   ./scripts/dev-share.sh cf       # cloudflared quick tunnel（免登录临时域名）
#   ./scripts/dev-share.sh ngrok    # ngrok（需先配 authtoken，见下方提示）
#
# 前提：dev server 已在跑（npm run dev）。本脚本只做「暴露通道」，不负责启停 dev server。
# 只读探测 + 前台运行隧道，不改动任何服务进程。

set -uo pipefail

PORT="${PORT:-2610}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.dev-share"
mkdir -p "$LOG_DIR"

c_dim='\033[2m'; c_b='\033[1m'; c_g='\033[32m'; c_y='\033[33m'; c_r='\033[31m'; c_0='\033[0m'

lan_ip() { ipconfig getifaddr en1 2>/dev/null || ipconfig getifaddr en0 2>/dev/null; }

ts_bin() {
  [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ] \
    && echo /Applications/Tailscale.app/Contents/MacOS/Tailscale
}

health() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 4 "http://127.0.0.1:$PORT/" 2>/dev/null
}

cmd_status() {
  local code ip ts sl
  code="$(health)"
  echo -e "${c_b}dev server${c_0} : http://127.0.0.1:$PORT  $( [ "$code" = "200" ] && echo -e "${c_g}OK ($code)${c_0}" || echo -e "${c_r}不可达 ($code)${c_0}" )"

  ip="$(lan_ip)"
  [ -n "$ip" ] && echo -e "${c_b}同局域网${c_0}   : http://$ip:$PORT  ${c_dim}(手机连同一 Wi-Fi，公司网常开 AP 隔离)${c_0}"

  if [ -n "$(ts_bin)" ]; then
    ts="$("$(ts_bin)" ip -4 2>/dev/null | head -1)"
    if [ -n "$ts" ]; then
      echo -e "${c_b}Tailscale${c_0}  : http://$ts:$PORT  ${c_g}(家里手机首选，走加密穿透)${c_0}"
    else
      echo -e "${c_b}Tailscale${c_0}  : ${c_y}已安装但未登录 / 未连接${c_0}"
    fi
  else
    echo -e "${c_b}Tailscale${c_0}  : ${c_y}未安装${c_0}  → brew install --cask tailscale"
  fi

  sl="$(pmset -g 2>/dev/null | awk '/^ *sleep /{print $2; exit}')"
  echo -e "${c_b}睡眠策略${c_0}   : sleep=$sl  $( [ "$sl" = "0" ] && echo -e "${c_g}插电不睡眠，远程访问不会断${c_0}" || echo -e "${c_y}会睡眠，需要 caffeinate -dimsu 或 sudo pmset -a sleep 0${c_0}" )"
}

grab_url() {
  # $1 = 日志行，$2 = 域名后缀
  echo "$1" | grep -oE "https://[A-Za-z0-9._-]+$2" | head -1
}

print_url() {
  printf '\n%s\n' "────────────────────────────────────────────"
  printf '%s\n' " 手机打开： $1"
  printf '%s\n' "────────────────────────────────────────────"
  printf '%s\n\n' "  (Ctrl-C 结束隧道)"
}

cmd_cf() {
  command -v cloudflared >/dev/null 2>&1 || {
    echo -e "${c_r}未安装 cloudflared${c_0}  → brew install cloudflared"; exit 1;
  }
  echo -e "${c_dim}启动 cloudflared quick tunnel → localhost:$PORT  (日志: .dev-share/cf.log)${c_0}"
  cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate 2>&1 \
    | tee "$LOG_DIR/cf.log" \
    | while IFS= read -r line; do
        echo "$line"
        case "$line" in
          *trycloudflare.com*)
            u="$(grab_url "$line" '\.trycloudflare\.com')"
            [ -n "${u:-}" ] && print_url "$u"
            ;;
        esac
      done
}

cmd_ngrok() {
  command -v ngrok >/dev/null 2>&1 || {
    echo -e "${c_r}未安装 ngrok${c_0}  → brew install ngrok"; exit 1;
  }
  if ! ngrok config check >/dev/null 2>&1; then
    echo -e "${c_y}ngrok 还没配 authtoken${c_0}"
    echo "  1) 注册并复制 token: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "  2) ngrok config add-authtoken <token>"
    exit 1
  fi
  echo -e "${c_dim}启动 ngrok → localhost:$PORT  (日志: .dev-share/ngrok.log)${c_0}"
  ngrok http "$PORT" --log stdout --log-format logfmt 2>&1 \
    | tee "$LOG_DIR/ngrok.log" \
    | while IFS= read -r line; do
        case "$line" in
          *url=https://*)
            u="$(echo "$line" | sed -n 's/.*url=\(https:\/\/[^ ]*\).*/\1/p' | head -1)"
            [ -n "${u:-}" ] && print_url "$u"
            ;;
        esac
      done
}

case "${1:-status}" in
  status) cmd_status ;;
  cf)     cmd_cf ;;
  ngrok)  cmd_ngrok ;;
  *)      echo "用法: $0 [status|cf|ngrok]"; exit 1 ;;
esac
