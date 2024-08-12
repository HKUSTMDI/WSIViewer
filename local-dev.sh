export $(grep -v '^#' .env | xargs)

echo ${DEV_FRONTEND_PORT}

# backend
python backend/openslide/app.py ${DEV_BACKEND_PORT} &

# frontend
cd ./frontend/wsi-viewer
PORT=${DEV_FRONTEND_PORT} REACT_APP_ENV='native_development' npm run start
