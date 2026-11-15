import numpy as np
import wave

sr = 44100
f = 440
tmp = 1

def crearTono(frecuencia, duracion):
    t = np.linspace(0, duracion, int(sr * duracion), endpoint = False)
    return np.sin(2 * np.pi * frecuencia * t)

def guardar_wav(nombre, onda):
    audio = np.int16(onda * 0.5 * 32767)
    with wave.open(nombre, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(audio.tobytes())

onda = crearTono(f, tmp)
guardar_wav("tono.wav", onda)