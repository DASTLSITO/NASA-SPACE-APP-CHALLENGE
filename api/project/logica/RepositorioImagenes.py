from abc import ABC, abstractmethod

from modelos import Imagen, Video


class RepositorioImagenes(ABC):
    @abstractmethod
    def guardarImagen(self, descripcion: str, file_path: str) -> Imagen: ...

    @abstractmethod
    def guardarVideo(self, descripcion: str, file_path: str, duracion_en_segundos: float) -> Video: ...

    @abstractmethod
    def obtenerImagen(self, imagen_id: int) -> Imagen | None:
        """Devuelve un Video si lo que se guardó con ese ID es un video."""

    @abstractmethod
    def listarImagenes(self) -> list[Imagen]:
        """Incluye los videos, como Video."""
