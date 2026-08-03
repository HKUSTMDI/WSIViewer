# 前端开发文档

本文描述 `main` 分支当前前端的结构、关键约束和修改方式。它是贡献者手册，
不是历史升级记录或未来路线图。正式前端目录为 `frontend/wsi-viewer`。

## 当前能力与技术栈

前端使用 Next.js 16、React 19、TypeScript、Tailwind CSS 4 和 shadcn/ui。
WSI 浏览由 OpenSeadragon 6 提供，规则图形标注由 Annotorious 3 提供；自由画笔、
橡皮擦、长度和角度测量使用独立 Canvas overlay。Zustand 管理查看器和标注状态。

当前页面只有两个：

```text
/                         切片列表
/viewer?file=<filename>   WSI 查看器
```

首页从 `GET /api/slides` 读取切片。查看器通过 DZI 接口加载瓦片，同时读取 MPP 和
标注。生产构建是 Next.js static export，不运行 Next.js 生产服务器。

## 开发环境

Node 版本记录在 `.nvmrc`，当前为 Node 22。第一次安装：

```bash
cd frontend/wsi-viewer
npm ci
```

推荐从仓库根目录运行完整开发环境：

```bash
./dev.sh
```

它在 `127.0.0.1:3000` 启动 Next.js，在 `127.0.0.1:4000` 启动 FastAPI，并让
后端读取仓库根目录的 `images/`。也可以只启动前端：

```bash
cd frontend/wsi-viewer
npm run dev
```

此时 `next.config.ts` 会把 `/api/*` 代理到 `http://localhost:4000/api/*`，因此
后端仍需单独运行。前端不包含可用的内置 WSI 数据。

## 目录与职责

```text
frontend/wsi-viewer/
├── src/app/                         页面、全局样式和根布局
├── src/components/viewer/           OSD 查看器、工具栏、比例尺和页面编排
├── src/components/annotation/       Annotorious 桥接、编辑器、列表和 Canvas 工具
├── src/components/measurement/      长度与角度测量 overlay
├── src/components/layout/           查看器侧栏
├── src/components/ui/               通用 shadcn/ui 组件
├── src/features/annotation/         标注 body、GeoJSON、变更队列
├── src/features/annotation/geometry  与 React 无关的纯几何核心
├── src/hooks/                        快捷键与 OSD 导航策略
├── src/lib/                          API、部署路径、测量和通用函数
├── src/stores/                       Zustand stores
├── src/types/                        前端领域类型
├── src/test/                         Vitest 全局测试配置
└── e2e/                              Playwright 跨浏览器测试
```

主要组件关系：

```text
ViewerContent
├── WSIViewer
│   ├── OpenSeadragonViewer
│   └── AnnotationHandler
├── ViewerToolbar
├── ScaleBar
├── MeasureOverlay
├── FreehandOverlay
├── EraserOverlay
└── ViewerSidebar
    ├── AnnotationList
    └── AnnotationEditor
```

`ViewerContent` 是页面级协调者：绑定当前切片、工具、键盘操作、删除、详情更新和
GeoJSON 导出。不要把几何算法继续堆进这个组件。

## 查看器、工具与导航

`viewerStore` 保存当前文件、MPP、全局错误、活动工具、标注可见性、侧栏状态、
橡皮擦尺寸和供树外组件调用的 Annotorious 操作。`annotationStore` 只保存已提交
标注和当前选中 ID。

工具定义在 `types/viewer.ts`，工具栏在 `ViewerToolbar.tsx`。快捷键为：

| 工具 | 快捷键 |
| --- | --- |
| 平移 | `V` |
| 矩形 | `R` |
| 圆形/椭圆 | `C` |
| 多边形 | `P` |
| 自由画笔 | `F` |
| 橡皮擦 | `E` |
| 长度测量 | `M` |
| 角度测量 | `A` |

`Escape` 返回平移工具。选中标注后，`Delete` 或 `Backspace` 删除标注。输入框、
文本框、下拉框、contenteditable 和带 Ctrl/Command/Alt 的组合键不会触发工具
快捷键或删除。

`useViewerNavigationPolicy` 是 OSD 导航状态的唯一策略层。只有 `pan` 模式允许
鼠标导航；Annotorious 在绘制结束后可能重新启用导航，该 hook 会立即恢复与当前
工具一致的状态。在平移手势结束、取消或窗口失焦后，它也会恢复平移能力。修改
工具生命周期时必须同时测试滚轮缩放、拖拽平移、绘制结束和删除全部标注后的状态。

## 标注数据流

规则图形由 Annotorious 创建和编辑。`AnnotationHandler` 负责：

- 在切片变化时取消旧请求并加载标注与 MPP；
- 把 Annotorious create/update/delete 事件写入 API；
- 用 `Origin.REMOTE` 应用服务端结果，避免再次触发写请求；
- 合并新建请求完成前发生的几何更新；
- 隔离切片切换后的迟到响应；
- 在 404/409 时恢复 UI 和服务端的一致状态。

自由画笔不经过 Annotorious 的绘图工具。`FreehandOverlay` 捕获 Pointer Events，
调用 `features/annotation/geometry/freehand.ts` 采样、简化并生成 selector，保存
成功后再同步进 Annotorious。

橡皮擦使用屏幕像素直径，但运算前转换到图像坐标。它通过
`geometry/eraser.ts` 对 Polygon/MultiPolygon 做连续扫掠差集，并通过批量 API
一次提交整笔 create/update/delete；任一操作失败时后端回滚整批。

