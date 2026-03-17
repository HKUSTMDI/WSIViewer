# 前端开发文档

## 1. 项目概述

WSIViewer 前端负责全切片图像（WSI）的交互式浏览、标注和测量。当前基于 React + OpenSeadragon 构建，计划迁移到 **Next.js** 并进行全面的 UI 重设计和功能升级。

## 2. 技术栈

### 当前技术栈

| 组件 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | UI 框架 |
| OpenSeadragon | 4.1.1 | WSI 瓦片查看器 |
| react-scripts | 5.0.1 | 构建工具（Create React App） |

### 目标技术栈

| 组件 | 用途 |
|------|------|
| Next.js 14+ | React 框架（App Router） |
| TypeScript | 类型安全 |
| OpenSeadragon | WSI 瓦片查看器 |
| Annotorious v3 | 标注工具（矩形、圆形、多边形、自由笔刷） |
| OpenSeadragonScalebar | 比例尺插件 |
| Tailwind CSS | 样式框架 |
| shadcn/ui | UI 组件库 |
| Zustand | 轻量状态管理 |

## 3. 当前目录结构

```
frontend/wsi-viewer/
├── public/                   # 静态资源
│   ├── index.html
│   ├── manifest.json
│   └── favicon.ico
├── src/
│   ├── index.js              # React 入口，渲染 WSIViewer
│   ├── wsiViewer.js          # 主组件：OpenSeadragon 初始化
│   ├── index.css             # 全局样式
│   ├── misc/
│   │   └── getEnviron.js     # 环境检测（dev/prod API 地址切换）
│   ├── App.js                # 未使用的默认组件
│   ├── App.css               # 未使用的默认样式
│   └── App.test.js           # 测试文件
└── package.json
```

## 4. 目标目录结构（frontend2，Next.js）

```
frontend2/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # 根布局（导航栏、主题）
│   │   ├── page.tsx               # 首页（文件列表/上传）
│   │   └── viewer/
│   │       └── page.tsx           # 查看器页面
│   ├── components/
│   │   ├── viewer/
│   │   │   ├── WSIViewer.tsx      # OpenSeadragon 核心组件
│   │   │   ├── ViewerToolbar.tsx  # 查看器工具栏
│   │   │   ├── ScaleBar.tsx       # 比例尺组件
│   │   │   └── MiniMap.tsx        # 缩略图导航
│   │   ├── annotation/
│   │   │   ├── AnnotationLayer.tsx    # Annotorious 集成
│   │   │   ├── AnnotationToolbar.tsx  # 标注工具选择
│   │   │   ├── AnnotationList.tsx     # 标注列表面板
│   │   │   └── AnnotationForm.tsx     # 标注属性编辑表单
│   │   ├── measurement/
│   │   │   ├── MeasureTool.tsx        # 测量工具
│   │   │   ├── LengthMeasure.tsx      # 长度测量
│   │   │   └── AngleMeasure.tsx       # 角度测量
│   │   ├── ui/                        # shadcn/ui 组件
│   │   │   ├── button.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ...
│   │   └── layout/
│   │       ├── Header.tsx         # 顶部导航
│   │       └── Sidebar.tsx        # 侧边栏（标注列表/属性）
│   ├── hooks/
│   │   ├── useViewer.ts           # OpenSeadragon 实例管理
│   │   ├── useAnnotations.ts      # 标注状态管理
│   │   └── useMeasurement.ts      # 测量状态管理
│   ├── stores/
│   │   ├── viewerStore.ts         # 查看器状态（Zustand）
│   │   └── annotationStore.ts     # 标注状态（Zustand）
│   ├── lib/
│   │   ├── api.ts                 # 后端 API 客户端
│   │   ├── measurement.ts         # 测量计算工具函数
│   │   └── utils.ts               # 通用工具函数
│   └── types/
│       ├── viewer.ts              # 查看器相关类型定义
│       └── annotation.ts          # 标注相关类型定义
├── public/
│   └── icons/                     # OpenSeadragon 按钮图标
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── dockerfile
```

## 5. 当前已实现功能

- WSI 图像浏览（平移、缩放）
- DZI 协议瓦片加载
- OpenSeadragon 内置导航控件
- URL 参数指定文件（`?file=filename`）
- 开发/生产环境自动切换 API 地址

## 6. 计划实现功能

### 6.1 标注功能

