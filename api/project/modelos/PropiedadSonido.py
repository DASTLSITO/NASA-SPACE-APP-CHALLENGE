from pydantic import BaseModel, model_validator


class PropiedadSonido(BaseModel):
    ID: int
    Nombre: str
    RangoMin: float
    RangoMax: float

    @model_validator(mode="after")
    def validar_rango(self):
        if self.RangoMin > self.RangoMax:
            raise ValueError("RangoMin no puede ser mayor que RangoMax")
        return self
