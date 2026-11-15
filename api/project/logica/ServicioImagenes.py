import re
from collections.abc import Iterator
from pathlib import Path

from modelos import Imagen, Video

from .AlmacenArchivos import AlmacenArchivos
from .Catalogo import propiedadesImagen, propiedadesVideo
from .Errores import DatosInvalidos, NoEncontrado
from .LectorImagen import LectorImagen
from .LectorVideo import LectorVideo
from .RepositorioImagenes import RepositorioImagenes
from .Tipos import Celda, CuadroVideo, InfoImagen, InfoVideo, PropiedadDisponible, Region

TAMANO_MAXIMO = 20 * 1024 * 1024
TAMANO_MAXIMO_VIDEO = 200 * 1024 * 1024


class ServicioImagenes:
    def __init__(
        self,
        repositorio: RepositorioImagenes,
        almacen: AlmacenArchivos,
        lector: LectorImagen,
        lector_video: LectorVideo,
    ):
        self.repositorio = repositorio
        self.almacen = almacen
        self.lector = lector
        self.lector_video = lector_video

    def subirImagen(self, contenido: bytes, descripcion: str, nombre_archivo: str = "") -> Imagen:
        """Sube una imagen o un video: si no es una imagen, se intenta como video."""
        if len(contenido) > TAMANO_MAXIMO_VIDEO:
            raise DatosInvalidos("El archivo no puede pesar más de 200 MB")
        try:
            info = self.lector.obtenerInfo(contenido)
        except DatosInvalidos:
            return self._subirVideo(contenido, descripcion, nombre_archivo)
        if len(contenido) > TAMANO_MAXIMO:
            raise DatosInvalidos("La imagen no puede pesar más de 20 MB")
        file_path = self.almacen.guardarArchivo(contenido, info.Formato.lower())
        return self.repositorio.guardarImagen(descripcion, file_path)

    def _subirVideo(self, contenido: bytes, descripcion: str, nombre_archivo: str) -> Video:
        # la extensión del nombre original sirve después para que el navegador sepa reproducirlo
        extension = Path(nombre_archivo).suffix.lower().lstrip(".")
        if not re.fullmatch(r"[a-z0-9]{1,5}", extension):
            extension = "mp4"
        file_path = self.almacen.guardarArchivo(contenido, extension)
        try:
            info = self.lector_video.obtenerInfo(self.almacen.rutaLocal(file_path))
        except DatosInvalidos:
            self.almacen.eliminarArchivo(file_path)
            raise DatosInvalidos("El archivo no es una imagen ni un video válido") from None
        return self.repositorio.guardarVideo(descripcion, file_path, info.DuracionEnSegundos)

    def obtenerImagen(self, imagen_id: int) -> Imagen:
        imagen = self.repositorio.obtenerImagen(imagen_id)
        if imagen is None:
            raise NoEncontrado(f"No existe la imagen {imagen_id}")
        return imagen

    def listarImagenes(self) -> list[Imagen]:
        return self.repositorio.listarImagenes()

    def obtenerRutaArchivo(self, imagen_id: int) -> str:
        return self.almacen.rutaLocal(self.obtenerImagen(imagen_id).FilePath)

    def obtenerInfo(self, imagen_id: int) -> InfoImagen:
        imagen = self.obtenerImagen(imagen_id)
        return self.lector.obtenerInfo(self.almacen.leerArchivo(imagen.FilePath))

    def obtenerInfoVideo(self, imagen_id: int) -> InfoVideo:
        return self.lector_video.obtenerInfo(self.obtenerRutaArchivo(imagen_id))

    def obtenerCeldas(self, imagen_id: int, ancho_celda: int, alto_celda: int) -> Iterator[Celda]:
        imagen = self.obtenerImagen(imagen_id)
        return self.lector.obtenerCeldas(self.almacen.leerArchivo(imagen.FilePath), ancho_celda, alto_celda)

    def obtenerCuadros(self, imagen_id: int, regiones: list[Region]) -> Iterator[CuadroVideo]:
        return self.lector_video.obtenerCuadros(self.obtenerRutaArchivo(imagen_id), regiones)

    def obtenerPropiedadesDisponibles(self, imagen_id: int) -> list[PropiedadDisponible]:
        if isinstance(self.obtenerImagen(imagen_id), Video):
            info = self.obtenerInfoVideo(imagen_id)
            return propiedadesVideo(info.Ancho, info.Alto)
        info = self.obtenerInfo(imagen_id)
        return propiedadesImagen(info.Ancho, info.Alto)