| 工具 | 说明 | 优先级 |
|------|------|--------|
| 矩形 | 点击拖拽绘制矩形标注 | P0 |
| 圆形/椭圆 | 点击拖拽绘制圆形标注 | P0 |
| 多边形 | 点击添加顶点，闭合完成 | P0 |
| 自由笔刷 | 按住鼠标自由绘制 | P1 |
| 标注编辑 | 移动、调整大小、删除 | P0 |
| 标注列表 | 侧边栏显示所有标注 | P0 |
| 标注属性 | 为标注添加标签、备注、颜色 | P1 |
| 标注导入/导出 | 支持 W3C Web Annotation JSON 格式 | P1 |

**技术方案**：使用 [Annotorious v3](https://annotorious.dev/) + `@annotorious/react`
- 内置矩形和多边形工具
- Selector Pack 扩展提供圆形、椭圆、自由笔刷
- 输出 W3C Web Annotation 标准格式
- React 组件 `<OpenSeadragonAnnotator>` 直接集成

### 6.2 比例尺

| 功能 | 说明 |
|------|------|
| 动态比例尺 | 随缩放级别自动调整显示 |
| 真实单位 | 显示微米(μm)、毫米(mm) |
| 位置可配置 | 支持左下/右下角显示 |

**技术方案**：使用 [OpenSeadragonScalebar](https://github.com/usnistgov/OpenSeadragonScalebar) 插件
- 从后端 `/api/mpp/{filename}` 获取 MPP（微米/像素）
- 配置：`pixelsPerMeter = 1e6 / mpp`

### 6.3 测量工具

| 工具 | 说明 |
|------|------|
| 长度测量 | 两点之间的直线距离（μm/mm） |
| 角度测量 | 三点定义的角度 |
| 面积测量 | 闭合区域的面积（μm²/mm²） |

**技术方案**：
- 长度：基于 Canvas overlay 绘制测量线，结合 MPP 计算实际距离
- 角度：三点向量计算 `Math.atan2` 得到角度
- 面积：多边形/矩形像素面积 × MPP²

### 6.4 UI 改进

| 改进 | 说明 |
|------|------|
| 首页 | 文件列表页面，展示所有可用 WSI |
| 顶部导航栏 | 文件名显示、工具切换 |
| 侧边栏 | 标注列表、属性面板、图层控制 |
| 工具栏 | 浮动工具栏，标注/测量工具快捷切换 |
| 键盘快捷键 | R=矩形, C=圆形, P=多边形, F=自由笔刷, M=测量, Esc=取消 |
| 暗色主题 | 默认暗色主题，适合病理图像查看 |
| 响应式布局 | 适配桌面和平板设备 |

## 7. 核心组件设计

### 7.1 WSIViewer 组件

Next.js 中使用 `dynamic()` 禁用 SSR（OpenSeadragon 依赖浏览器 DOM）：

```tsx
// app/viewer/page.tsx
import dynamic from 'next/dynamic';

const WSIViewer = dynamic(() => import('@/components/viewer/WSIViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

export default function ViewerPage() {
  return <WSIViewer />;
}
```

```tsx
// components/viewer/WSIViewer.tsx
'use client';

import { useRef, useEffect } from 'react';
import OpenSeadragon from 'openseadragon';
import { OpenSeadragonAnnotator } from '@annotorious/react';

export default function WSIViewer({ file }: { file: string }) {
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    viewerRef.current = OpenSeadragon({
      element: containerRef.current,
      tileSources: `/api/dzi/${file}`,
      // ...配置
    });
    return () => viewerRef.current?.destroy();
  }, [file]);

  return (
    <OpenSeadragonAnnotator>
      <div ref={containerRef} className="w-full h-full" />
    </OpenSeadragonAnnotator>
  );
}
```

### 7.2 Annotorious 集成

```tsx
import { useAnnotator } from '@annotorious/react';

function AnnotationToolbar() {
  const annotator = useAnnotator();

  const setTool = (tool: string) => {
    annotator?.setDrawingTool(tool);
  };

  return (
    <div className="flex gap-2">
      <Button onClick={() => setTool('rectangle')}>矩形</Button>
      <Button onClick={() => setTool('polygon')}>多边形</Button>
      <Button onClick={() => setTool('circle')}>圆形</Button>
      <Button onClick={() => setTool('freehand')}>自由笔刷</Button>
    </div>
  );
}
```

### 7.3 比例尺集成

```tsx
import OpenSeadragonScalebar from 'openseadragon-scalebar';

useEffect(() => {
  if (!viewer || !mpp) return;
  OpenSeadragonScalebar(viewer, {
    pixelsPerMeter: 1e6 / mpp,
    location: OpenSeadragon.ScalebarLocation.BOTTOM_LEFT,
    minWidth: '100px',
    color: 'white',
    fontColor: 'white',
    backgroundColor: 'rgba(0,0,0,0.5)',
  });
}, [viewer, mpp]);
```

## 8. API 客户端

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

export const api = {
  // WSI
  getDziUrl: (file: string) => `${API_BASE}/dzi/${file}`,
  getThumbnail: (file: string) => `${API_BASE}/thumbnail/${file}`,
  getProperties: (file: string) =>
    fetch(`${API_BASE}/properties/${file}`).then(r => r.json()),
  getMpp: (file: string) =>
    fetch(`${API_BASE}/mpp/${file}`).then(r => r.json()),

  // Annotations
  getAnnotations: (slideId: string) =>
    fetch(`${API_BASE}/annotations/${slideId}`).then(r => r.json()),
  createAnnotation: (slideId: string, annotation: Annotation) =>
    fetch(`${API_BASE}/annotations/${slideId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation),
    }).then(r => r.json()),
  updateAnnotation: (slideId: string, annId: string, annotation: Annotation) =>
    fetch(`${API_BASE}/annotations/${slideId}/${annId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation),
    }).then(r => r.json()),
  deleteAnnotation: (slideId: string, annId: string) =>
    fetch(`${API_BASE}/annotations/${slideId}/${annId}`, {
      method: 'DELETE',
    }),
};
```

## 9. 状态管理

使用 Zustand 管理全局状态：

```typescript
// stores/viewerStore.ts
interface ViewerState {
  file: string | null;
  viewer: OpenSeadragon.Viewer | null;
  mpp: { x: number; y: number } | null;
  activeTool: 'pan' | 'rectangle' | 'circle' | 'polygon' | 'freehand' | 'measure-length' | 'measure-angle';
  setFile: (file: string) => void;
  setViewer: (viewer: OpenSeadragon.Viewer) => void;
  setMpp: (mpp: { x: number; y: number }) => void;
  setActiveTool: (tool: string) => void;
}

// stores/annotationStore.ts
interface AnnotationState {
  annotations: Annotation[];
  selectedAnnotation: string | null;
  showAnnotations: boolean;
  addAnnotation: (ann: Annotation) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  setSelected: (id: string | null) => void;
  toggleVisibility: () => void;
}
```

## 10. 代码风格规范

### 10.1 TypeScript

- **严格模式**：`strict: true`
- **路径别名**：`@/` 映射到 `src/`
- **类型导入**：使用 `import type` 区分类型导入
- **命名**：
  - 组件：`PascalCase`（文件名和组件名一致）
  - hooks：`camelCase`，`use` 前缀
  - 工具函数：`camelCase`
  - 类型/接口：`PascalCase`
  - 常量：`UPPER_SNAKE_CASE`

### 10.2 React/Next.js

- 函数组件 + Hooks（不使用 class 组件）
- 服务端组件为默认，仅在需要时添加 `'use client'`
- 使用 `useRef` 管理 DOM 引用和非响应式数据
- `useEffect` 清理副作用（viewer.destroy() 等）
- Props 接口定义在组件文件顶部

### 10.3 样式

- 使用 Tailwind CSS utility classes
- 复杂组件使用 shadcn/ui
- 避免内联 style 对象
- 响应式设计使用 Tailwind 断点（`md:`, `lg:`）

### 10.4 文件组织

- 每个组件一个文件
- 相关组件放在同一目录下
- 共享逻辑提取为 hooks
- 类型定义集中在 `types/` 目录
- 工具函数集中在 `lib/` 目录

## 11. 开发指南

### 环境搭建

```bash
cd frontend2
npm install
npm run dev      # 启动开发服务器 (http://localhost:3000)
npm run build    # 生产构建
npm run lint     # ESLint 检查
```

### 环境变量

```env
NEXT_PUBLIC_API_BASE=/api          # API 基础路径（生产环境通过 Nginx 代理）
```

### 开发流程

1. 在 `types/` 中定义相关类型
2. 在 `lib/api.ts` 中添加 API 调用方法
3. 在 `hooks/` 中封装业务逻辑
4. 在 `components/` 中实现 UI 组件
5. 在页面中组合组件
6. 编写测试
7. 更新本文档
