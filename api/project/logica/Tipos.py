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
    AnchoCelda: int = Field(3, ge=1)  # píxeles
    AltoCelda: int = Field(3, ge=1)  # píxeles
    UmbralBrillo: float = Field(20, ge=0, le=255)
    Escala: TipoEscala = TipoEscala.CROMATICA
    Tonica: NombreNota = NombreNota.DO


@dataclass(frozen=True)
class Celda:
    X: float  # centro de la celda en píxeles, 0 = borde izquierdo
    Y: float  # centro de la celda en píxeles, 0 = borde inferior
    Rojo: float
    Verde: float
    Azul: float


@dataclass(frozen=True)
class NotaMusical:
    Inicio: float  # segundos
    Duracion: float  # segundos
    Nota: int  # número MIDI, 60 = Do central
    Volumen: float  # 0 a 1
