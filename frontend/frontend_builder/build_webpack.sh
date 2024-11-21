#!/bin/sh

start=`date +%s`

echo 'builder begin: ' $start


cp -r /frontend/app_to_build/src /frontend/app/
cp -r /frontend/app_to_build/public /frontend/app/
cp -r /frontend/app_to_build/package.json /frontend/app/

cd /frontend/app

export NODE_OPTIONS=--openssl-legacy-provider

npm run build

end=`date +%s`

echo 'npm build cost:' $end '-' $start '=' $(( $end - $start )) 'seconds'