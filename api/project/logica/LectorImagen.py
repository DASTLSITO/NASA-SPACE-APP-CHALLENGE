from abc import ABC, abstractmethod
from collections.abc import Iterator

from .Tipos import Celda, InfoImagen


class LectorImagen(ABC):
    @abstractmethod
    def obtenerInfo(self, contenido: bytes) -> InfoImagen:
        """Lanza DatosInvalidos si el contenido no es una imagen."""

    @abstractmethod
    def obtenerCeldas(self, contenido: bytes, ancho_celda: int, alto_celda: int) -> Iterator[Celda]:
        """Divide la imagen en celdas de ancho_celda x alto_celda píxeles y devuelve el color promedio de cada una.
        Las celdas del borde derecho e inferior pueden ser más chicas si la imagen no se divide exacto."""
