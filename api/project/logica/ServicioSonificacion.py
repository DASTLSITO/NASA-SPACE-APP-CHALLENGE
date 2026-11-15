import bisect
import colorsys
import math

from modelos import PropiedadImagen, PropiedadSonido

from .Catalogo import ESCALAS, LIMITES_SONIDO, PROPIEDADES_SONIDO, SEMITONOS_NOTA, VALORES_SIN_MAPEO
from .Errores import DatosInvalidos, NoEncontrado, ServicioNoDisponible
from .GeneradorAudio import GeneradorAudio
from .RepositorioMapeos import RepositorioMapeos
from .ServicioImagenes import ServicioImagenes
from .Tipos import (
    Celda,
    Mapeo,
    MapeoEntrada,
    NombreNota,
    NotaMusical,
    OpcionesSonificacion,
    PropiedadDisponible,
    TipoEscala,
    TipoInstrumento,
)

DURACION_MINIMA_NOTA = 0.05
MAXIMO_CELDAS = 2_000_000  # unos 20 segundos de proceso


class ServicioSonificacion:
    def __init__(
        self,
        servicio_imagenes: ServicioImagenes,
        repositorio: RepositorioMapeos,
        generadores: dict[TipoInstrumento, GeneradorAudio],
    ):
        self.servicio_imagenes = servicio_imagenes
        self.repositorio = repositorio
        self.generadores = generadores

    def obtenerPropiedadesSonido(self) -> list[PropiedadDisponible]:
        return PROPIEDADES_SONIDO

    def obtenerMapeos(self, imagen_id: int) -> list[Mapeo]:
        self.servicio_imagenes.obtenerImagen(imagen_id)
        return self.repositorio.obtenerMapeos(imagen_id)

    def guardarMapeos(self, imagen_id: int, entradas: list[MapeoEntrada]) -> list[Mapeo]:
        """Reemplaza todos los mapeos de la imagen. Los rangos que no se envían toman el valor del catálogo."""
        propiedades_imagen = {p.Nombre: p for p in self.servicio_imagenes.obtenerPropiedadesDisponibles(imagen_id)}
        validados = [_validarEntrada(entrada, propiedades_imagen, imagen_id) for entrada in entradas]
        sonidos = [mapeo.PropiedadSonido.Nombre for mapeo in validados]
        for nombre in sonidos:
            if sonidos.count(nombre) > 1:
                raise DatosInvalidos(f"{nombre} tiene más de un mapeo; cada propiedad de sonido admite uno")

        self.repositorio.eliminarMapeos(imagen_id)
        return [self._guardarMapeo(mapeo) for mapeo in validados]

    def agregarMapeo(self, imagen_id: int, entrada: MapeoEntrada) -> list[Mapeo]:
        """Agrega un mapeo sin tocar los demás; si esa propiedad de sonido ya tenía uno, lo reemplaza."""
        propiedades_imagen = {p.Nombre: p for p in self.servicio_imagenes.obtenerPropiedadesDisponibles(imagen_id)}
        mapeo = _validarEntrada(entrada, propiedades_imagen, imagen_id)
        self.repositorio.eliminarMapeo(imagen_id, mapeo.PropiedadSonido.Nombre)
        self._guardarMapeo(mapeo)
        return self.repositorio.obtenerMapeos(imagen_id)

    def eliminarMapeo(self, imagen_id: int, propiedad_sonido: str) -> list[Mapeo]:
        self.servicio_imagenes.obtenerImagen(imagen_id)
        if not self.repositorio.eliminarMapeo(imagen_id, propiedad_sonido):
            raise NoEncontrado(f"La imagen {imagen_id} no tiene un mapeo para {propiedad_sonido}")
        return self.repositorio.obtenerMapeos(imagen_id)

    def _guardarMapeo(self, mapeo: Mapeo) -> Mapeo:
        imagen, sonido = mapeo.PropiedadImagen, mapeo.PropiedadSonido
        propiedad_imagen = self.repositorio.guardarPropiedadImagen(
            imagen.Nombre, imagen.Descripcion, imagen.RangoMin, imagen.RangoMax, imagen.ImagenID
        )
        propiedad_sonido = self.repositorio.guardarPropiedadSonido(sonido.Nombre, sonido.RangoMin, sonido.RangoMax)
        self.repositorio.guardarPropiedadImagenSonido(propiedad_imagen.ID, propiedad_sonido.ID)
        return Mapeo(PropiedadImagen=propiedad_imagen, PropiedadSonido=propiedad_sonido)

    def sonificar(self, imagen_id: int, opciones: OpcionesSonificacion) -> bytes:
        generador = self.generadores.get(opciones.Instrumento)
        if generador is None:
            raise ServicioNoDisponible(f"El instrumento {opciones.Instrumento} no está configurado")

        info = self.servicio_imagenes.obtenerInfo(imagen_id)
        total_celdas = _totalCeldas(info.Ancho, info.Alto, opciones.AnchoCelda, opciones.AltoCelda)
        if total_celdas > MAXIMO_CELDAS:
            lado = math.ceil(math.sqrt(info.Ancho * info.Alto / MAXIMO_CELDAS))
            while _totalCeldas(info.Ancho, info.Alto, lado, lado) > MAXIMO_CELDAS:
                lado += 1
            raise DatosInvalidos(
                f"Con celdas de {opciones.AnchoCelda}x{opciones.AltoCelda} px la imagen de {info.Ancho}x{info.Alto} "
                f"da {total_celdas} celdas y el máximo es {MAXIMO_CELDAS}; usa celdas de al menos {lado}x{lado} px"
            )
        mapeos = {m.PropiedadSonido.Nombre: m for m in self.repositorio.obtenerMapeos(imagen_id)}
        if "Duracion" not in mapeos:
            # sin mapeo de tiempo, la imagen se recorre de izquierda a derecha en 10 segundos (no se guarda)
            mapeos["Duracion"] = Mapeo(
                PropiedadImagen=PropiedadImagen(
                    ID=0, Nombre="X", Descripcion="", RangoMin=0, RangoMax=info.Ancho, ImagenID=imagen_id
                ),
                PropiedadSonido=PropiedadSonido(ID=0, Nombre="Duracion", RangoMin=0, RangoMax=10),
            )
        duracion_nota = _duracionNota(mapeos["Duracion"], info.Ancho, info.Alto, opciones)
        notas_escala = _notasDeEscala(opciones.Escala, opciones.Tonica)

        # las celdas que suenan a la vez con la misma nota (p. ej. de la misma columna) se tocan una sola vez,
        # con el volumen más alto; así una imagen grande con celdas chicas no genera miles de notas repetidas
        volumenes: dict[tuple[float, int], float] = {}
        for celda in self.servicio_imagenes.obtenerCeldas(imagen_id, opciones.AnchoCelda, opciones.AltoCelda):
            valores_imagen = _valoresDeCelda(celda)
            if valores_imagen["Brillo"] < opciones.UmbralBrillo:
                continue
            valores_sonido = dict(VALORES_SIN_MAPEO)
            suena = True
            for nombre_sonido, mapeo in mapeos.items():
                valor = _escalar(valores_imagen[mapeo.PropiedadImagen.Nombre], mapeo.PropiedadImagen, mapeo.PropiedadSonido)
                if valor is None:
                    suena = False
                    break
                valores_sonido[nombre_sonido] = valor
            if suena:
                clave = (valores_sonido["Duracion"], _ajustarAEscala(valores_sonido["Nota"], notas_escala))
                volumenes[clave] = max(volumenes.get(clave, 0), valores_sonido["Volumen"])

        if not volumenes:
            raise DatosInvalidos(
                "Ninguna parte de la imagen produjo sonido: baja UmbralBrillo o amplía los rangos de los mapeos"
            )
        notas = [
            NotaMusical(Inicio=inicio, Duracion=duracion_nota, Nota=nota, Volumen=volumen)
            for (inicio, nota), volumen in volumenes.items()
        ]
        return generador.generarAudio(notas)


