from dataclasses import dataclass
from enum import StrEnum

from pydantic import BaseModel, Field

from modelos import PropiedadImagen, PropiedadSonido


class TipoInstrumento(StrEnum):
    PIANO = "piano"
    SINTETIZADOR = "sintetizador"


class TipoEscala(StrEnum):
    CROMATICA = "cromatica"  # las 12 notas, no ajusta nada
    MAYOR = "mayor"
    MENOR = "menor"
    MENOR_ARMONICA = "menor_armonica"
    PENTATONICA_MAYOR = "pentatonica_mayor"
    PENTATONICA_MENOR = "pentatonica_menor"
    BLUES = "blues"
    DORICA = "dorica"
    FRIGIA = "frigia"
    LIDIA = "lidia"
    MIXOLIDIA = "mixolidia"


class NombreNota(StrEnum):
    # con bemoles (b) en vez de sostenidos (#) porque el # corta la URL
    DO = "Do"
    RE_BEMOL = "Reb"
    RE = "Re"
    MI_BEMOL = "Mib"
    MI = "Mi"
    FA = "Fa"
    SOL_BEMOL = "Solb"
    SOL = "Sol"
    LA_BEMOL = "Lab"
    LA = "La"
    SI_BEMOL = "Sib"
    SI = "Si"


class PropiedadDisponible(BaseModel):
    Nombre: str
    Descripcion: str
    RangoMin: float
    RangoMax: float


class InfoImagen(BaseModel):
    Ancho: int
    Alto: int
    Formato: str


class InfoVideo(BaseModel):
    Ancho: int
    Alto: int
    DuracionEnSegundos: float
    CuadrosPorSegundo: float


class Mapeo(BaseModel):
    PropiedadImagen: PropiedadImagen
    PropiedadSonido: PropiedadSonido


class MapeoEntrada(BaseModel):
    PropiedadImagen: str
    PropiedadSonido: str
    ImagenMin: float | None = None
    ImagenMax: float | None = None
    SonidoMin: float | None = None
    SonidoMax: float | None = None


class OpcionesSonificacion(BaseModel):
    Instrumento: TipoInstrumento = TipoInstrumento.SINTETIZADOR
    AnchoCelda: int = Field(3, ge=1, description="Solo imágenes: ancho en píxeles de cada celda que se recorre")
    AltoCelda: int = Field(3, ge=1, description="Solo imágenes: alto en píxeles de cada celda que se recorre")
    UmbralBrillo: float = Field(20, ge=0, le=255)
    Escala: TipoEscala = TipoEscala.CROMATICA
    Tonica: NombreNota = NombreNota.DO
    Regiones: list[str] = Field(
        default_factory=list,
        description="Solo videos: zonas a escuchar, cada una 'izquierda,arriba,ancho,alto' en píxeles del video "
        "(0,0 es la esquina superior izquierda). Sin regiones se escucha el cuadro completo",
    )
    RangoAutomatico: bool = Field(
        False,
        description="Solo videos: achica el rango de imagen de cada mapeo a los valores que de verdad aparecen en las "
        "regiones, para usar todo el rango de sonido en videos oscuros o con poco contraste",
    )


@dataclass(frozen=True)
class Celda:
    X: float  # centro de la celda en píxeles, 0 = borde izquierdo
    Y: float  # centro de la celda en píxeles, 0 = borde inferior
    Rojo: float
    Verde: float
    Azul: float


@dataclass(frozen=True)
class Region:
    Izquierda: int  # píxeles desde el borde izquierdo
    Arriba: int  # píxeles desde el borde superior
    Ancho: int
    Alto: int


@dataclass(frozen=True)
class ColorRegion:
    Rojo: float
    Verde: float
    Azul: float
    Movimiento: float  # cambio promedio respecto al cuadro anterior, de 0 a 255


@dataclass(frozen=True)
class CuadroVideo:
    Tiempo: float  # segundos desde el inicio del video
    Regiones: list[ColorRegion]  # en el mismo orden que las regiones pedidas


@dataclass(frozen=True)
class NotaMusical:
    Inicio: float  # segundos
    Duracion: float  # segundos
    Nota: int  # número MIDI, 60 = Do central
    Volumen: float  # 0 a 1
