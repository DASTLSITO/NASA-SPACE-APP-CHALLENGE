class ErrorLogica(Exception):
    pass


class NoEncontrado(ErrorLogica):
    pass


class DatosInvalidos(ErrorLogica):
    pass


class ServicioNoDisponible(ErrorLogica):
    pass
