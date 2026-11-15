from abc import ABC, abstractmethod

from .Tipos import NotaMusical


class GeneradorAudio(ABC):
    @abstractmethod
    def generarAudio(self, notas: list[NotaMusical], duracion_minima: float = 0) -> bytes:
        """Devuelve el contenido de un archivo WAV que dura al menos duracion_minima segundos."""
