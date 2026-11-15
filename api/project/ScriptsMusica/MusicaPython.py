from mingus.containers import Bar, Composition, Track
from mingus.midi import fluidsynth, midi_file_out
from typing import List

sfont = "api/project/ScriptsMusica/FluidR3_GM.sf2"
fluidsynth.control_change(1,7,127)
if not fluidsynth.init(sfont):
    print("No existe el soundfont")
    exit()

notas ={
    0: None,
    1: "C-4",
    2: "C#-4",
    3: "D-4",
    4: "D#-4",
    5: "E-4",
    6: "F-4",
    7: "F#-4",
    8: "G-4",
    9: "G#-4",
    10: "A-4",
    11: "A#-4",
    12: "B-4",
    13: "C-5"
}

def CrearAcorde(*dig):
    acorde = []
    for n in dig:
        if n in notas and notas[n] is not None:
            acorde.append(notas[n])
    return acorde

def GenerarPista(secuencia: List[List[int]]):
    pista = Track()
    compas = Bar("C", (4, 4))
    for nt in secuencia:
        acorde = CrearAcorde(*nt)
        try:
            if acorde:
                compas.place_notes(acorde, 4)
            else:
                compas.place_notes(None, 4)
        except Exception:
            pista.add_bar(compas)
            compas = Bar("C", (4, 4))
            if acorde:
                compas.place_notes(acorde, 4)
            else:
                compas.place_notes(None, 4)
        
    pista.add_bar(compas)

    composicion = Composition()
    composicion.add_track(pista)

    melodia = "api/project/ScriptsMusica/resultado.mid"
    midi_file_out.write_Composition(melodia, composicion)
