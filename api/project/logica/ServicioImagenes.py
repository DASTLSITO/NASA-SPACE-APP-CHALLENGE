from collections.abc import Iterator

from modelos import Imagen

from .AlmacenArchivos import AlmacenArchivos
from .Catalogo import propiedadesImagen
from .Errores import DatosInvalidos, NoEncontrado
from .LectorImagen import LectorImagen
from .RepositorioImagenes import RepositorioImagenes
from .Tipos import Celda, InfoImagen, PropiedadDisponible

TAMANO_MAXIMO = 20 * 1024 * 1024


class ServicioImagenes:
    def __init__(self, repositorio: RepositorioImagenes, almacen: AlmacenArchivos, lector: LectorImagen):
        self.repositorio = repositorio
        self.almacen = almacen
        self.lector = lector

    def subirImagen(self, contenido: bytes, descripcion: str) -> Imagen:
        if len(contenido) > TAMANO_MAXIMO:
            raise DatosInvalidos("La imagen no puede pesar más de 20 MB")
        info = self.lector.obtenerInfo(contenido)
        file_path = self.almacen.guardarArchivo(contenido, info.Formato.lower())
        return self.repositorio.guardarImagen(descripcion, file_path)

    def obtenerImagen(self, imagen_id: int) -> Imagen:
        imagen = self.repositorio.obtenerImagen(imagen_id)
        if imagen is None:
            raise NoEncontrado(f"No existe la imagen {imagen_id}")
        return imagen

    def listarImagenes(self) -> list[Imagen]:
        return self.repositorio.listarImagenes()

    def obtenerInfo(self, imagen_id: int) -> InfoImagen:
        imagen = self.obtenerImagen(imagen_id)
        return self.lector.obtenerInfo(self.almacen.leerArchivo(imagen.FilePath))

    def obtenerCeldas(self, imagen_id: int, ancho_celda: int, alto_celda: int) -> Iterator[Celda]:
        imagen = self.obtenerImagen(imagen_id)
        return self.lector.obtenerCeldas(self.almacen.leerArchivo(imagen.FilePath), ancho_celda, alto_celda)

    def obtenerPropiedadesDisponibles(self, imagen_id: int) -> list[PropiedadDisponible]:
        info = self.obtenerInfo(imagen_id)
        return propiedadesImagen(info.Ancho, info.Alto)