def _validarEntrada(entrada: MapeoEntrada, propiedades_imagen: dict[str, PropiedadDisponible], imagen_id: int) -> Mapeo:
    """Revisa la entrada contra los catálogos y completa los rangos que falten. El mapeo devuelto aún no está guardado (ID 0)."""
    propiedades_sonido = {p.Nombre: p for p in PROPIEDADES_SONIDO}
    prop_imagen = propiedades_imagen.get(entrada.PropiedadImagen)
    if prop_imagen is None:
        raise DatosInvalidos(
            f"Propiedad de imagen desconocida: {entrada.PropiedadImagen}. Opciones: {', '.join(propiedades_imagen)}"
        )
    prop_sonido = propiedades_sonido.get(entrada.PropiedadSonido)
    if prop_sonido is None:
        raise DatosInvalidos(
            f"Propiedad de sonido desconocida: {entrada.PropiedadSonido}. Opciones: {', '.join(propiedades_sonido)}"
        )

    imagen_min = prop_imagen.RangoMin if entrada.ImagenMin is None else entrada.ImagenMin
    imagen_max = prop_imagen.RangoMax if entrada.ImagenMax is None else entrada.ImagenMax
    sonido_min = prop_sonido.RangoMin if entrada.SonidoMin is None else entrada.SonidoMin
    sonido_max = prop_sonido.RangoMax if entrada.SonidoMax is None else entrada.SonidoMax
    limite_min, limite_max = LIMITES_SONIDO[prop_sonido.Nombre]
    if imagen_min > imagen_max:
        raise DatosInvalidos(f"En {prop_imagen.Nombre}, ImagenMin no puede ser mayor que ImagenMax")
    if not limite_min <= sonido_min <= sonido_max <= limite_max:
        raise DatosInvalidos(
            f"El rango de {prop_sonido.Nombre} debe estar entre {limite_min} y {limite_max}, con SonidoMin <= SonidoMax"
        )
    return Mapeo(
        PropiedadImagen=PropiedadImagen(
            ID=0,
            Nombre=prop_imagen.Nombre,
            Descripcion=prop_imagen.Descripcion,
            RangoMin=imagen_min,
            RangoMax=imagen_max,
            ImagenID=imagen_id,
        ),
        PropiedadSonido=PropiedadSonido(ID=0, Nombre=prop_sonido.Nombre, RangoMin=sonido_min, RangoMax=sonido_max),
    )


