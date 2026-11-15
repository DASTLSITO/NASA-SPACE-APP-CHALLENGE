from mingus.containers import Bar, Composition, Track
from mingus.containers.instrument import Instrument
from mingus.midi import fluidsynth


sfont = "api/project/ScriptsMusica/FluidR3_GM.sf2"

fluidsynth.control_change(1, 7, 127)
if not fluidsynth.init(sfont):
  print("Error: No se pudo cargar el archivo SoundFont.")
  exit()

track = Track()

bar = Bar("C", (4, 4))
bar.place_notes(["C-4", "E-4", "G-4"], 4)
bar.place_notes(["D-4", "F-4", "A-4"], 4)
bar.place_notes(["C-4", "E-4", "G-4"], 4)
bar.place_notes(["C-4", "E-4", "G-4"], 4)
track.add_bar(bar)


composition = Composition()
composition.add_track(track)

fluidsynth.play_Composition(composition, channels=[1], bpm=120)