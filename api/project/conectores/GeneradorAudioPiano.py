import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

from logica import GeneradorAudio, NotaMusical, ServicioNoDisponible

CARPETA_SCRIPTS = Path(__file__).resolve().parent.parent / "ScriptsMusica"
FLUIDSYNTH_WINDOWS = CARPETA_SCRIPTS / "fluidsynth-v2.6.2-win10-x64-cpp11" / "bin" / "fluidsynth.exe"
SOUNDFONTS = [CARPETA_SCRIPTS / "FluidR3_GM.sf2", Path("/usr/share/sounds/sf2/FluidR3_GM.sf2")]

TICKS_POR_NEGRA = 480
TICKS_POR_SEGUNDO = TICKS_POR_NEGRA * 2  # a 120 bpm, una negra dura medio segundo


class GeneradorAudioPiano(GeneradorAudio):
    """Piano del SoundFont FluidR3_GM, como ScriptsMusica/Piano.py, pero renderizado a WAV."""

    def __init__(self, ruta_fluidsynth: str | None = None, ruta_soundfont: str | None = None):
        self.ruta_fluidsynth = ruta_fluidsynth or os.environ.get("FLUIDSYNTH") or buscarFluidsynth()
        self.ruta_soundfont = ruta_soundfont or os.environ.get("SOUNDFONT") or buscarSoundfont()

    def generarAudio(self, notas: list[NotaMusical], duracion_minima: float = 0) -> bytes:
        if not self.ruta_fluidsynth or not self.ruta_soundfont:
            raise ServicioNoDisponible(
                "El piano necesita FluidSynth y el SoundFont FluidR3_GM.sf2 "
                "(variables de entorno FLUIDSYNTH y SOUNDFONT si no se encuentran solos)"
            )

        with tempfile.TemporaryDirectory() as carpeta:
            ruta_midi = Path(carpeta) / "notas.mid"
            ruta_wav = Path(carpeta) / "audio.wav"
            ruta_midi.write_bytes(crearMidi(notas, duracion_minima))
            try:
                resultado = subprocess.run(
                    [self.ruta_fluidsynth, "-ni", "-q", "-g", "0.5", "-r", "44100", "-F", str(ruta_wav),
                     self.ruta_soundfont, str(ruta_midi)],
                    capture_output=True,
                    timeout=120,
                )
            except subprocess.TimeoutExpired as error:
                raise ServicioNoDisponible("FluidSynth tardó más de 2 minutos; prueba con celdas más grandes") from error
            if resultado.returncode != 0 or not ruta_wav.is_file():
                raise ServicioNoDisponible(f"FluidSynth falló: {resultado.stderr.decode(errors='ignore')[-300:]}")
            return ruta_wav.read_bytes()


def buscarFluidsynth() -> str | None:
    if ruta := shutil.which("fluidsynth"):
        return ruta
    if os.name == "nt" and FLUIDSYNTH_WINDOWS.is_file():
        return str(FLUIDSYNTH_WINDOWS)
    return None


def buscarSoundfont() -> str | None:
    # si Git LFS no descargó el archivo, en su lugar hay un texto pequeño que no empieza por RIFF
    for ruta in SOUNDFONTS:
        if ruta.is_file():
            with ruta.open("rb") as archivo:
                if archivo.read(4) == b"RIFF":
                    return str(ruta)
    return None


def crearMidi(notas: list[NotaMusical], duracion_minima: float = 0) -> bytes:
    """Arma un archivo MIDI de una pista con piano acústico (programa 0)."""
    eventos = []
    for nota in notas:
        velocidad = max(1, min(127, round(nota.Volumen * 127)))
        inicio = round(nota.Inicio * TICKS_POR_SEGUNDO)
        fin = round((nota.Inicio + nota.Duracion) * TICKS_POR_SEGUNDO)
        eventos.append((inicio, 1, bytes([0x90, nota.Nota, velocidad])))
        eventos.append((fin, 0, bytes([0x80, nota.Nota, 0])))
    eventos.sort(key=lambda evento: evento[:2])  # en el mismo tick se apaga antes de encender

    pista = bytearray(b"\x00\xff\x51\x03\x07\xa1\x20")  # tempo: 120 bpm
    pista += b"\x00\xc0\x00"  # programa 0: piano acústico
    tick_anterior = 0
    for tick, _, mensaje in eventos:
        pista += longitudVariable(tick - tick_anterior) + mensaje
        tick_anterior = tick
    # un segundo extra antes de terminar para que se escuche cómo se apaga la última nota
    tick_final = max(tick_anterior + TICKS_POR_SEGUNDO, round(duracion_minima * TICKS_POR_SEGUNDO))
    pista += longitudVariable(tick_final - tick_anterior) + b"\xff\x2f\x00"

    cabecera = b"MThd" + struct.pack(">IHHH", 6, 0, 1, TICKS_POR_NEGRA)
    return cabecera + b"MTrk" + struct.pack(">I", len(pista)) + bytes(pista)


def longitudVariable(valor: int) -> bytes:
    resultado = [valor & 0x7F]
    valor >>= 7
    while valor:
        resultado.insert(0, (valor & 0x7F) | 0x80)
        valor >>= 7
    return bytes(resultado)
