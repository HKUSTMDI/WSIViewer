# WSIViewer 升级计划

## 升级目标

1. **后端重构**：将单文件架构改为模块化结构，新增标注存储 API
2. **前端重写**：从 React (CRA) 迁移到 Next.js，新增标注、测量、比例尺功能
3. **UI 重设计**：使用 Tailwind CSS + shadcn/ui 构建现代化界面

## 阶段规划

### 第一阶段：后端重构 + 标注 API

**目标**：将后端代码模块化，新增标注 CRUD 端点

**任务清单**：

- [ ] 创建 `core/config.py`，使用 pydantic BaseSettings 管理配置
- [ ] 创建 `core/exceptions.py`，统一异常处理
- [ ] 将路由从 `main.py` 拆分到 `routers/slides.py`
- [ ] 将 `use_openslide.py` 重构为 `services/slide_service.py`
- [ ] 创建 `schemas/slides.py`，定义请求/响应 Pydantic 模型
- [ ] 添加 CORS 中间件配置
- [ ] 端点改为使用 `use_openslide_async()` 异步调用
- [ ] 创建 `routers/annotations.py`，实现标注 CRUD
- [ ] 创建 `services/annotation_service.py`，实现 JSON 文件存储
- [ ] 创建 `schemas/annotations.py`，W3C Web Annotation 模型
- [ ] 新增 `/api/mpp/{filename}` 端点
- [ ] 新增 `/api/slides` 端点（列出可用文件）
- [ ] 迁移并更新测试
- [ ] 确保所有现有 API 兼容（不破坏旧前端）

### 第二阶段：前端框架搭建

**目标**：在 `frontend2/` 中搭建 Next.js 项目基础

**任务清单**：

- [ ] 初始化 Next.js + TypeScript 项目
- [ ] 配置 Tailwind CSS + shadcn/ui
- [ ] 配置 ESLint + Prettier
- [ ] 实现基础布局（Header + Sidebar + 主内容区）
- [ ] 实现 API 客户端（`lib/api.ts`）
- [ ] 实现 Zustand stores
- [ ] 类型定义（`types/`）

### 第三阶段：WSI 查看器核心

**目标**：实现基础的 WSI 查看功能，等同于当前版本

**任务清单**：

- [ ] 实现 `WSIViewer` 组件（OpenSeadragon + dynamic import）
- [ ] 实现文件选择器/首页
- [ ] 集成 OpenSeadragonScalebar 比例尺
- [ ] 实现缩略图导航
- [ ] 查看器工具栏（缩放、重置、全屏）
- [ ] URL 路由：`/viewer?file=xxx`

### 第四阶段：标注功能

**目标**：集成 Annotorious，实现完整标注工作流

**任务清单**：

- [ ] 集成 Annotorious v3（`@annotorious/react`）
- [ ] 实现标注工具栏（矩形、圆形、多边形、自由笔刷）
- [ ] 实现标注列表面板
- [ ] 实现标注属性编辑（标签、颜色、备注）
- [ ] 标注创建/更新/删除与后端 API 同步
- [ ] 标注可见性切换
- [ ] 键盘快捷键
- [ ] 标注导入/导出功能

### 第五阶段：测量工具

**目标**：实现长度和角度测量

**任务清单**：

- [ ] 从后端获取 MPP 数据
- [ ] 实现长度测量工具（两点距离）
- [ ] 实现角度测量工具（三点角度）
- [ ] 测量结果实时显示在画布上
- [ ] 测量单位自动转换（μm ↔ mm）

### 第六阶段：UI 打磨 + 集成

**目标**：优化 UI 体验，用 frontend2 替换 frontend

**任务清单**：

- [ ] 暗色主题实现
- [ ] 响应式布局优化
- [ ] 性能优化（瓦片加载、标注渲染）
- [ ] 更新 Docker 构建流程
- [ ] 更新 Nginx 配置
- [ ] 更新 docker-compose.yml
- [ ] 端到端测试
- [ ] 用 `frontend2` 替换 `frontend`

## 关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 前端框架 | Next.js 14+ (App Router) | SSR/SSG 支持、文件路由、更好的开发体验 |
| 标注库 | Annotorious v3 | 原生 React 支持、W3C 标准、内置多种工具 |
| 比例尺 | OpenSeadragonScalebar | NIST 维护的成熟插件，支持真实单位 |
| UI 框架 | Tailwind + shadcn/ui | 现代化、可定制、无运行时开销 |
| 状态管理 | Zustand | 轻量、简洁、TypeScript 友好 |
| 标注格式 | W3C Web Annotation | 标准化、与 Annotorious 兼容、可互操作 |
| 标注存储 | JSON 文件 → 数据库 | 先快速实现，后续可平滑迁移 |

## 参考项目

| 项目 | 参考点 |
|------|--------|
| [caMicroscope](https://github.com/camicroscope/caMicroscope) | 标注模板系统、Docker 部署架构 |
| [HistomicsUI](https://github.com/DigitalSlideArchive/HistomicsUI) | 标注 UI 设计、GeoJSON 标注存储 |
| [Annotorious](https://annotorious.dev/) | 标注工具 API、W3C 标准格式 |
| [OpenSeadragonScalebar](https://github.com/usnistgov/OpenSeadragonScalebar) | 比例尺实现 |