同一标注的异步变更必须通过 `mutationQueue.ts` 排队。更新和删除要携带最新
`revision`；409 表示其他客户端先修改了标注，不能用本地旧数据静默覆盖。

## 标注格式与导出

前后端交换 W3C Web Annotation 风格对象。标注详情使用 `TextualBody`：

- 标签：`purpose: "tagging"`
- 备注：`purpose: "commenting"`
- 颜色：`purpose: "wsi-color"`

受支持的主要 selector 为 Annotorious 规则图形、`POLYGON` 和 `MULTIPOLYGON`。
读取代码仍可解析部分历史 SVG polygon 和 `xywh=pixel:` selector，但新增功能应
输出当前规范格式。

GeoJSON 导出位于 `features/annotation/geojson.ts`。坐标是原始 WSI 图像像素，
原点位于左上角，不是经纬度。无法转换的标注会让整次导出失败并显示 annotation
ID，避免生成悄悄缺失数据的文件。

## API 与部署路径

所有请求必须通过 `lib/api.ts`，不要在组件中直接拼接 `fetch` URL。客户端统一
检查 HTTP 状态、解析 JSON/文本错误、编码文件名和标注 ID，并支持
`AbortSignal`。

`lib/deployment.ts` 管理部署路径：

- `NEXT_PUBLIC_BASE_PATH`：应用公开路径前缀，例如 `/openmetal-wsiviewer`；
- `NEXT_PUBLIC_API_BASE`：可选 API 地址；留空时自动使用 `<basePath>/api`。

这两个值会编译进静态文件。生产部署修改它们后必须重新执行 `next build` 或重跑
前端 builder；只重启 Nginx 不会改变旧 JavaScript 中的 API 地址。反向代理的
完整示例见根目录 README。

## 常见修改方式

### 增加或修改标注工具

1. 在 `ActiveTool` 和 `ViewerToolbar` 中定义工具及快捷键。
2. 纯坐标或几何逻辑放入 `features/annotation/geometry/`。
3. overlay 只处理 DOM、Canvas、Pointer Events 和 OSD 坐标入口。
4. 明确 `pointerdown → move → up/cancel`、工具切换、切片切换和卸载行为。
5. 需要多项持久化变更时使用 batch API，不要逐项提交半成品。
6. 同时补充纯函数、组件和三浏览器测试。

### 增加标注字段

1. 更新 `types/annotation.ts` 和 `features/annotation/body.ts`。
2. 修改 `AnnotationEditor` 的草稿和保存逻辑。
3. 保留不由本功能管理的其他 W3C body 字段。
4. 如 API schema 变化，同步修改后端 Pydantic 模型和两端测试。

### 增加 API 调用

1. 在 `lib/api.ts` 添加类型化方法，并使用 `segment()` 编码路径参数。
2. 页面加载请求应接受 `AbortSignal`，切换页面或切片时取消。
3. 为成功、4xx/5xx、非 JSON 响应和取消增加测试。
4. 不要把失败请求当作空数据；UI 应区分“API 失败”和“确实没有切片”。

### 增加页面或静态资源

页面放在 `src/app/`。内部导航优先使用 Next.js `Link`；手工生成静态资源或 OSD
图标路径时使用 `appPath()`，确保 URL 前缀部署仍然工作。完成后同时验证根路径和
带 `NEXT_PUBLIC_BASE_PATH` 的生产构建。

## 测试与质量门禁

```bash
cd frontend/wsi-viewer
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run test:e2e
npm run build
```

- Vitest 测试与源码放在一起，命名为 `*.test.ts` 或 `*.test.tsx`。
- Playwright 测试位于 `e2e/`，默认覆盖 Chromium、Firefox 和 WebKit。
- E2E 使用 `127.0.0.1:3100` 和独立 `.next-playwright`，可与普通开发服务器并行。
- 总覆盖率门槛记录在 `vitest.config.ts`；几何核心要求 100% 行/函数覆盖和至少
  95% 分支覆盖。
- 几何属性测试应覆盖非有限值、退化图形、触边、分裂、孔洞和随机输入不变量。
- Pointer 组件测试至少覆盖 `pointerup`、`pointercancel`、失败回滚和重复提交。
- 不提交 `.only`；需要 `.skip` 时必须说明原因，不能用重试掩盖确定性缺陷。

CI 还会执行依赖审计、URL 前缀静态导出检查和全栈 Docker 冒烟测试。

## 构建与排障

```bash
cd frontend/wsi-viewer
npm run build                    # 输出到 out/
./build-image.sh                 # 构建本地 frontend builder 镜像
```

Docker 中 `build_nextjs.sh` 会在临时 release 目录完成构建和校验，再原子切换
`nginx/html/current`。构建失败时不应覆盖上一份可用静态文件。

常见问题：

- 字体或依赖下载拖慢开发启动：检查是否重新引入远程字体或安装步骤。
- 页面显示 `No slides found`：先检查浏览器 Network 中 `/api/slides`；404/500 是
  API 或代理故障，不等同于空目录。
- 子路径下资源 404：确认构建时设置 `NEXT_PUBLIC_BASE_PATH`，并重新运行 builder。
- 内部 Nginx 日志显示 `/api/slides`：外层代理剥离公开前缀后的正常路径；应继续
  根据状态码检查 FastAPI。
- 工具切换后仍能缩放或 Pan 失效：从 `useViewerNavigationPolicy` 和对应 Pointer
  生命周期测试开始排查，不要在多个组件分别控制 OSD navigation。
