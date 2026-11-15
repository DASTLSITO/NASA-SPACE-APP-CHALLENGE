from logica import RepositorioImagenes
from modelos import Imagen

from .BaseDatosSQLite import BaseDatosSQLite


class RepositorioImagenesSQLite(RepositorioImagenes):
    def __init__(self, base_datos: BaseDatosSQLite):
        self.base_datos = base_datos

    def guardarImagen(self, descripcion: str, file_path: str) -> Imagen:
        with self.base_datos.conectar() as conexion:
            cursor = conexion.execute(
                "INSERT INTO Imagen (Descripcion, FilePath) VALUES (?, ?)", (descripcion, file_path)
            )
            return Imagen(ID=cursor.lastrowid, Descripcion=descripcion, FilePath=file_path)

    def obtenerImagen(self, imagen_id: int) -> Imagen | None:
        with self.base_datos.conectar() as conexion:
            fila = conexion.execute(
                "SELECT ID, Descripcion, FilePath FROM Imagen WHERE ID = ?", (imagen_id,)
            ).fetchone()
        return Imagen(**dict(fila)) if fila else None

    def listarImagenes(self) -> list[Imagen]:
        with self.base_datos.conectar() as conexion:
            filas = conexion.execute("SELECT ID, Descripcion, FilePath FROM Imagen ORDER BY ID").fetchall()
        return [Imagen(**dict(fila)) for fila in filas]
