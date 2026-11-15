#iniciar proyecto

uv run fastapi dev

La documentación interactiva queda en http://localhost:8000/docs

## Capas

- `modelos/` (base): Imagen, Video, PropiedadImagen, PropiedadSonido, PropiedadImagenSonido.
- `logica/`: qué se hace. Interfaces (`obtenerImagen()`, `generarAudio()`, ...) y servicios que las usan.
- `conectores/`: cómo se hace. SQLite, archivos en `uploads/`, Pillow, sintetizador (numpy) y piano (FluidSynth).
- `main.py`: API de FastAPI que llama a los servicios.

## Flujo para sonificar

1. `POST /imagenes` (form-data: `archivo`, `descripcion`) sube la imagen.
2. `GET /imagenes/{id}/propiedades` y `GET /propiedades-sonido` dan las opciones y sus rangos.
3. `PUT /imagenes/{id}/mapeos` define qué propiedad de imagen mueve qué propiedad de sonido:

```json
[
  {"PropiedadImagen": "X", "PropiedadSonido": "Duracion", "SonidoMin": 0, "SonidoMax": 10},
  {"PropiedadImagen": "Y", "PropiedadSonido": "Volumen"},
  {"PropiedadImagen": "Tono", "ImagenMin": 0, "ImagenMax": 120, "PropiedadSonido": "Nota", "SonidoMin": 60, "SonidoMax": 72}
]
```

Los rangos que no se envían usan los del catálogo. Las partes de la imagen fuera de un rango no suenan.

`PUT` reemplaza todos los mapeos de la imagen. Para ir de uno en uno:

- `POST /imagenes/{id}/mapeos` con un solo mapeo (`{"PropiedadImagen": "Y", "PropiedadSonido": "Volumen"}`) lo agrega sin
  borrar los demás. Cada propiedad de sonido admite un mapeo, así que si ya había uno para esa propiedad, lo reemplaza.
- `DELETE /imagenes/{id}/mapeos/{PropiedadSonido}` (por ejemplo `/imagenes/1/mapeos/Nota`) borra solo ese.

Los dos devuelven todos los mapeos que quedan en la imagen.

4. `GET /imagenes/{id}/sonificar` devuelve un WAV. Las opciones van en la URL y todas son opcionales, así que sirve
   directo en un `<audio src="...">`:

```
GET /imagenes/1/sonificar?Instrumento=piano&AnchoCelda=3&AltoCelda=3&UmbralBrillo=20&Escala=mayor&Tonica=Re
```

La imagen se recorre en celdas de `AnchoCelda` x `AltoCelda` píxeles (3x3 si no se envía) y cada celda toma el color
promedio de sus píxeles. Cada celda más brillante que `UmbralBrillo` es una nota; si varias celdas de la misma columna
dan la misma nota, suena una sola vez con el volumen más alto. El brillo de una celda es 0.299·R + 0.587·G + 0.114·B
(de 0 a 255); con el `UmbralBrillo` de 20 el fondo negro del espacio no suena. Una imagen puede dar como máximo 2.000.000 de celdas; si
se pasa, la API responde 422 con el tamaño de celda mínimo que sirve.

`Escala` y `Tonica` funcionan como un autotune: cada nota se lleva a la más cercana que esté en la escala (en un empate, a
la más grave). Por ejemplo, en Re mayor no hay Do, así que un Do suena como Si o Do#, según de cuál esté más cerca.

- `Escala`: `cromatica` (por defecto, no ajusta nada), `mayor`, `menor`, `menor_armonica`, `pentatonica_mayor`,
  `pentatonica_menor`, `blues`, `dorica`, `frigia`, `lidia`, `mixolidia`.
- `Tonica`: `Do`, `Reb`, `Re`, `Mib`, `Mi`, `Fa`, `Solb`, `Sol`, `Lab`, `La`, `Sib`, `Si` (Do por defecto). Van con bemoles
  porque el `#` corta la URL: Do# es `Reb`, Fa# es `Solb`, etc.

## Piano

Necesita FluidSynth y el SoundFont `FluidR3_GM.sf2`. Se buscan solos: `fluidsynth` en el PATH (en Windows también el
`.exe` de `ScriptsMusica/`) y el `.sf2` en `ScriptsMusica/` (hay que bajarlo con `git lfs pull`) o en
`/usr/share/sounds/sf2/`. Si están en otro lado, usar las variables de entorno `FLUIDSYNTH` y `SOUNDFONT`.
