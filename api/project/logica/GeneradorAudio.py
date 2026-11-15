from abc import ABC, abstractmethod

from .Tipos import NotaMusical


class GeneradorAudio(ABC):
    @abstractmethod
    def generarAudio(self, notas: list[NotaMusical]) -> bytes:
        """Devuelve el contenido de un archivo WAV."""
