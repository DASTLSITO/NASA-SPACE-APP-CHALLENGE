import sqlite3
from contextlib import contextmanager
from pathlib import Path

ESQUEMA = """
CREATE TABLE IF NOT EXISTS Imagen (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Descripcion TEXT NOT NULL,
    FilePath TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Video (
    ID INTEGER PRIMARY KEY REFERENCES Imagen(ID) ON DELETE CASCADE,
    DuracionEnSegundos REAL NOT NULL CHECK (DuracionEnSegundos > 0)
);

CREATE TABLE IF NOT EXISTS PropiedadImagen (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Nombre TEXT NOT NULL,
    Descripcion TEXT NOT NULL,
    RangoMin REAL NOT NULL,
    RangoMax REAL NOT NULL,
    ImagenID INTEGER NOT NULL REFERENCES Imagen(ID) ON DELETE CASCADE,
    CHECK (RangoMin <= RangoMax)
);

CREATE TABLE IF NOT EXISTS PropiedadSonido (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Nombre TEXT NOT NULL,
    RangoMin REAL NOT NULL,
    RangoMax REAL NOT NULL,
    CHECK (RangoMin <= RangoMax)
);

CREATE TABLE IF NOT EXISTS PropiedadImagenSonido (
    PropiedadImagenID INTEGER NOT NULL REFERENCES PropiedadImagen(ID) ON DELETE CASCADE,
    PropiedadSonidoID INTEGER NOT NULL REFERENCES PropiedadSonido(ID) ON DELETE CASCADE,
    PRIMARY KEY (PropiedadImagenID, PropiedadSonidoID)
);
"""


class BaseDatosSQLite:
    def __init__(self, ruta: Path):
        self.ruta = ruta
        with self.conectar() as conexion:
            conexion.executescript(ESQUEMA)

    @contextmanager
    def conectar(self):
        """Abre una conexión que hace commit al salir sin errores y rollback si hay una excepción."""
        conexion = sqlite3.connect(self.ruta)
        conexion.row_factory = sqlite3.Row
        conexion.execute("PRAGMA foreign_keys = ON")
        try:
            with conexion:
                yield conexion
        finally:
            conexion.close()
