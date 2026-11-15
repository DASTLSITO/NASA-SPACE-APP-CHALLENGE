from pydantic import BaseModel, model_validator


class PropiedadImagen(BaseModel):
    ID: int
    Nombre: str
    Descripcion: str
    RangoMin: float
    RangoMax: float
    ImagenID: int

    @model_validator(mode="after")
    def validar_rango(self):
        if self.RangoMin > self.RangoMax:
            raise ValueError("RangoMin no puede ser mayor que RangoMax")
        return self
