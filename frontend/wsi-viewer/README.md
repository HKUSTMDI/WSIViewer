# WSIViewer frontend

The production frontend lives in this directory. It is a statically exported Next.js application using OpenSeadragon, Annotorious, Zustand, Tailwind CSS, and shadcn/ui.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run test:e2e
npm run build
```

The configured Node version is in `.nvmrc`. During development, `/api/*` is proxied to `http://localhost:4000`.
The UI uses local system font stacks, so development and production builds do
not depend on Google Fonts network access.

Critical freehand and eraser geometry is implemented as framework-independent modules under `src/features/annotation/geometry/`; React overlays only manage viewer integration and pointer lifecycles.

The annotation sidebar supports label, notes, and color editing with revision-aware
conflict recovery. GeoJSON exports use top-left-origin image pixel coordinates
and retain the source selector alongside normalized Polygon/MultiPolygon geometry.
