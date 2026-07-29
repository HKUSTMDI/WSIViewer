# WSIViewer 升级状态

原 React CRA 前端已被 Next.js 前端替代，正式目录为 `frontend/wsi-viewer`。后端已完成模块化、异步 OpenSlide 调用、标注 API、MPP、切片列表和 SQLite 事务存储。

## 已完成

- [x] Next.js + TypeScript + Tailwind + shadcn/ui
- [x] OpenSeadragon DZI 查看器和缩略导航
- [x] Annotorious 矩形、椭圆和多边形标注
- [x] 自由画笔和连续几何橡皮擦
- [x] MULTIPOLYGON、分裂区域和内部孔洞
- [x] 标注列表、选择、Delete/Backspace 快速删除、显示切换和工具快捷键
- [x] 标注标签、备注和颜色编辑，以及 revision 冲突恢复
- [x] GeoJSON 导出界面、图像像素坐标元数据和历史 selector 兼容
- [x] MPP、动态比例尺、长度和角度测量
- [x] FastAPI 模块化路由和统一异常处理
- [x] SQLite 标注事务、revision 冲突和批量变更
- [x] JSON 自动迁移和备份迁移命令
- [x] 单元、属性、组件、并发和三浏览器测试
- [x] Docker 本地构建配置和持续集成门禁

## 后续产品功能

- [ ] 标注导入界面
- [ ] 面积测量
- [ ] 用户认证、权限和审计记录
- [ ] 面向大规模标注集的空间索引与虚拟化列表

完整工程化实施和验收记录见 [remediation-plan.md](remediation-plan.md)。
