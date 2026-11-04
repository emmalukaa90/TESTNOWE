import type { ChapterMeta, MinigameMeta } from '../core/types';

type Def = Omit<MinigameMeta, 'level'>;

const DEFS: Def[] = [
  // Rozdział I: Dzika Głusza
  {
    id: 1, chapter: 1, slug: 'symfonia-zapachow', title: 'Symfonia Zapachów', accent: '#ffd23f', music: 'forest',
    summary: 'Dopasuj fazę i amplitudę fali zapachowej szalika Klary, odfiltrowując szum lasu.',
    howTo: 'Lewy suwak: amplituda. Prawy suwak: faza. Złap złotą falę!',
    boneGoal: 'Ukończ wszystkie fale w mniej niż 40 sekund.', controls: ['slider', 'multitouch'],
  },
  {
    id: 2, chapter: 1, slug: 'skok-przez-bystrze', title: 'Skok przez Bystrzę', accent: '#4fb3d9', music: 'forest',
    summary: 'Przechylaj telefon dla równowagi i skacz po kłodach oraz śliskich kamieniach.',
    howTo: 'Przechyl telefon (lub przeciągnij palcem), by się nie przewrócić. Stuknij, by skoczyć.',
    boneGoal: 'Złap złotą kość pływającą na kłodzie.', controls: ['gyro', 'touch'],
  },
  {
    id: 3, chapter: 1, slug: 'ciernisty-labirynt', title: 'Ciernisty Labirynt', accent: '#7bbf4a', music: 'forest',
    summary: 'Jednym palcem odginaj kolczaste gałęzie, drugim prowadź Fado.',
    howTo: 'Przytrzymaj bramę z cierni jednym palcem, drugim kieruj Fado.',
    boneGoal: 'Przejdź labirynt bez ani jednego ukłucia.', controls: ['multitouch'],
  },
  {
    id: 4, chapter: 1, slug: 'nocny-zwiad', title: 'Nocny Zwiad', accent: '#6a5acd', music: 'night',
    summary: 'Stawiaj kroki tylko wtedy, gdy niedźwiedź wydycha powietrze.',
    howTo: 'Stukaj na zmianę lewą i prawą stronę ekranu, ale tylko podczas wydechu niedźwiedzia.',
    boneGoal: 'Dojdź do wyjścia bez żadnego błędu.', controls: ['touch'],
  },
  {
    id: 5, chapter: 1, slug: 'ucieczka-przed-burza', title: 'Ucieczka przed Burzą', accent: '#8e9aaf', music: 'tension',
    summary: 'Biegnij przed nawałnicą: skacz, ślizgaj się i zmieniaj pas gestami.',
    howTo: 'Przesuń w górę: skok. W dół: ślizg. W bok: zmiana pasa.',
    boneGoal: 'Zdobądź złotą kość biegnącą na środkowym pasie.', controls: ['swipe'],
  },
  // Rozdział II: Wiejskie Perypetie
  {
    id: 6, chapter: 2, slug: 'wykopaliska-pod-plotem', title: 'Wykopaliska pod Płotem', accent: '#b5835a', music: 'farm',
    summary: 'Rysuj tunel w ziemi, omijając kamienie, rury i krety.',
    howTo: 'Przeciągnij palcem po ziemi, by wykopać tunel. Fado pójdzie nim sam.',
    boneGoal: 'Odkop zakopaną kość i dotrzyj do wyjścia.', controls: ['draw'],
  },
  {
    id: 7, chapter: 2, slug: 'owczy-chaos', title: 'Owczy Chaos', accent: '#9ccc65', music: 'farm',
    summary: 'Wytyczaj trasy i szczekaj, by zapędzić owce do zagrody.',
    howTo: 'Przeciągnij od Fado, by wyznaczyć trasę. Przycisk „Szczeknij” odpycha owce.',
    boneGoal: 'Zapędź do zagrody wszystkie owce.', controls: ['draw', 'touch'],
  },
  {
    id: 8, chapter: 2, slug: 'spizarnia-gospodyni', title: 'Spiżarnia Gospodyni', accent: '#e07a5f', music: 'farm',
    summary: 'Wysuwaj skrzynki jak w Jendze i zbuduj schody do kiełbasek.',
    howTo: 'Przeciągnij skrzynkę w bok, by ją wysunąć. Nie strąć słoików!',
    boneGoal: 'Wysuń skrzynki, nie ruszając żadnego słoika.', controls: ['draw', 'touch'],
  },
  {
    id: 9, chapter: 2, slug: 'szalenstwo-na-traktorze', title: 'Szaleństwo na Traktorze', accent: '#f2a541', music: 'farm',
    summary: 'Przesuwaj Fado jako przeciwwagę dla turlających się dyń.',
    howTo: 'Przeciągnij palcem w lewo i w prawo, by przesunąć Fado po przyczepie.',
    boneGoal: 'Nie zgub ani jednej dyni.', controls: ['touch'],
  },
  {
    id: 10, chapter: 2, slug: 'wiosenny-prysznic', title: 'Wiosenny Prysznic', accent: '#5ec2d6', music: 'farm',
    summary: 'Obracaj pokrętło zraszacza, a potem potrząśnij telefonem, by pies się otrzepał.',
    howTo: 'Kręć kółko palcem, by kierować strumień. Potem potrząsaj telefonem (lub szybko przeciągaj palcem).',
    boneGoal: 'Wyczyść Fado w mniej niż 35 sekund.', controls: ['slider', 'accel'],
  },
  // Rozdział III: Miejska Dżungla
  {
    id: 11, chapter: 3, slug: 'godzina-szczytu', title: 'Godzina Szczytu', accent: '#ef476f', music: 'city',
    summary: 'Przejdź przez ulicę, słuchając nadjeżdżających ciężarówek.',
    howTo: 'Przesuń w górę: krok do przodu. W bok: unik. Słuchaj ciężarówek!',
    boneGoal: 'Przejdź ulicę i zgarnij kość ze środka jezdni.', controls: ['swipe'],
  },
  {
    id: 12, chapter: 3, slug: 'podziemne-echo', title: 'Podziemne Echo', accent: '#4cc9f0', music: 'night',
    summary: 'Szczeknij, by sonar podświetlił krawędzie przepaści w ciemnych kanałach.',
    howTo: 'Szczekaj (mikrofon lub przycisk), a potem stuknij, dokąd pójść.',
    boneGoal: 'Dojdź do wyjścia, używając sonaru najwyżej 8 razy.', controls: ['mic', 'touch'],
  },
  {
    id: 13, chapter: 3, slug: 'cien-hycla', title: 'Cień Hycla', accent: '#7f7f9a', music: 'tension',
    summary: 'Chowaj się w krzakach i odwracaj uwagę hycla przewróconymi puszkami.',
    howTo: 'Trzymaj palec, by iść. W krzakach jesteś ukryty. Przewróć puszkę, by zwabić hycla.',
    boneGoal: 'Przejdź niezauważony ani razu.', controls: ['touch', 'draw'],
  },
  {
    id: 14, chapter: 3, slug: 'bistro-pod-chmurka', title: 'Bistro pod Chmurką', accent: '#f4a261', music: 'city',
    summary: 'Pod stolikiem steruj głową i uszami Fado w odpowiednich momentach.',
    howTo: 'Lewa strona: wysokość uszu. Prawa strona: pochylenie głowy. Dopasuj, gdy gość patrzy w dół.',
    boneGoal: 'Zdobądź kiełbaskę, nie wzbudzając podejrzeń kelnera.', controls: ['slider', 'multitouch'],
  },
  {
    id: 15, chapter: 3, slug: 'dachy-przedmiescia', title: 'Dachy Przedmieścia', accent: '#e76f51', music: 'city',
    summary: 'Celuj parabolą skoku i ścigaj kota, który ukradł szalik.',
    howTo: 'Przeciągnij do tyłu i puść, by skoczyć. Markizy podbijają!',
    boneGoal: 'Dogoń kota w nie więcej niż 12 skokach.', controls: ['draw'],
  },
  // Rozdział IV: Powrót do Klary
  {
    id: 16, chapter: 4, slug: 'szyfr-straznika', title: 'Szyfr Strażnika', accent: '#a29bfe', music: 'night',
    summary: 'Powtórz sekwencję starego psa: wycie, szczeknięcie, drapanie.',
    howTo: 'Obserwuj i słuchaj sekwencji, a potem powtórz ją przyciskami.',
    boneGoal: 'Przejdź wszystkie rundy bez pomyłki.', controls: ['touch'],
  },
  {
    id: 17, chapter: 4, slug: 'wagon-sypialny', title: 'Wagon Sypialny', accent: '#d4a373', music: 'tension',
    summary: 'Przesuń walizki i wózki, zanim nadejdzie konduktor.',
    howTo: 'Przeciągaj bagaże wzdłuż ich osi, by uwolnić drogę Fado do wyjścia.',
    boneGoal: 'Rozwiąż zagadkę, zanim minie połowa czasu.', controls: ['draw'],
  },
  {
    id: 18, chapter: 4, slug: 'targowisko-roznosci', title: 'Targowisko Różności', accent: '#ffd166', music: 'city',
    summary: 'Zdmuchuj mgłę zapachów gestami, by odkryć złote nici farby Klary.',
    howTo: 'Przeciągaj palcem, by rozwiać mgłę. Fado idzie tam, gdzie widać złotą nić.',
    boneGoal: 'Odnajdź ukrytą kość pod mgłą.', controls: ['swipe'],
  },
  {
    id: 19, chapter: 4, slug: 'bariera-dzwieku', title: 'Bariera Dźwięku', accent: '#ff6b6b', music: 'tension',
    summary: 'Głaszcz ekran, by uspokoić Fado, i prowadź go przez fajerwerki.',
    howTo: 'Lewa strona: głaszcz kółkami. Prawa strona: steruj Fado. Wybuchy odwracają sterowanie!',
    boneGoal: 'Zbierz złotą kość unoszącą się nad torem.', controls: ['touch', 'multitouch'],
  },
  {
    id: 20, chapter: 4, slug: 'ostatnia-prosta', title: 'Ostatnia Prosta', accent: '#ffb703', music: 'finale',
    summary: 'Stukaj w rytm bicia serca Fado w biegu pod górę do wiatraka.',
    howTo: 'Stukaj w rytm, gdy pierścień dotknie celu. Im lepiej, tym szybciej biegnie Fado.',
    boneGoal: 'Utrzymaj trafność powyżej 85%.', controls: ['touch'],
  },
];

