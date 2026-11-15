from collections.abc import Iterator
from io import BytesIO

from PIL import Image

from logica import Celda, DatosInvalidos, InfoImagen, LectorImagen


class LectorImagenPillow(LectorImagen):
    def obtenerInfo(self, contenido: bytes) -> InfoImagen:
        try:
            with Image.open(BytesIO(contenido)) as imagen:
                imagen.verify()
                return InfoImagen(Ancho=imagen.width, Alto=imagen.height, Formato=imagen.format)
        except Exception as error:
            raise DatosInvalidos("El archivo no es una imagen válida") from error

    def obtenerCeldas(self, contenido: bytes, ancho_celda: int, alto_celda: int) -> Iterator[Celda]:
        with Image.open(BytesIO(contenido)) as imagen:
            ancho, alto = imagen.size
            # reduce promedia cada bloque de ancho_celda x alto_celda píxeles (los del borde, con los que haya)
            reducida = imagen.convert("RGB").reduce((min(ancho_celda, ancho), min(alto_celda, alto)))

        for fila in range(reducida.height):
            y0 = fila * alto_celda
            y1 = min(y0 + alto_celda, alto)
            for columna in range(reducida.width):
                x0 = columna * ancho_celda
                x1 = min(x0 + ancho_celda, ancho)
                rojo, verde, azul = reducida.getpixel((columna, fila))
                yield Celda(X=(x0 + x1) / 2, Y=alto - (y0 + y1) / 2, Rojo=rojo, Verde=verde, Azul=azul)
