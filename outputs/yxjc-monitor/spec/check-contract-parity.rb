#!/usr/bin/env ruby
# =====================================================================
# check-contract-parity.rb —— mock 路由 ≡ 契约 paths 的双向差集守卫
#
# 为什么会存在：
#   mock 曾被单方扩展一条契约外路由（#26 GET /operation/monitor/sectionList），
#   而契约与 mock 的对账只靠人眼看 conflicts.md —— 没有断言就没有守卫。
#   B10 裁决（移除该路由）之后，把「两边严格相等」做成可执行判据。
#
# 用法： ruby spec/check-contract-parity.rb [mock/server.js]
# 退出码：0 = 双向差集为空（mock ≡ 契约）；1 = 存在差异；2 = 读不到文件
#
# 口径说明（不要改坏）：
#   · CONTRACT §4 共 25 条 = 24 HTTP + 1 WS。WS 走 server 的 upgrade 事件，
#     不占 HTTP 路由表，因此 mock 侧单独取 WS_PATH 补进来。
#   · 契约把 WS 通道以 get 操作登记（见 conflicts.md B8），比对前归一成 WS，
#     否则会恒定报「openapi ∖ mock = 1」的假差异。
#   · 只认字面量注册 `route('<VERB>', '<path>'`，动态拼接的路由不在此判据内
#     （当前 mock 无动态注册；若将来出现，须先改成可静态枚举的形式）。
# =====================================================================
require 'yaml'

server = ARGV[0] || File.join(__dir__, '../mock/server.js')
yaml_p = File.join(__dir__, 'openapi.local.yaml')
[server, yaml_p].each do |f|
  next if File.exist?(f)
  warn "✗ 读不到 #{f}"
  exit 2
end

src  = File.read(server)
ws   = src[/WS_PATH\s*=\s*'([^']+)'/, 1]
mock = src.scan(/route\(\s*'([A-Z]+)'\s*,\s*'([^']+)'/).map { |v, p| [v, p] }.uniq
mock += [['WS', ws]] if ws

oas = []
YAML.load_file(yaml_p)['paths'].each do |p, ops|
  (ops || {}).each_key do |m|
    m = m.to_s.downcase
    next unless %w[get post put patch delete].include?(m)
    oas << [p == ws ? 'WS' : m.upcase, p]
  end
end
oas = oas.uniq

http      = mock.count { |v, _| v != 'WS' }
only_mock = mock - oas
only_oas  = oas - mock

puts "mock : #{http} HTTP + #{mock.size - http} WS = #{mock.size}"
puts "oas  : #{oas.size}（WS 归一后）"
puts "mock ∖ oas : #{only_mock.size} #{only_mock.inspect}"
puts "oas ∖ mock : #{only_oas.size} #{only_oas.inspect}"

if only_mock.empty? && only_oas.empty?
  puts "✓ 双向差集为空（mock ≡ 契约，#{http} HTTP + 1 WS）"
  exit 0
else
  puts '✗ 存在差异：mock 多出的要删或补进契约，契约有而 mock 无的要补实现'
  exit 1
end
