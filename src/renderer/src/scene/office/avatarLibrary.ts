/**
 * The avatar library: thirty faces to pick from, plus Atlas.
 *
 * These are RECIPES, not images. Each one is drawn by the same code that draws
 * Atlas (portraitArt.ts), from the same vocabulary: four skin tones, ten hair
 * styles, clothing, and a few accessories. That is the whole reason a library
 * costs nothing to ship: thirty entries is thirty lines, not thirty PNGs.
 *
 * An agent stores its avatar as this `id` string, so a face survives a rename.
 * The persona `name` here is only a suggestion for the name field.
 *
 * Fifteen and fifteen, drawn from around the world, so a floor of a dozen
 * agents can look like a room of different people rather than a palette swap.
 */
import type { RGB, Recipe } from './portraitArt';

export interface LibraryFace {
  id: string;
  name: string;
  gender: 'f' | 'm';
  recipe: Recipe;
}

const BLACK: RGB = [34, 30, 34];
const DARKBROWN: RGB = [72, 48, 34];
const BROWN: RGB = [120, 80, 46];
const AUBURN: RGB = [156, 78, 44];
const BLOND: RGB = [222, 190, 110];
const GREY: RGB = [176, 176, 184];

export const AVATAR_LIBRARY: LibraryFace[] = [
  // ── fifteen ──────────────────────────────────────────────────────────────
  { id: 'lib-aiko', name: 'Aiko', gender: 'f', recipe: { skin: 'light', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 20, vol: 1 }, cloth: 'blouse', c1: [216, 88, 96], lashes: true, brow: 'soft', mouth: 'smile', eyes: [58, 46, 44] } },
  { id: 'lib-amara', name: 'Amara', gender: 'f', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleCurly', cloth: 'blouse', c1: [32, 150, 132], lashes: true, brow: 'raised', mouth: 'smile', eyes: [70, 52, 40] } },
  { id: 'lib-priya', name: 'Priya', gender: 'f', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleBun', cloth: 'cardigan', c1: [156, 90, 176], c2: [238, 232, 226], lashes: true, brow: 'flat', mouth: 'neutral', eyes: [62, 44, 38] } },
  { id: 'lib-elena', name: 'Elena', gender: 'f', recipe: { skin: 'light', hairc: BROWN, hair: 'styleFrame', hairargs: { length: 17, vol: 2 }, cloth: 'blouse', c1: [226, 96, 140], lashes: true, blush: true, brow: 'soft', mouth: 'smile', eyes: [96, 68, 44] } },
  { id: 'lib-mei', name: 'Mei', gender: 'f', recipe: { skin: 'light', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'sweater', c1: [48, 148, 178], lashes: true, brow: 'flat', mouth: 'neutral', eyes: [56, 44, 44] } },
  { id: 'lib-zara', name: 'Zara', gender: 'f', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleBun', cloth: 'cardigan', c1: [72, 96, 190], c2: [234, 230, 224], lashes: true, brow: 'angry', mouth: 'neutral', eyes: [58, 44, 40] } },
  { id: 'lib-sofia', name: 'Sofia', gender: 'f', recipe: { skin: 'tan', hairc: AUBURN, hair: 'styleCurly', cloth: 'blouse', c1: [226, 178, 56], lashes: true, blush: true, brow: 'raised', mouth: 'grin', eyes: [104, 66, 40] } },
  { id: 'lib-ingrid', name: 'Ingrid', gender: 'f', recipe: { skin: 'light', hairc: BLOND, hair: 'styleFrame', hairargs: { length: 18, vol: 1 }, cloth: 'sweater', c1: [122, 134, 150], lashes: true, brow: 'flat', mouth: 'neutral', eyes: [104, 138, 172] } },
  { id: 'lib-nadia', name: 'Nadia', gender: 'f', recipe: { skin: 'tan', hairc: DARKBROWN, hair: 'styleFrame', hairargs: { length: 19, vol: 2 }, cloth: 'blouse', c1: [138, 156, 68], lashes: true, brow: 'soft', mouth: 'smile', eyes: [70, 50, 38] } },
  { id: 'lib-yuki', name: 'Yuki', gender: 'f', recipe: { skin: 'light', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 12, vol: 1 }, cloth: 'cardigan', c1: [148, 122, 224], c2: [240, 236, 232], lashes: true, brow: 'flat', mouth: 'smile', eyes: [54, 44, 46] } },
  { id: 'lib-layla', name: 'Layla', gender: 'f', recipe: { skin: 'tan', hairc: DARKBROWN, hair: 'styleMessy', hairargs: { length: 16 }, cloth: 'blouse', c1: [238, 154, 96], lashes: true, brow: 'raised', mouth: 'smile', eyes: [82, 56, 40] } },
  { id: 'lib-grace', name: 'Grace', gender: 'f', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleBun', cloth: 'sweater', c1: [58, 178, 122], lashes: true, brow: 'soft', mouth: 'smile', eyes: [74, 54, 42] } },
  { id: 'lib-anya', name: 'Anya', gender: 'f', recipe: { skin: 'light', hairc: BLOND, hair: 'styleBun', cloth: 'cardigan', c1: [70, 152, 190], c2: [238, 234, 228], lashes: true, brow: 'angry', mouth: 'neutral', eyes: [110, 146, 178] } },
  { id: 'lib-rosa', name: 'Rosa', gender: 'f', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 16, vol: 2 }, cloth: 'blouse', c1: [230, 96, 84], lashes: true, blush: true, brow: 'soft', mouth: 'grin', eyes: [66, 48, 38] } },
  { id: 'lib-hana', name: 'Hana', gender: 'f', recipe: { skin: 'light', hairc: BROWN, hair: 'styleFrame', hairargs: { length: 14, vol: 1 }, cloth: 'blouse', c1: [178, 96, 200], lashes: true, brow: 'flat', mouth: 'smile', eyes: [92, 62, 42] } },

  // ── and fifteen ──────────────────────────────────────────────────────────
  { id: 'lib-kenji', name: 'Kenji', gender: 'm', recipe: { skin: 'light', hairc: BLACK, hair: 'styleSpiky', cloth: 'polo', c1: [78, 106, 210], c2: [40, 52, 96], brow: 'flat', mouth: 'neutral', eyes: [52, 44, 46] } },
  { id: 'lib-omar', name: 'Omar', gender: 'm', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'dressshirt', c1: [232, 230, 226], tie: [96, 108, 126], facial: 'stubble', brow: 'flat', mouth: 'neutral', eyes: [62, 46, 38] } },
  { id: 'lib-diego', name: 'Diego', gender: 'm', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleMessy', hairargs: { length: 13 }, cloth: 'polo', c1: [232, 182, 54], c2: [186, 138, 36], brow: 'raised', mouth: 'grin', eyes: [78, 52, 38] } },
  { id: 'lib-chen', name: 'Chen', gender: 'm', recipe: { skin: 'light', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'dressshirt', c1: [148, 190, 214], tie: [56, 92, 132], brow: 'flat', mouth: 'neutral', eyes: [54, 44, 44] } },
  { id: 'lib-ravi', name: 'Ravi', gender: 'm', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'sweater', c1: [138, 152, 70], glasses: true, brow: 'soft', mouth: 'smile', eyes: [64, 46, 36] } },
  { id: 'lib-tomas', name: 'Tomas', gender: 'm', recipe: { skin: 'light', hairc: BROWN, hair: 'styleFloppy', cloth: 'polo', c1: [70, 176, 128], c2: [44, 132, 96], brow: 'raised', mouth: 'smile', eyes: [98, 70, 44] } },
  { id: 'lib-malik', name: 'Malik', gender: 'm', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleBald', cloth: 'dressshirt', c1: [226, 108, 96], tie: [120, 52, 48], facial: 'goatee', brow: 'flat', mouth: 'neutral', eyes: [72, 52, 40] } },
  { id: 'lib-ali', name: 'Ali', gender: 'm', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'sweater', c1: [110, 122, 138], facial: 'mustache', brow: 'flat', mouth: 'neutral', eyes: [60, 46, 40] } },
  { id: 'lib-lars', name: 'Lars', gender: 'm', recipe: { skin: 'light', hairc: BLOND, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'polo', c1: [86, 168, 200], c2: [52, 118, 148], brow: 'flat', mouth: 'smile', eyes: [108, 148, 184] } },
  { id: 'lib-hugo', name: 'Hugo', gender: 'm', recipe: { skin: 'light', hairc: BROWN, hair: 'styleFloppy', cloth: 'cardigan', c1: [160, 96, 186], c2: [236, 232, 226], glasses: true, brow: 'soft', mouth: 'neutral', eyes: [96, 66, 44] } },
  { id: 'lib-kwame', name: 'Kwame', gender: 'm', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'polo', c1: [40, 162, 142], c2: [26, 116, 102], brow: 'raised', mouth: 'grin', eyes: [76, 54, 42] } },
  { id: 'lib-nikolai', name: 'Nikolai', gender: 'm', recipe: { skin: 'light', hairc: GREY, hair: 'styleRecede', cloth: 'suit', c1: [86, 94, 110], tie: [72, 82, 100], brow: 'angry', mouth: 'neutral', eyes: [116, 124, 142] } },
  { id: 'lib-santi', name: 'Santi', gender: 'm', recipe: { skin: 'tan', hairc: DARKBROWN, hair: 'styleMessy', hairargs: { length: 14 }, cloth: 'polo', c1: [230, 108, 148], c2: [176, 74, 110], brow: 'raised', mouth: 'grin', eyes: [86, 58, 40] } },
  { id: 'lib-faisal', name: 'Faisal', gender: 'm', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'dressshirt', c1: [124, 148, 226], tie: [58, 76, 150], facial: 'goatee', brow: 'flat', mouth: 'neutral', eyes: [60, 46, 38] } },
  { id: 'lib-hiro', name: 'Hiro', gender: 'm', recipe: { skin: 'light', hairc: BLACK, hair: 'styleFloppy', cloth: 'sweater', c1: [238, 158, 104], glasses: true, brow: 'soft', mouth: 'smile', eyes: [54, 44, 46] } },
];

export const LIBRARY_BY_ID: Record<string, LibraryFace> =
  Object.fromEntries(AVATAR_LIBRARY.map((f) => [f.id, f]));