def _notasDeEscala(escala: TipoEscala, tonica: NombreNota) -> list[int]:
    """Todas las notas MIDI (0 a 127) que pertenecen a la escala, de grave a aguda."""
    clases = {(SEMITONOS_NOTA[tonica] + intervalo) % 12 for intervalo in ESCALAS[escala]}
    return [nota for nota in range(128) if nota % 12 in clases]


def _ajustarAEscala(nota: float, notas_escala: list[int]) -> int:
    """Lleva la nota a la más cercana de la escala, como un autotune. En un empate elige la más grave."""
    i = bisect.bisect_left(notas_escala, nota)
    vecinas = notas_escala[max(0, i - 1) : i + 1]
    return min(vecinas, key=lambda vecina: (abs(vecina - nota), vecina))


def _totalCeldas(ancho: int, alto: int, ancho_celda: int, alto_celda: int) -> int:
    return math.ceil(ancho / ancho_celda) * math.ceil(alto / alto_celda)


def _valoresDeCelda(celda: Celda) -> dict[str, float]:
    tono, saturacion, _ = colorsys.rgb_to_hsv(celda.Rojo / 255, celda.Verde / 255, celda.Azul / 255)
    return {
        "X": celda.X,
        "Y": celda.Y,
        "Brillo": min(255.0, 0.299 * celda.Rojo + 0.587 * celda.Verde + 0.114 * celda.Azul),
        "Rojo": celda.Rojo,
        "Verde": celda.Verde,
        "Azul": celda.Azul,
        "Tono": tono * 360,
        "Saturacion": saturacion * 100,
    }


def _escalar(valor: float, origen: PropiedadImagen, destino: PropiedadSonido) -> float | None:
    """Lleva el valor del rango de la imagen al rango del sonido. Devuelve None si queda fuera del rango."""
    if not origen.RangoMin <= valor <= origen.RangoMax:
        return None
    if origen.RangoMin == origen.RangoMax:
        return destino.RangoMin
    proporcion = (valor - origen.RangoMin) / (origen.RangoMax - origen.RangoMin)
    return destino.RangoMin + proporcion * (destino.RangoMax - destino.RangoMin)


def _duracionNota(mapeo_tiempo: Mapeo, ancho: int, alto: int, opciones: OpcionesSonificacion) -> float:
    """Cada nota dura lo que tarda el recorrido en avanzar una celda."""
    origen, destino = mapeo_tiempo.PropiedadImagen, mapeo_tiempo.PropiedadSonido
    rango_origen = origen.RangoMax - origen.RangoMin
    if rango_origen == 0:
        return DURACION_MINIMA_NOTA
    tamano_celda = {"X": min(opciones.AnchoCelda, ancho), "Y": min(opciones.AltoCelda, alto)}.get(
        origen.Nombre, rango_origen / math.ceil(ancho / opciones.AnchoCelda)
    )
    segundos_por_unidad = (destino.RangoMax - destino.RangoMin) / rango_origen
    return max(DURACION_MINIMA_NOTA, tamano_celda * segundos_por_unidad)
