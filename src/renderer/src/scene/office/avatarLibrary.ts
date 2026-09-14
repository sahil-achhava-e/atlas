/**
 * The avatar library: thirty faces to pick from, plus Atlas.
 *
 * These are RECIPES, not images. Each is drawn by the same code that draws
 * Atlas (portraitArt.ts) from the same vocabulary, so a library costs thirty
 * lines rather than thirty PNGs.
 *
 * WHAT THE FACE CAN AND CANNOT DO. At 18x28 there is one pixel row for the eyes
 * and one for the mouth, and they sit in the same place for everybody. No
 * recipe changes a facial feature, because none can — the grid has no room for
 * it. What varies is skin tone, hair, and what a person is wearing.
 *
 * So the set is built on DRESS, one country each. A gele, a conical hat, a
 * beret, an ushanka, a fez, a headscarf, a chullo, a turban: real garments,
 * drawn as shapes, each worn by exactly one face. That is what makes thirty
 * portraits tell apart at this size, and it is why two earlier attempts did
 * not. The first was film characters, where seventeen of thirty had facial hair
 * and four were the same recipe with a different shirt. The second was balanced
 * on paper but still asked five hats and five hairstyles to separate thirty
 * people, so they kept reading as each other.
 *
 * The budget is checked by test/avatar-variety.test.cjs:
 *
 *   skin        all four tones, none over a third of the set
 *   facial hair at most a quarter
 *   hair        no style on more than a third
 *   uniqueness  no two share skin, hair colour, hair style, facial hair and
 *               headwear
 *   countries   thirty, no repeats
 *
 * An agent stores its avatar as this `id`, so a face survives a rename. The
 * `name` is a label in the picker's tooltip, not the agent's name.
 */
import type { RGB, Recipe } from './portraitArt';

export interface LibraryFace {
  id: string;
  name: string;
  /** Where the dress comes from. Shown in the picker beside the name, and the
   *  reason no two entries wear the same thing. */
  country: string;
  recipe: Recipe;
}

const BLACK: RGB = [32, 28, 32];
const DARKBROWN: RGB = [70, 46, 32];
const BROWN: RGB = [118, 78, 44];
const AUBURN: RGB = [156, 78, 44];
const GINGER: RGB = [206, 104, 50];
const BLOND: RGB = [224, 192, 112];
const WHITE: RGB = [226, 226, 230];
const GREY: RGB = [166, 166, 174];
const STEEL: RGB = [120, 132, 148];

