from pydantic import Field

from .Imagen import Imagen


class Video(Imagen):
    DuracionEnSegundos: float = Field(gt=0)
