from abc import ABC, abstractmethod

from modelos import Imagen


class RepositorioImagenes(ABC):
    @abstractmethod
    def guardarImagen(self, descripcion: str, file_path: str) -> Imagen: ...

    @abstractmethod
    def obtenerImagen(self, imagen_id: int) -> Imagen | None: ...

    @abstractmethod
    def listarImagenes(self) -> list[Imagen]: ...
