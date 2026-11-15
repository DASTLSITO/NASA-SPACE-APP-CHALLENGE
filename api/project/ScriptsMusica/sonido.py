import numpy as np
import pygame as pg

pg.init()
pg.mixer.init()

sr = 44100

freq = {
    'Do': 261.63,
    'Re': 293.66,
    'Mi': 329.63,
    'Fa': 349.23,
    'Sol': 392.00,
    'La': 440.00,
    'Si': 493.88,
}


def crear_tono(frecuencia, duracion=0.2):
  t = np.linspace(0, duracion, int(sr * duracion), endpoint=False)
  onda = np.sin(2 * np.pi * frecuencia * t)

  # --- SUAVIZADO (EVITA CORTES Y CHASQUIDOS) ---
  fade_len = int(sr * 0.02)  # 20 milisegundos de transición al inicio y final
  if len(onda) > fade_len * 2:
    fade_in = np.linspace(0, 1, fade_len)
    fade_out = np.linspace(1, 0, fade_len)
    onda[:fade_len] *= fade_in  # Sube suavemente al empezar
    onda[-fade_len:] *= fade_out  # Baja suavemente al terminar
  # ---------------------------------------------

  return onda


secuencia_notas = ['Do','Re','Mi','Do','Do','Re','Mi','Do','Mi','Fa','Sol','Mi','Fa','Sol']
pista_completa = []


for nota in secuencia_notas:
  frecuencia = freq[nota]
  tono = crear_tono(frecuencia, duracion= 0.5)
  silencio = crear_tono(0, duracion= 0.01)
  pista_completa.extend(tono)
  pista_completa.extend(silencio)

# Reproducir
pista_completa = np.asarray(pista_completa)
audio = np.int16(pista_completa * 16384)
stereo = np.column_stack((audio, audio))

sound = pg.sndarray.make_sound(stereo)
sound.play()
pg.time.wait(int((len(pista_completa) / sr) * 1000))