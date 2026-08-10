# backend-node — 感动晓界 AI 引擎后端

> NestJS + LangGraph + AI Engine
> 端口：13030

## 路由范围

Nginx 将以下 `/api/*` 路径转发至此服务：
- `/api/progress` — SSE 进度推送
- `/api/phase2` — 微码生成管线
- `/api/vue3` — Vue3 组件生成
- `/api/demo` — Playground AI 对话
- `/api/preview` — 组件预览
- `/api/models` — AI 模型管理

## 项目结构

```
backend-node/
├── src/
│   ├── ai-engine/        # AI 引擎（TS+JS 混合，86 个 .js 运行时模块）
│   │   ├── roles/        # 管线角色（figma-connector, visual-parser, microcode-engineer 等）
│   │   └── utils/        # 工具函数
│   ├── phase2/           # Phase2 微码生成管线
│   ├── vue3/             # Vue3 组件生成
│   ├── page-generator/   # 页面批量生成
│   └── main.ts           # 入口
├── workspace/            # 生成产物输出
├── temp-components/      # 临时组件（gitignored）
└── data/                 # 任务持久化（tasks.json）
```

## 启动

```bash
# 构建（必须使用此脚本，不可直接 npm run build）
bash build-backend.sh

# 启动（setsid + 双 fork，脱离 shell 会话）
bash .start-server.sh
```

## Polyrepo 迁移注意事项

- `process.cwd()` 即 `backend-node/` 目录
- 不再通过 `../frontend/` 跨仓库写入，前端通过 API 获取预览
- `temp-components/` 已从仓库根移至本仓库内
