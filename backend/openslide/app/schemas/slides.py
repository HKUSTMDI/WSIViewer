from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class SlideInfo(BaseModel):
    filename: str
    size_bytes: int | None = None


class MppResponse(BaseModel):
    mpp_x: float | None = None
    mpp_y: float | None = None
    objective_power: float | None = None