export const AVATAR_LIBRARY: LibraryFace[] = [
  { id: 'lib-amara', name: 'Amara', country: 'Nigeria', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleBald', cloth: 'blouse', c1: [226, 142, 42], headwear: { kind: 'wrap', c: [214, 118, 36] }, brow: 'soft', mouth: 'smile', lashes: true, eyes: [66, 46, 34] } },
  { id: 'lib-haruto', name: 'Haruto', country: 'Japan', recipe: { skin: 'light', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'dressshirt', c1: [236, 238, 242], tie: [58, 62, 78], brow: 'flat', mouth: 'neutral', eyes: [56, 44, 40] } },
  { id: 'lib-ishaan', name: 'Ishaan', country: 'India', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleBald', cloth: 'suit', c1: [58, 72, 96], tie: [176, 148, 62], headwear: { kind: 'turban', c: [196, 76, 64] }, beard: BLACK, brow: 'flat', mouth: 'neutral', eyes: [62, 46, 36] } },
  { id: 'lib-mateo', name: 'Mateo', country: 'Mexico', recipe: { skin: 'tan', hairc: DARKBROWN, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'polo', c1: [198, 140, 62], c2: [240, 220, 184], headwear: { kind: 'wide', c: [186, 150, 92] }, brow: 'raised', mouth: 'smile', eyes: [78, 56, 38] } },
  { id: 'lib-camille', name: 'Camille', country: 'France', recipe: { skin: 'light', hairc: DARKBROWN, hair: 'styleFrame', hairargs: { length: 14, vol: 1 }, cloth: 'blouse', c1: [214, 218, 226], headwear: { kind: 'beret', c: [62, 66, 82] }, brow: 'soft', mouth: 'smile', lashes: true, eyes: [86, 70, 54] } },
  { id: 'lib-nikolai', name: 'Nikolai', country: 'Russia', recipe: { skin: 'light', hairc: [150, 128, 96], hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'sweater', c1: [70, 82, 98], headwear: { kind: 'ushanka', c: [124, 100, 72] }, brow: 'flat', mouth: 'neutral', eyes: [94, 116, 148] } },
  { id: 'lib-linh', name: 'Linh', country: 'Vietnam', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 19, vol: 1 }, cloth: 'blouse', c1: [236, 236, 240], headwear: { kind: 'conical', c: [214, 186, 118] }, brow: 'soft', mouth: 'smile', lashes: true, eyes: [58, 44, 38] } },
  { id: 'lib-yassin', name: 'Yassin', country: 'Morocco', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'cardigan', c1: [122, 96, 68], c2: [216, 198, 162], headwear: { kind: 'fez', c: [168, 48, 44] }, brow: 'flat', mouth: 'neutral', eyes: [64, 48, 36] } },
  { id: 'lib-faisal', name: 'Faisal', country: 'Saudi Arabia', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [238, 238, 240], headwear: { kind: 'shemagh', c: [232, 232, 236] }, facial: 'goatee', brow: 'flat', mouth: 'neutral', eyes: [60, 44, 34] } },
  { id: 'lib-darya', name: 'Darya', country: 'Iran', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleBald', cloth: 'blouse', c1: [72, 96, 132], headwear: { kind: 'scarf', c: [86, 112, 152] }, brow: 'soft', mouth: 'neutral', lashes: true, eyes: [62, 48, 40] } },
  { id: 'lib-selam', name: 'Selam', country: 'Ethiopia', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 18, vol: 1 }, cloth: 'blouse', c1: [238, 236, 232], braids: { c: BLACK, long: true }, brow: 'soft', mouth: 'smile', lashes: true, eyes: [66, 46, 34] } },
  { id: 'lib-zuri', name: 'Zuri', country: 'Kenya', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleCurly', cloth: 'polo', c1: [46, 126, 110], c2: [236, 236, 232], headwear: { kind: 'kufi', c: [196, 160, 54] }, brow: 'raised', mouth: 'smile', eyes: [68, 48, 34] } },
  { id: 'lib-kofi', name: 'Kofi', country: 'Ghana', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleBald', cloth: 'polo', c1: [206, 154, 40], c2: [58, 122, 78], brow: 'flat', mouth: 'grin', eyes: [70, 50, 36] } },
  { id: 'lib-thandi', name: 'Thandi', country: 'South Africa', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleCurly', cloth: 'cardigan', c1: [156, 78, 118], c2: [232, 216, 226], brow: 'soft', mouth: 'smile', lashes: true, eyes: [72, 52, 38] } },
  { id: 'lib-mei', name: 'Mei', country: 'China', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBun', cloth: 'blouse', c1: [196, 62, 72], brow: 'soft', mouth: 'smile', lashes: true, eyes: [56, 44, 40] } },
  { id: 'lib-jisoo', name: 'Jisoo', country: 'South Korea', recipe: { skin: 'light', hairc: [64, 44, 40], hair: 'styleFrame', hairargs: { length: 20, vol: 2 }, cloth: 'cardigan', c1: [214, 196, 210], c2: [244, 240, 244], brow: 'soft', mouth: 'neutral', lashes: true, eyes: [60, 46, 42] } },
  { id: 'lib-batu', name: 'Batu', country: 'Mongolia', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'sweater', c1: [140, 88, 48], headwear: { kind: 'pointed', c: [172, 118, 56] }, brow: 'flat', mouth: 'neutral', eyes: [64, 46, 36] } },
  { id: 'lib-aarav', name: 'Aarav', country: 'Nepal', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleMessy', hairargs: { length: 13 }, cloth: 'dressshirt', c1: [206, 200, 186], tie: [126, 54, 50], headwear: { kind: 'cap', c: [178, 66, 58] }, brow: 'raised', mouth: 'smile', eyes: [66, 48, 36] } },
  { id: 'lib-putri', name: 'Putri', country: 'Indonesia', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 16, vol: 1 }, cloth: 'blouse', c1: [120, 152, 108], headwear: { kind: 'band', c: [86, 122, 84] }, brow: 'raised', mouth: 'smile', lashes: true, eyes: [62, 46, 38] } },
  { id: 'lib-nayra', name: 'Nayra', country: 'Peru', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 17, vol: 1 }, cloth: 'sweater', c1: [176, 82, 62], headwear: { kind: 'beanie', c: [196, 104, 72] }, braids: { c: BLACK }, brow: 'soft', mouth: 'smile', lashes: true, eyes: [70, 50, 36] } },
  { id: 'lib-rafael', name: 'Rafael', country: 'Brazil', recipe: { skin: 'brown', hairc: DARKBROWN, hair: 'styleMessy', hairargs: { length: 15 }, cloth: 'polo', c1: [56, 148, 92], c2: [230, 206, 78], brow: 'raised', mouth: 'grin', eyes: [80, 56, 38] } },
  { id: 'lib-isla', name: 'Isla', country: 'Scotland', recipe: { skin: 'light', hairc: GINGER, hair: 'styleFrame', hairargs: { length: 18, vol: 2 }, cloth: 'cardigan', c1: [92, 116, 148], c2: [226, 230, 236], brow: 'raised', mouth: 'smile', blush: true, lashes: true, eyes: [96, 132, 100] } },
  { id: 'lib-sanne', name: 'Sanne', country: 'Netherlands', recipe: { skin: 'light', hairc: BLOND, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'dressshirt', c1: [240, 242, 246], tie: [216, 118, 40], brow: 'flat', mouth: 'smile', eyes: [92, 128, 172] } },
  { id: 'lib-elin', name: 'Elin', country: 'Sweden', recipe: { skin: 'light', hairc: [236, 214, 156], hair: 'styleFrame', hairargs: { length: 16, vol: 1 }, cloth: 'sweater', c1: [96, 132, 180], brow: 'soft', mouth: 'neutral', lashes: true, eyes: [104, 140, 176] } },
  { id: 'lib-marek', name: 'Marek', country: 'Poland', recipe: { skin: 'light', hairc: BROWN, hair: 'styleRecede', cloth: 'suit', c1: [76, 80, 94], tie: [168, 60, 56], brow: 'flat', mouth: 'neutral', eyes: [92, 104, 120] } },
  { id: 'lib-nikos', name: 'Nikos', country: 'Greece', recipe: { skin: 'tan', hairc: [44, 36, 34], hair: 'styleCurly', cloth: 'polo', c1: [70, 118, 178], c2: [238, 240, 244], facial: 'stubble', brow: 'raised', mouth: 'smile', eyes: [72, 54, 40] } },
  { id: 'lib-lucia', name: 'Lucia', country: 'Spain', recipe: { skin: 'tan', hairc: [58, 40, 34], hair: 'styleBun', cloth: 'blouse', c1: [188, 62, 96], brow: 'raised', mouth: 'grin', lashes: true, blush: true, eyes: [76, 52, 38] } },
  { id: 'lib-owen', name: 'Owen', country: 'Canada', recipe: { skin: 'light', hairc: DARKBROWN, hair: 'styleMessy', hairargs: { length: 14 }, cloth: 'sweater', c1: [168, 62, 58], headwear: { kind: 'flat', c: [58, 62, 74] }, brow: 'soft', mouth: 'smile', eyes: [88, 108, 92] } },
  { id: 'lib-kemar', name: 'Kemar', country: 'Jamaica', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleCurly', cloth: 'sweater', c1: [46, 108, 70], braids: { c: BLACK, long: true }, brow: 'flat', mouth: 'neutral', eyes: [68, 48, 34] } },
  { id: 'lib-aroha', name: 'Aroha', country: 'New Zealand', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleMessy', hairargs: { length: 17 }, cloth: 'polo', c1: [42, 44, 52], c2: [214, 218, 226], brow: 'soft', mouth: 'smile', lashes: true, eyes: [66, 48, 36] } },
];


export const LIBRARY_BY_ID: Record<string, LibraryFace> =
  Object.fromEntries(AVATAR_LIBRARY.map((f) => [f.id, f]));