export const MINIGAMES: readonly MinigameMeta[] = DEFS.map((d, i) => ({
  ...d,
  level: ((i % 5) + 1) as MinigameMeta['level'],
}));

export const CHAPTERS: readonly ChapterMeta[] = [
  {
    id: 1, title: 'Dzika Głusza', subtitle: 'Las, bystrza i śpiący niedźwiedź',
    gradient: ['#3d5a3a', '#e9a24c'], levels: [1, 2, 3, 4, 5],
    outro: 'Burza została za plecami. Fado otrząsa mokre uszy i czuje w powietrzu dym z komina. Gdzieś niedaleko jest wieś, a za nią droga do domu.',
  },
  {
    id: 2, title: 'Wiejskie Perypetie', subtitle: 'Płoty, owce i traktor',
    gradient: ['#6f8f3a', '#f2c94c'], levels: [6, 7, 8, 9, 10],
    outro: 'Czysty, najedzony i trochę zmęczony Fado patrzy na światła miasta. Szalik wciąż pachnie farbą Klary, tropem prowadzącym prosto w ulice.',
  },
  {
    id: 3, title: 'Miejska Dżungla', subtitle: 'Ulice, kanały i dachy',
    gradient: ['#3a4a6b', '#e76f51'], levels: [11, 12, 13, 14, 15],
    outro: 'Kot zniknął w kominie, a szalik wrócił do pyska Fado. Teraz tylko zajezdnia, targ i ostatni zakręt dzielą go od Klary.',
  },
  {
    id: 4, title: 'Powrót do Klary', subtitle: 'Zajezdnia, targ i wiatrak',
    gradient: ['#5b3a6b', '#ffb703'], levels: [16, 17, 18, 19, 20],
    outro: 'Wiatrak jest tuż przed nim. Na wzgórzu ktoś rozwiesza plakaty z jego pyskiem. Fado biegnie, ile sił w łapach.',
  },
];

export const TOTAL_LEVELS = MINIGAMES.length;

export function getMinigameMeta(id: number): MinigameMeta | undefined {
  return MINIGAMES.find((m) => m.id === id);
}

export function getChapterOf(id: number): ChapterMeta | undefined {
  return CHAPTERS.find((c) => c.levels.includes(id));
}
