from abc import ABC, abstractmethod

from modelos import PropiedadImagen, PropiedadImagenSonido, PropiedadSonido

from .Tipos import Mapeo


class RepositorioMapeos(ABC):
    @abstractmethod
    def guardarPropiedadImagen(
        self, nombre: str, descripcion: str, rango_min: float, rango_max: float, imagen_id: int
    ) -> PropiedadImagen: ...

    @abstractmethod
    def guardarPropiedadSonido(self, nombre: str, rango_min: float, rango_max: float) -> PropiedadSonido: ...

    @abstractmethod
    def guardarPropiedadImagenSonido(
        self, propiedad_imagen_id: int, propiedad_sonido_id: int
    ) -> PropiedadImagenSonido: ...

    @abstractmethod
    def eliminarMapeos(self, imagen_id: int) -> None: ...

    @abstractmethod
    def eliminarMapeo(self, imagen_id: int, propiedad_sonido: str) -> bool:
        """Borra el mapeo de la imagen que mueve esa propiedad de sonido. Devuelve False si no había."""

    @abstractmethod
    def obtenerMapeos(self, imagen_id: int) -> list[Mapeo]: ...
