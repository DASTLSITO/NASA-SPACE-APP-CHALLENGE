import uuid
from pathlib import Path

from logica import AlmacenArchivos, NoEncontrado


class AlmacenArchivosLocal(AlmacenArchivos):
    def __init__(self, carpeta: Path):
        self.carpeta = carpeta
        self.carpeta.mkdir(parents=True, exist_ok=True)

    def guardarArchivo(self, contenido: bytes, extension: str) -> str:
        nombre = f"{uuid.uuid4().hex}.{extension}"
        (self.carpeta / nombre).write_bytes(contenido)
        return nombre

    def leerArchivo(self, file_path: str) -> bytes:
        ruta = self.carpeta / file_path
        if not ruta.is_file():
            raise NoEncontrado(f"No se encontró el archivo {file_path}")
        return ruta.read_bytes()
