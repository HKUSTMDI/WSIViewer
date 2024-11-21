#!/bin/sh


#env

cp -r /nginx/nginx.conf /etc/nginx/nginx.conf

cp -r /nginx/http_proxy_common.conf /etc/nginx/http_proxy_common.conf

nginx -g "daemon off;"