from collections.abc import Iterator

import av
import numpy as np

from logica import ColorRegion, CuadroVideo, DatosInvalidos, InfoVideo, LectorVideo, Region

ANCHO_ANALISIS = 320  # el promedio de cada región casi no cambia a esta resolución y se calcula mucho más rápido
CUADROS_POR_SEGUNDO_SI_NO_SE_SABE = 25


class LectorVideoPyAV(LectorVideo):
    """Lee el video con PyAV (FFmpeg)."""

    def obtenerInfo(self, ruta: str) -> InfoVideo:
        try:
            with av.open(ruta) as contenedor:
                stream = contenedor.streams.video[0]
                if contenedor.duration:
                    duracion = contenedor.duration / av.time_base
                elif stream.duration:
                    duracion = float(stream.duration * stream.time_base)
                else:
                    duracion = 0
                info = InfoVideo(
                    Ancho=stream.codec_context.width,
                    Alto=stream.codec_context.height,
                    DuracionEnSegundos=duracion,
                    CuadrosPorSegundo=_cuadrosPorSegundo(stream),
                )
        except (av.error.FFmpegError, IndexError) as error:
            raise DatosInvalidos("El archivo no es un video válido") from error
        if info.Ancho <= 0 or info.Alto <= 0 or info.DuracionEnSegundos <= 0:
            raise DatosInvalidos("El archivo no es un video válido")
        return info

    def obtenerCuadros(self, ruta: str, regiones: list[Region]) -> Iterator[CuadroVideo]:
        with av.open(ruta) as contenedor:
            stream = contenedor.streams.video[0]
            stream.thread_type = "AUTO"
            ancho, alto = stream.codec_context.width, stream.codec_context.height
            escala = min(1.0, ANCHO_ANALISIS / ancho)
            ancho_chico, alto_chico = max(1, round(ancho * escala)), max(1, round(alto * escala))
            cajas = [_cajaReducida(region, escala, ancho_chico, alto_chico) for region in regiones]
            inicio = stream.start_time or 0
            cuadros_por_segundo = _cuadrosPorSegundo(stream)

            anterior = None
            try:
                for indice, cuadro in enumerate(contenedor.decode(stream)):
                    if cuadro.pts is None:
                        tiempo = indice / cuadros_por_segundo
                    else:
                        tiempo = float((cuadro.pts - inicio) * stream.time_base)
                    # int16 para que la resta con el cuadro anterior pueda dar negativos
                    pixeles = cuadro.to_ndarray(width=ancho_chico, height=alto_chico, format="rgb24").astype(np.int16)
                    colores = []
                    for x0, y0, x1, y1 in cajas:
                        zona = pixeles[y0:y1, x0:x1]
                        rojo, verde, azul = zona.mean(axis=(0, 1))
                        movimiento = 0.0 if anterior is None else float(np.abs(zona - anterior[y0:y1, x0:x1]).mean())
                        colores.append(
                            ColorRegion(Rojo=float(rojo), Verde=float(verde), Azul=float(azul), Movimiento=movimiento)
                        )
                    anterior = pixeles
                    yield CuadroVideo(Tiempo=max(0.0, tiempo), Regiones=colores)
            except av.error.FFmpegError as error:
                raise DatosInvalidos(f"No se pudo leer el video: {error}") from error


def _cuadrosPorSegundo(stream) -> float:
    return float(stream.average_rate or stream.guessed_rate or CUADROS_POR_SEGUNDO_SI_NO_SE_SABE)


def _cajaReducida(region: Region, escala: float, ancho: int, alto: int) -> tuple[int, int, int, int]:
    """La región en la resolución de análisis, con al menos un píxel."""
    x0 = min(ancho - 1, int(region.Izquierda * escala))
    y0 = min(alto - 1, int(region.Arriba * escala))
    x1 = max(x0 + 1, round((region.Izquierda + region.Ancho) * escala))
    y1 = max(y0 + 1, round((region.Arriba + region.Alto) * escala))
    return x0, y0, x1, y1
