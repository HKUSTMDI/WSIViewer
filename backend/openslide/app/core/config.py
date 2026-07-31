from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings managed via environment variables."""

    model_config = {"env_prefix": "WSI_"}

    app_name: str = "WSIViewer API"
    image_dir: str = "./images/"
    annotation_dir: str = "./annotations/"
    annotation_db: str | None = None
    max_workers: int = 10
    slide_cache_size_per_thread: int = 2
    # The browser normally reaches the API through the same-origin Next/Nginx
    # proxy. Keep only the two local Next.js development origins enabled by
    # default; deployments that need another origin must opt in explicitly
    # through WSI_CORS_ORIGINS.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


settings = Settings()

# Ensure annotation directory exists
Path(settings.annotation_dir).mkdir(parents=True, exist_ok=True)
