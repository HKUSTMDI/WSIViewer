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
    cors_origins: list[str] = ["*"]


settings = Settings()

# Ensure annotation directory exists
Path(settings.annotation_dir).mkdir(parents=True, exist_ok=True)
