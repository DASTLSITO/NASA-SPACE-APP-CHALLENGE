from abc import ABC, abstractmethod
from collections.abc import Iterator

from .Tipos import CuadroVideo, InfoVideo, Region


class LectorVideo(ABC):
    @abstractmethod
    def obtenerInfo(self, ruta: str) -> InfoVideo:
        """Lanza DatosInvalidos si el archivo no es un video."""

    @abstractmethod
    def obtenerCuadros(self, ruta: str, regiones: list[Region]) -> Iterator[CuadroVideo]:
        """Recorre el video cuadro por cuadro y devuelve el color promedio y el movimiento de cada región."""
