from pydantic import BaseModel

class Imagen(BaseModel):
    ID: int
    Descripcion: str
    FilePath: str
