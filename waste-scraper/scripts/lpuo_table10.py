# -*- coding: utf-8 -*-
"""Tabela br.10 from the Pirot Local Waste Management Plan 2021-2031 (SEPA, LPUO-Pirot.pdf, p.72-73).

Transcribed verbatim from the PDF text layer; `naziv` and `lokacija` are the plan's own
Cyrillic strings transliterated to Latin. Volumes are the plan's `Запремина m3` column.
"""
# naziv, lokacija, katastarska parcela, KO, povrsina_m2, zapremina_m3, zapremina_napomena
TABELA_10 = [
 ("Romsko naselje", "Ul. Timočka (iza staropazarskog groblja) - Barje", "4080/209", "Pirot-van varoš", 1140, 50, ""),
 ("Prisjansko naselje Strelište", "Prisijanski put - Prisjan-Pirot", "6633/3", "Pirot-van varoš", 28801, 40, ""),
 ("Kavak", "Kavak-srednji put - Mamušnica", "6634/4", "Pirot-van varoš", 2793, 150, ""),
 ("Nišavska dolina iza niskogradnje", "Nišavska dolina (iza niskogradnje)", "4292", "Pirot-van varoš", 463, 250, ""),
 ("Pored kompenzacionog bazena blizu Kubik Trans baza lokacija 1", "Pored kompenzacionog bazena - Zalužje", "2185/3", "Izvor", 2747, 100, ""),
 ("Pored kompenzacionog bazena blizu Kubik Trans baza lokacija 2", "Pored kompenzacionog bazena - Zalužje", "2171", "Izvor", 509, 100, ""),
 ("Pored kompenzacionog bazena lokacija 3", "U blizini kompenzacionog bazena - Nišava", "3785/1", "Poljska Ržana", 369626, 275, "plan navodi 250-300 m3"),
 ("Pored reke Nišave", "Pored reke Nišave", "3785/1", "Poljska Ržana", 369626, 100, "ista parcela kao lokacija 3"),
 ("Četvrti kilometar", "Četvrti kilometar - Crveni Breg", "941", "Berilovac", 2393, 100, ""),
 ("Gradašnica", "Gradašnica, iznad groblja - Pripor", "3276", "Pirot-van varoš", 15838, 80, ""),
 ("Gnjilan, Sarlah", "Gnjilan - Sarlah", "3701", "Pirot-van varoš", 61595, 20, ""),
 ("Gnjilan", "Gnjilan - Belava", "1404", "Pirot", 443473, 200, ""),
 ("Staro korito reke Nišave", "Staro korito reke Nišave iz baze A.D. „Drumovi“ - Zalužje", "5915/1", "Pirot", 22483, 3500, ""),
 ("Trnjana", "Naselje Trnjana - Đol", "151", "Trnjana", 10024, 150, ""),
 ("Mali Jovanovac", "Naselje Mali Jovanovac", "869/2", "Mali Jovanovac", 31361, 150, ""),
 ("Veliko Selo", "Veliko Selo", "777", "Veliko Selo", 22284, 100, ""),
 ("Krupac", "Naselje Krupac, pored škole - Stanački kamen", "11713", "Krupac", 26332, 150, ""),
 ("Izvor", "Naselje Izvor, pored reke Nišave", "3758", "Izvor", 682, 3000, "plan navodi „3000 m3 i više“"),
 ("Poljska Ržana", "Naselje Poljska Ržana", "", "", None, 3000, "parcela i površina nisu navedene u planu"),
]
