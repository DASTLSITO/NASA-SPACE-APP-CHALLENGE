import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from conectores import (
    AlmacenArchivosLocal,
    BaseDatosSQLite,
    GeneradorAudioPiano,
    GeneradorAudioSintetizador,
    LectorImagenPillow,
    LectorVideoPyAV,
    RepositorioImagenesSQLite,
    RepositorioMapeosSQLite,
)
from logica import (
    DatosInvalidos,
    ErrorLogica,
    Mapeo,
    MapeoEntrada,
    NoEncontrado,
    OpcionesSonificacion,
    PropiedadDisponible,
    ServicioImagenes,
    ServicioNoDisponible,
    ServicioSonificacion,
    TipoInstrumento,
)
from modelos import Imagen, Video

CARPETA_PROYECTO = Path(__file__).resolve().parent
RUTA_BASE_DATOS = Path(os.environ.get("SONIFICACION_BD", CARPETA_PROYECTO / "sonificacion.db"))
CARPETA_UPLOADS = Path(os.environ.get("SONIFICACION_UPLOADS", CARPETA_PROYECTO / "uploads"))

base_datos = BaseDatosSQLite(RUTA_BASE_DATOS)
servicio_imagenes = ServicioImagenes(
    RepositorioImagenesSQLite(base_datos),
    AlmacenArchivosLocal(CARPETA_UPLOADS),
    LectorImagenPillow(),
    LectorVideoPyAV(),
)
servicio_sonificacion = ServicioSonificacion(
    servicio_imagenes,
    RepositorioMapeosSQLite(base_datos),
    {
        TipoInstrumento.PIANO: GeneradorAudioPiano(),
        TipoInstrumento.SINTETIZADOR: GeneradorAudioSintetizador(),
    },
)

app = FastAPI(title="Sonificación de imágenes")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CODIGOS_ERROR = {NoEncontrado: 404, DatosInvalidos: 422, ServicioNoDisponible: 503}


@app.exception_handler(ErrorLogica)
async def manejarErrorLogica(request: Request, error: ErrorLogica):
    return JSONResponse(status_code=CODIGOS_ERROR.get(type(error), 400), content={"detail": str(error)})


# los videos son imágenes con DuracionEnSegundos (Video hereda de Imagen), así que comparten los endpoints
@app.post("/imagenes", status_code=201)
def subirImagen(archivo: Annotated[UploadFile, File()], descripcion: Annotated[str, Form()] = "") -> Video | Imagen:
    """Sube una imagen (hasta 20 MB) o un video (hasta 200 MB)."""
    return servicio_imagenes.subirImagen(archivo.file.read(), descripcion, archivo.filename or "")


@app.get("/imagenes")
def listarImagenes() -> list[Video | Imagen]:
    return servicio_imagenes.listarImagenes()


@app.get("/imagenes/{imagen_id}")
def obtenerImagen(imagen_id: int) -> Video | Imagen:
    return servicio_imagenes.obtenerImagen(imagen_id)


@app.get("/imagenes/{imagen_id}/archivo", response_class=FileResponse)
def obtenerArchivo(imagen_id: int) -> FileResponse:
    """El archivo original, para mostrarlo en un <img> o <video>."""
    return FileResponse(servicio_imagenes.obtenerRutaArchivo(imagen_id))


@app.get("/imagenes/{imagen_id}/propiedades")
def obtenerPropiedadesImagen(imagen_id: int) -> list[PropiedadDisponible]:
    return servicio_imagenes.obtenerPropiedadesDisponibles(imagen_id)


@app.get("/propiedades-sonido")
def obtenerPropiedadesSonido() -> list[PropiedadDisponible]:
    return servicio_sonificacion.obtenerPropiedadesSonido()


@app.get("/imagenes/{imagen_id}/mapeos")
def obtenerMapeos(imagen_id: int) -> list[Mapeo]:
    return servicio_sonificacion.obtenerMapeos(imagen_id)


@app.put("/imagenes/{imagen_id}/mapeos")
def guardarMapeos(imagen_id: int, mapeos: list[MapeoEntrada]) -> list[Mapeo]:
    """Reemplaza todos los mapeos de la imagen por los de la lista."""
    return servicio_sonificacion.guardarMapeos(imagen_id, mapeos)


@app.post("/imagenes/{imagen_id}/mapeos")
def agregarMapeo(imagen_id: int, mapeo: MapeoEntrada) -> list[Mapeo]:
    """Agrega un mapeo sin borrar los demás (si esa propiedad de sonido ya tenía uno, lo reemplaza).
    Devuelve todos los mapeos de la imagen."""
    return servicio_sonificacion.agregarMapeo(imagen_id, mapeo)


@app.delete("/imagenes/{imagen_id}/mapeos/{propiedad_sonido}")
def eliminarMapeo(imagen_id: int, propiedad_sonido: str) -> list[Mapeo]:
    """Borra el mapeo de esa propiedad de sonido (Duracion, Volumen o Nota). Devuelve los mapeos que quedan."""
    return servicio_sonificacion.eliminarMapeo(imagen_id, propiedad_sonido)


# GET con las opciones en la URL para que funcione directo en un <audio src="..."> (y en el reproductor de /docs)
@app.get(
    "/imagenes/{imagen_id}/sonificar",
    response_class=Response,
    responses={200: {"content": {"audio/wav": {}}, "description": "Archivo WAV"}},
)
def sonificar(imagen_id: int, opciones: Annotated[OpcionesSonificacion, Query()]) -> Response:
    """Imágenes: se recorren de izquierda a derecha en celdas de AnchoCelda x AltoCelda.
    Videos: se recorren cuadro por cuadro y cada región de Regiones es una voz."""
    audio = servicio_sonificacion.sonificar(imagen_id, opciones)
    return Response(content=audio, media_type="audio/wav")
