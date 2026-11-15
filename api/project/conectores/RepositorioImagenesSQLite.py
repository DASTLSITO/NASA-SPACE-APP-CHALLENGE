from logica import RepositorioImagenes
from modelos import Imagen, Video

from .BaseDatosSQLite import BaseDatosSQLite

CONSULTA = """
SELECT i.ID, i.Descripcion, i.FilePath, v.DuracionEnSegundos
FROM Imagen i
LEFT JOIN Video v ON v.ID = i.ID
"""


class RepositorioImagenesSQLite(RepositorioImagenes):
    def __init__(self, base_datos: BaseDatosSQLite):
        self.base_datos = base_datos

    def guardarImagen(self, descripcion: str, file_path: str) -> Imagen:
        with self.base_datos.conectar() as conexion:
            cursor = conexion.execute(
                "INSERT INTO Imagen (Descripcion, FilePath) VALUES (?, ?)", (descripcion, file_path)
            )
            return Imagen(ID=cursor.lastrowid, Descripcion=descripcion, FilePath=file_path)

    def guardarVideo(self, descripcion: str, file_path: str, duracion_en_segundos: float) -> Video:
        with self.base_datos.conectar() as conexion:
            cursor = conexion.execute(
                "INSERT INTO Imagen (Descripcion, FilePath) VALUES (?, ?)", (descripcion, file_path)
            )
            conexion.execute(
                "INSERT INTO Video (ID, DuracionEnSegundos) VALUES (?, ?)", (cursor.lastrowid, duracion_en_segundos)
            )
            return Video(
                ID=cursor.lastrowid, Descripcion=descripcion, FilePath=file_path, DuracionEnSegundos=duracion_en_segundos
            )

    def obtenerImagen(self, imagen_id: int) -> Imagen | None:
        with self.base_datos.conectar() as conexion:
            fila = conexion.execute(CONSULTA + "WHERE i.ID = ?", (imagen_id,)).fetchone()
        return _desdeFila(fila) if fila else None

    def listarImagenes(self) -> list[Imagen]:
        with self.base_datos.conectar() as conexion:
            filas = conexion.execute(CONSULTA + "ORDER BY i.ID").fetchall()
        return [_desdeFila(fila) for fila in filas]


def _desdeFila(fila) -> Imagen:
    datos = dict(fila)
    if datos["DuracionEnSegundos"] is None:
        del datos["DuracionEnSegundos"]
        return Imagen(**datos)
    return Video(**datos)
