import io
import wave

import numpy as np

from logica import GeneradorAudio, NotaMusical

FRECUENCIA_MUESTREO = 44100


class GeneradorAudioSintetizador(GeneradorAudio):
    """Ondas senoidales con suavizado, basado en ScriptsMusica/Sintetizador.py."""

    def generarAudio(self, notas: list[NotaMusical], duracion_minima: float = 0) -> bytes:
        duracion_total = max(max(nota.Inicio + nota.Duracion for nota in notas) + 0.1, duracion_minima)
        pista = np.zeros(int(duracion_total * FRECUENCIA_MUESTREO) + 1)
        for nota in notas:
            tono = crearTono(frecuenciaDeNota(nota.Nota), nota.Duracion) * nota.Volumen
            inicio = int(nota.Inicio * FRECUENCIA_MUESTREO)
            pista[inicio : inicio + len(tono)] += tono

        # varias notas a la vez pueden pasar de 1; se baja todo junto para no saturar
        pico = np.abs(pista).max()
        if pico > 1:
            pista /= pico
        return aWav(pista)


def frecuenciaDeNota(nota: int) -> float:
    return 440.0 * 2 ** ((nota - 69) / 12)


def crearTono(frecuencia: float, duracion: float) -> np.ndarray:
    t = np.arange(int(FRECUENCIA_MUESTREO * duracion)) / FRECUENCIA_MUESTREO
    onda = np.sin(2 * np.pi * frecuencia * t)

    # suavizado al inicio y al final para evitar chasquidos
    largo_fade = min(int(FRECUENCIA_MUESTREO * 0.02), len(onda) // 2)
    if largo_fade:
        onda[:largo_fade] *= np.linspace(0, 1, largo_fade)
        onda[-largo_fade:] *= np.linspace(1, 0, largo_fade)
    return onda


def aWav(pista: np.ndarray) -> bytes:
    muestras = (pista * 0.9 * 32767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as archivo:
        archivo.setnchannels(1)
        archivo.setsampwidth(2)
        archivo.setframerate(FRECUENCIA_MUESTREO)
        archivo.writeframes(muestras.tobytes())
    return buffer.getvalue()
