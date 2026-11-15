from logica import Mapeo, RepositorioMapeos
from modelos import PropiedadImagen, PropiedadImagenSonido, PropiedadSonido

from .BaseDatosSQLite import BaseDatosSQLite


class RepositorioMapeosSQLite(RepositorioMapeos):
    def __init__(self, base_datos: BaseDatosSQLite):
        self.base_datos = base_datos

    def guardarPropiedadImagen(
        self, nombre: str, descripcion: str, rango_min: float, rango_max: float, imagen_id: int
    ) -> PropiedadImagen:
        with self.base_datos.conectar() as conexion:
            cursor = conexion.execute(
                "INSERT INTO PropiedadImagen (Nombre, Descripcion, RangoMin, RangoMax, ImagenID) VALUES (?, ?, ?, ?, ?)",
                (nombre, descripcion, rango_min, rango_max, imagen_id),
            )
            return PropiedadImagen(
                ID=cursor.lastrowid,
                Nombre=nombre,
                Descripcion=descripcion,
                RangoMin=rango_min,
                RangoMax=rango_max,
                ImagenID=imagen_id,
            )

    def guardarPropiedadSonido(self, nombre: str, rango_min: float, rango_max: float) -> PropiedadSonido:
        with self.base_datos.conectar() as conexion:
            cursor = conexion.execute(
                "INSERT INTO PropiedadSonido (Nombre, RangoMin, RangoMax) VALUES (?, ?, ?)",
                (nombre, rango_min, rango_max),
            )
            return PropiedadSonido(ID=cursor.lastrowid, Nombre=nombre, RangoMin=rango_min, RangoMax=rango_max)

    def guardarPropiedadImagenSonido(self, propiedad_imagen_id: int, propiedad_sonido_id: int) -> PropiedadImagenSonido:
        with self.base_datos.conectar() as conexion:
            conexion.execute(
                "INSERT INTO PropiedadImagenSonido (PropiedadImagenID, PropiedadSonidoID) VALUES (?, ?)",
                (propiedad_imagen_id, propiedad_sonido_id),
            )
        return PropiedadImagenSonido(PropiedadImagenID=propiedad_imagen_id, PropiedadSonidoID=propiedad_sonido_id)

    def eliminarMapeos(self, imagen_id: int) -> None:
        # borrar las propiedades elimina en cascada sus filas de PropiedadImagenSonido
        with self.base_datos.conectar() as conexion:
            conexion.execute(
                """
                DELETE FROM PropiedadSonido WHERE ID IN (
                    SELECT pis.PropiedadSonidoID
                    FROM PropiedadImagenSonido pis
                    JOIN PropiedadImagen pi ON pi.ID = pis.PropiedadImagenID
                    WHERE pi.ImagenID = ?
                )
                """,
                (imagen_id,),
            )
            conexion.execute("DELETE FROM PropiedadImagen WHERE ImagenID = ?", (imagen_id,))

    def eliminarMapeo(self, imagen_id: int, propiedad_sonido: str) -> bool:
        with self.base_datos.conectar() as conexion:
            filas = conexion.execute(
                """
                SELECT pis.PropiedadImagenID, pis.PropiedadSonidoID
                FROM PropiedadImagenSonido pis
                JOIN PropiedadImagen pi ON pi.ID = pis.PropiedadImagenID
                JOIN PropiedadSonido ps ON ps.ID = pis.PropiedadSonidoID
                WHERE pi.ImagenID = ? AND ps.Nombre = ?
                """,
                (imagen_id, propiedad_sonido),
            ).fetchall()
            conexion.executemany("DELETE FROM PropiedadSonido WHERE ID = ?", [(f["PropiedadSonidoID"],) for f in filas])
            conexion.executemany("DELETE FROM PropiedadImagen WHERE ID = ?", [(f["PropiedadImagenID"],) for f in filas])
        return bool(filas)

    def obtenerMapeos(self, imagen_id: int) -> list[Mapeo]:
        with self.base_datos.conectar() as conexion:
            filas = conexion.execute(
                """
                SELECT pi.ID, pi.Nombre, pi.Descripcion, pi.RangoMin, pi.RangoMax, pi.ImagenID,
                       ps.ID AS SonidoID, ps.Nombre AS SonidoNombre, ps.RangoMin AS SonidoMin, ps.RangoMax AS SonidoMax
                FROM PropiedadImagen pi
                JOIN PropiedadImagenSonido pis ON pis.PropiedadImagenID = pi.ID
                JOIN PropiedadSonido ps ON ps.ID = pis.PropiedadSonidoID
                WHERE pi.ImagenID = ?
                ORDER BY pi.ID
                """,
                (imagen_id,),
            ).fetchall()
        return [
            Mapeo(
                PropiedadImagen=PropiedadImagen(
                    ID=fila["ID"],
                    Nombre=fila["Nombre"],
                    Descripcion=fila["Descripcion"],
                    RangoMin=fila["RangoMin"],
                    RangoMax=fila["RangoMax"],
                    ImagenID=fila["ImagenID"],
                ),
                PropiedadSonido=PropiedadSonido(
                    ID=fila["SonidoID"],
                    Nombre=fila["SonidoNombre"],
                    RangoMin=fila["SonidoMin"],
                    RangoMax=fila["SonidoMax"],
                ),
            )
            for fila in filas
        ]
