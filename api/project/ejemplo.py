from modelos import Imagen, PropiedadImagen, PropiedadSonido, PropiedadImagenSonido

imagen = Imagen(
    ID=1,
    Descripcion="Pilares de la Creación, Nebulosa del Águila (James Webb)",
    FilePath="resources/pilares_de_la_creacion.png",
)

propiedades_imagen = [
    PropiedadImagen(ID=1, Nombre="Brillo", Descripcion="Luminosidad del píxel", RangoMin=0, RangoMax=255, ImagenID=imagen.ID),
    PropiedadImagen(ID=2, Nombre="Tono", Descripcion="Color del píxel en grados", RangoMin=0, RangoMax=360, ImagenID=imagen.ID),
    PropiedadImagen(ID=3, Nombre="Posición X", Descripcion="Columna del píxel", RangoMin=0, RangoMax=1920, ImagenID=imagen.ID),
]

propiedades_sonido = [
    PropiedadSonido(ID=1, Nombre="Volumen", RangoMin=0, RangoMax=1),
    PropiedadSonido(ID=2, Nombre="Frecuencia (Hz)", RangoMin=110, RangoMax=880),
    PropiedadSonido(ID=3, Nombre="Paneo", RangoMin=-1, RangoMax=1),
]

relaciones = [
    PropiedadImagenSonido(PropiedadImagenID=1, PropiedadSonidoID=1),
    PropiedadImagenSonido(PropiedadImagenID=2, PropiedadSonidoID=2),
    PropiedadImagenSonido(PropiedadImagenID=3, PropiedadSonidoID=3),
]

if __name__ == "__main__":
    print(imagen.model_dump_json(indent=2))
    imagenes_por_id = {p.ID: p for p in propiedades_imagen}
    sonidos_por_id = {s.ID: s for s in propiedades_sonido}
    for r in relaciones:
        p = imagenes_por_id[r.PropiedadImagenID]
        s = sonidos_por_id[r.PropiedadSonidoID]
        print(f"{p.Nombre} [{p.RangoMin}, {p.RangoMax}] -> {s.Nombre} [{s.RangoMin}, {s.RangoMax}]")
