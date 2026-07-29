#!/bin/sh

start=$(date +%s)
echo "Next.js builder begin: $start"

# Copy source files into the build container
cp -r /frontend/app_to_build/src /frontend/app/
cp -r /frontend/app_to_build/public /frontend/app/
cp -r /frontend/app_to_build/next.config.ts /frontend/app/
cp -r /frontend/app_to_build/tsconfig.json /frontend/app/
cp -r /frontend/app_to_build/postcss.config.mjs /frontend/app/ 2>/dev/null
cp -r /frontend/app_to_build/components.json /frontend/app/ 2>/dev/null

cd /frontend/app

# Build static export
npm run build

# Copy output to nginx html directory
rm -rf /frontend/app/build/*
cp -r /frontend/app/out/* /frontend/app/build/

end=$(date +%s)
echo "Next.js build cost: $((end - start)) seconds"
