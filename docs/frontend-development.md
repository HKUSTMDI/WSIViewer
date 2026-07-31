# 前端开发文档

## 技术栈

- Next.js 16、React 19、TypeScript
- OpenSeadragon 6
- Annotorious 3 与 plugin-tools
- Zustand 5
- Tailwind CSS 4 与 shadcn/ui
- Vitest、Testing Library、fast-check、Playwright

正式前端目录为 `frontend/wsi-viewer`。

## 页面与数据流

```text
/                         切片列表
/viewer?file=<filename>   WSI 查看器

ViewerContent
├── WSIViewer             OpenSeadragon + Annotorious
├── ScaleBar              MPP 比例尺
├── MeasureOverlay        长度与角度
├── FreehandOverlay       自由画笔 Pointer Events
├── EraserOverlay         连续几何橡皮擦
└── ViewerSidebar         标注列表、详情编辑和 GeoJSON 导出
```

规则标注由 Annotorious 绘制。自由画笔与橡皮擦使用 Canvas 捕获 Pointer Events，但几何计算位于 `src/features/annotation/geometry/` 的纯 TypeScript 模块中。

橡皮擦使用 Annotorious 原生 `MULTIPOLYGON`，可以表达一个标注的多个外部片段和内部孔洞。一次擦除通过后端批量 API 原子提交。

## 标注详情与 GeoJSON

选中侧栏中的标注后，可以编辑标签、备注和显示颜色。字段以 Web Annotation
`TextualBody` 保存：

- 标签：`purpose: "tagging"`
- 备注：`purpose: "commenting"`
- 颜色：`purpose: "wsi-color"`，值为六位十六进制颜色

读取时兼容旧版仅含一个 `commenting` body 的标注，并将它作为原标签显示。
保存仅替换上述受管理字段，其他 body 保持不变。每次更新携带当前 revision；
发生 409 时会加载服务端最新版本、保留用户草稿并要求重新确认，避免静默覆盖。
保存成功后的 annotation 会同步回 Annotorious，因此连续编辑使用最新 revision。

选中标注后，`Delete` 和 macOS 键盘上的 `Backspace` 都会删除整个标注，并走与
侧栏删除按钮相同的 revision-safe 流程。输入框、文本框、下拉框和
contenteditable 区域拥有按键优先权，不会误删标注；Ctrl、Command、Alt
组合键也会原样保留。整标注删除优先于 Annotorious 的顶点删除行为，长按或
快速重复按键会去重，409 冲突后仍需用户再次确认。

侧栏的 GeoJSON 按钮导出当前切片的全部标注。导出坐标是 WSI 图像像素坐标，
原点在左上角，X 向右、Y 向下，单位为 pixel，不是经纬度。矩形、椭圆、
POLYGON、MULTIPOLYGON，以及旧版 SVG polygon 和
`xywh=pixel:` FragmentSelector 均可转换；无效或不支持的几何会终止导出并指出
annotation ID，避免生成缺少标注的不完整文件。Feature 同时保留原始 selector，
以免椭圆多边形近似造成不可逆的信息丢失。

## 状态与错误处理

- `viewerStore` 保存当前文件、MPP、工具、错误、侧栏和 Annotorious 操作句柄。
- `annotationStore` 保存已提交标注和选中状态。
- `lib/api.ts` 统一检查 HTTP 状态、解析错误、编码路径并支持 AbortSignal。
- 切换切片会取消旧请求，避免迟到响应污染新页面。

## 开发命令

```bash
cd frontend/wsi-viewer
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run test:e2e
npm run build
```

开发服务器将 `/api/*` 代理到 `http://localhost:4000`。生产构建使用 Next.js static export，由 Nginx 提供静态文件。
Playwright 使用独立的 `.next-playwright` 输出目录，因此可以与正在运行的普通
开发服务器并行执行，不会争用 Next.js 的构建锁。

## 测试要求

- 几何核心：100% 行/函数覆盖，至少 95% 分支覆盖。
- 橡皮擦属性测试：每次至少 1,000 组随机输入。
- 组件测试必须覆盖 `pointerup`、`pointercancel`、失败回滚和重复提交边界。
- Playwright 在 Chromium、Firefox、WebKit 验证绘制、擦除、详情连续编辑、
  GeoJSON 真实下载、快捷删除、输入区保护和刷新恢复。
- 不允许长期 `.only`、无说明 `.skip` 或不稳定重试。

## 添加标注工具

1. 将纯计算放入 `src/features/annotation/geometry/` 并先编写单元/属性测试。
2. 在 overlay 中只处理 DOM、OpenSeadragon 和 Pointer Events。
3. 后端变更使用 revision 或批量事务 API。
4. 补充组件测试和三浏览器 E2E。
5. 运行全部前端门禁后提交。
