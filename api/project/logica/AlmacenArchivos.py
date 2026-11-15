from abc import ABC, abstractmethod


class AlmacenArchivos(ABC):
    @abstractmethod
    def guardarArchivo(self, contenido: bytes, extension: str) -> str:
        """Guarda el archivo y devuelve el FilePath con el que se vuelve a leer."""

    @abstractmethod
    def leerArchivo(self, file_path: str) -> bytes: ...
