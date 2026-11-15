from .Tipos import NombreNota, PropiedadDisponible, TipoEscala


def propiedadesImagen(ancho: int, alto: int) -> list[PropiedadDisponible]:
    return [
        PropiedadDisponible(Nombre="X", Descripcion="Posición horizontal del píxel, 0 es el borde izquierdo", RangoMin=0, RangoMax=ancho),
        PropiedadDisponible(Nombre="Y", Descripcion="Posición vertical del píxel, 0 es el borde inferior", RangoMin=0, RangoMax=alto),
        PropiedadDisponible(Nombre="Brillo", Descripcion="Luminosidad del píxel", RangoMin=0, RangoMax=255),
        PropiedadDisponible(Nombre="Rojo", Descripcion="Canal rojo del píxel", RangoMin=0, RangoMax=255),
        PropiedadDisponible(Nombre="Verde", Descripcion="Canal verde del píxel", RangoMin=0, RangoMax=255),
        PropiedadDisponible(Nombre="Azul", Descripcion="Canal azul del píxel", RangoMin=0, RangoMax=255),
        PropiedadDisponible(Nombre="Tono", Descripcion="Color en grados: 0 rojo, 120 verde, 240 azul", RangoMin=0, RangoMax=360),
        PropiedadDisponible(Nombre="Saturacion", Descripcion="Intensidad del color, 0 es gris", RangoMin=0, RangoMax=100),
    ]


def propiedadesVideo(ancho: int, alto: int) -> list[PropiedadDisponible]:
    """En un video cada región es una voz: X y Y son su centro, y lo demás su promedio en cada cuadro."""
    return propiedadesImagen(ancho, alto) + [
        PropiedadDisponible(
            Nombre="Movimiento",
            Descripcion="Cuánto cambia la región respecto al cuadro anterior, de 0 a 255 (suele quedar por debajo de 30)",
            RangoMin=0,
            RangoMax=255,
        ),
    ]


PROPIEDADES_SONIDO = [
    PropiedadDisponible(
        Nombre="Duracion",
        Descripcion="Segundo en que suena cada nota. Con X aquí la imagen se recorre de izquierda a derecha. "
        "En videos no se usa: cada nota suena en el momento de su cuadro",
        RangoMin=0,
        RangoMax=10,
    ),
    PropiedadDisponible(Nombre="Volumen", Descripcion="Intensidad de la nota", RangoMin=0, RangoMax=1),
    PropiedadDisponible(Nombre="Nota", Descripcion="Altura en número MIDI, 60 es el Do central", RangoMin=48, RangoMax=84),
]

LIMITES_SONIDO = {"Duracion": (0, 600), "Volumen": (0, 1), "Nota": (0, 127)}

VALORES_SIN_MAPEO = {"Volumen": 0.8, "Nota": 60}

# semitonos desde la tónica
ESCALAS = {
    TipoEscala.CROMATICA: (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11),
    TipoEscala.MAYOR: (0, 2, 4, 5, 7, 9, 11),
    TipoEscala.MENOR: (0, 2, 3, 5, 7, 8, 10),
    TipoEscala.MENOR_ARMONICA: (0, 2, 3, 5, 7, 8, 11),
    TipoEscala.PENTATONICA_MAYOR: (0, 2, 4, 7, 9),
    TipoEscala.PENTATONICA_MENOR: (0, 3, 5, 7, 10),
    TipoEscala.BLUES: (0, 3, 5, 6, 7, 10),
    TipoEscala.DORICA: (0, 2, 3, 5, 7, 9, 10),
    TipoEscala.FRIGIA: (0, 1, 3, 5, 7, 8, 10),
    TipoEscala.LIDIA: (0, 2, 4, 6, 7, 9, 11),
    TipoEscala.MIXOLIDIA: (0, 2, 4, 5, 7, 9, 10),
}

# semitonos desde Do, en el orden de NombreNota
SEMITONOS_NOTA = {nombre: semitono for semitono, nombre in enumerate(NombreNota)}
