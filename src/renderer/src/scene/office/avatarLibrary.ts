/**
 * The avatar library: thirty faces to pick from, plus Atlas.
 *
 * These are RECIPES, not images. Each is drawn by the same code that draws
 * Atlas (portraitArt.ts) from the same vocabulary, so a library costs thirty
 * lines rather than thirty PNGs.
 *
 * At 18x28 a face cannot look like an actor: there is one pixel row for the
 * eyes and one for the mouth. What DOES read is a costume, so every entry here
 * is chosen for a silhouette you can name from across the room: a helmet, a
 * mask, a hat brim, dark lenses, a colour of hair nobody else has.
 *
 * An agent stores its avatar as this `id`, so a face survives a rename. The
 * `name` is a label in the picker's tooltip, not the agent's name.
 */
import type { RGB, Recipe } from './portraitArt';

export interface LibraryFace {
  id: string;
  name: string;
  recipe: Recipe;
}

const BLACK: RGB = [32, 28, 32];
const DARKBROWN: RGB = [70, 46, 32];
const BROWN: RGB = [118, 78, 44];
const BLOND: RGB = [224, 192, 112];
const WHITE: RGB = [226, 226, 230];
const GREY: RGB = [166, 166, 174];

export const AVATAR_LIBRARY: LibraryFace[] = [
  // ── streaming series ─────────────────────────────────────────────────────
  { id: 'lib-eleven', name: 'Eleven', recipe: { skin: 'light', hairc: DARKBROWN, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'blouse', c1: [226, 148, 176], brow: 'flat', mouth: 'neutral', eyes: [76, 54, 40] } },
  { id: 'lib-hopper', name: 'Hopper', recipe: { skin: 'light', hairc: [140, 110, 78], hair: 'styleRecede', cloth: 'dressshirt', c1: [176, 154, 112], facial: 'mustache', headwear: { kind: 'cap', c: [122, 100, 62] }, brow: 'angry', mouth: 'neutral' } },
  { id: 'lib-wednesday', name: 'Wednesday', recipe: { skin: 'light', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 14, vol: 1 }, cloth: 'dressshirt', c1: [34, 32, 40], tie: [232, 230, 226], braids: { c: BLACK }, brow: 'angry', mouth: 'neutral', eyes: [60, 58, 70], lashes: true } },
  { id: 'lib-professor', name: 'Professor', recipe: { skin: 'light', hairc: DARKBROWN, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'suit', c1: [96, 100, 112], tie: [70, 74, 86], beard: DARKBROWN, glasses: true, brow: 'soft', mouth: 'neutral' } },
  { id: 'lib-tokyo', name: 'Tokyo', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 18, vol: 2 }, cloth: 'sweater', c1: [214, 58, 52], brow: 'angry', mouth: 'neutral', lashes: true, eyes: [58, 44, 40] } },
  { id: 'lib-dali', name: 'Dalí', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [214, 58, 52], faceMask: { c: [238, 236, 230], eye: [40, 38, 44] }, beard: [60, 56, 60] } },
  { id: 'lib-456', name: '456', recipe: { skin: 'light', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'polo', c1: [86, 176, 128], c2: [236, 236, 232], brow: 'raised', mouth: 'neutral', eyes: [54, 44, 44] } },
  { id: 'lib-guard', name: 'Guard', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [232, 96, 152], faceMask: { c: [36, 34, 40], eye: [214, 90, 142], style: 'shapes' } } },
  { id: 'lib-geralt', name: 'Geralt', recipe: { skin: 'light', hairc: WHITE, hair: 'styleFrame', hairargs: { length: 15, vol: 1 }, cloth: 'sweater', c1: [52, 48, 54], facial: 'stubble', scar: 'left', brow: 'angry', mouth: 'neutral', eyes: [196, 186, 120] } },
  { id: 'lib-beth', name: 'Beth', recipe: { skin: 'light', hairc: [200, 96, 56], hair: 'styleFrame', hairargs: { length: 13, vol: 2 }, cloth: 'blouse', c1: [72, 132, 96], lashes: true, brow: 'flat', mouth: 'neutral', eyes: [96, 130, 156] } },
  { id: 'lib-jonas', name: 'Jonas', recipe: { skin: 'light', hairc: BROWN, hair: 'styleMessy', hairargs: { length: 14 }, cloth: 'sweater', c1: [232, 196, 62], c2: [190, 156, 44], brow: 'soft', mouth: 'neutral', eyes: [96, 130, 156] } },
  { id: 'lib-jinx', name: 'Jinx', recipe: { skin: 'light', hairc: [72, 118, 214], hair: 'styleFrame', hairargs: { length: 20, vol: 1 }, cloth: 'sweater', c1: [58, 54, 72], braids: { c: [72, 118, 214] }, brow: 'raised', mouth: 'grin', eyes: [214, 96, 150], lashes: true } },
  { id: 'lib-vi', name: 'Vi', recipe: { skin: 'light', hairc: [226, 110, 150], hair: 'styleSpiky', cloth: 'sweater', c1: [116, 92, 68], scar: 'right', brow: 'angry', mouth: 'neutral', eyes: [88, 132, 160] } },
  { id: 'lib-tommy', name: 'Tommy', recipe: { skin: 'light', hairc: BROWN, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'suit', c1: [62, 66, 74], tie: [48, 52, 60], headwear: { kind: 'flat', c: [76, 78, 84] }, brow: 'angry', mouth: 'neutral', eyes: [104, 136, 160] } },
  { id: 'lib-escobar', name: 'Escobar', recipe: { skin: 'tan', hairc: [58, 48, 40], hair: 'styleFloppy', cloth: 'dressshirt', c1: [230, 226, 214], facial: 'mustache', heavy: true, brow: 'flat', mouth: 'neutral', eyes: [64, 46, 38] } },

  // ── films ────────────────────────────────────────────────────────────────
  { id: 'lib-neo', name: 'Neo', recipe: { skin: 'light', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'suit', c1: [30, 30, 36], tie: [26, 26, 32], shades: [46, 122, 78], brow: 'flat', mouth: 'neutral' } },
  { id: 'lib-morpheus', name: 'Morpheus', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [58, 44, 62], shades: [148, 116, 60], facial: 'goatee', brow: 'flat', mouth: 'neutral' } },
  { id: 'lib-trinity', name: 'Trinity', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBun', cloth: 'sweater', c1: [28, 28, 34], shades: [64, 62, 74], brow: 'angry', mouth: 'neutral', lashes: true } },
  { id: 'lib-wick', name: 'John Wick', recipe: { skin: 'light', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 12, vol: 1 }, cloth: 'suit', c1: [32, 32, 38], tie: [28, 28, 34], beard: BLACK, brow: 'angry', mouth: 'neutral' } },
  { id: 'lib-sparrow', name: 'Sparrow', recipe: { skin: 'tan', hairc: [56, 42, 34], hair: 'styleMessy', hairargs: { length: 18 }, cloth: 'blouse', c1: [148, 122, 90], headwear: { kind: 'band', c: [176, 62, 54] }, beard: [56, 42, 34], braids: { c: [56, 42, 34] }, brow: 'raised', mouth: 'grin' } },
  { id: 'lib-indy', name: 'Indiana', recipe: { skin: 'light', hairc: DARKBROWN, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'cardigan', c1: [120, 92, 56], c2: [214, 200, 172], headwear: { kind: 'fedora', c: [110, 82, 50] }, facial: 'stubble', brow: 'flat', mouth: 'neutral' } },
  { id: 'lib-gandalf', name: 'Gandalf', recipe: { skin: 'light', hairc: GREY, hair: 'styleFrame', hairargs: { length: 18, vol: 2 }, cloth: 'sweater', c1: [124, 124, 132], beard: GREY, headwear: { kind: 'pointed', c: [108, 108, 118] }, brow: 'soft', mouth: 'neutral' } },
  { id: 'lib-batman', name: 'Batman', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [40, 42, 52], helmet: { c: [40, 42, 52], openJaw: true }, mouth: 'neutral' } },
  { id: 'lib-joker', name: 'Joker', recipe: { skin: 'light', hairc: [96, 176, 88], hair: 'styleMessy', hairargs: { length: 15 }, cloth: 'suit', c1: [124, 76, 156], tie: [86, 160, 76], facePaint: { skin: [238, 236, 232], mouth: [206, 62, 68] }, brow: 'raised', mouth: 'grin' } },
  { id: 'lib-harley', name: 'Harley', recipe: { skin: 'light', hairc: BLOND, hair: 'styleFrame', hairargs: { length: 16, vol: 2 }, cloth: 'blouse', c1: [56, 54, 66], braids: { c: [214, 92, 140], long: false }, lashes: true, blush: true, brow: 'raised', mouth: 'grin' } },
  { id: 'lib-deadpool', name: 'Deadpool', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [58, 56, 62], faceMask: { c: [196, 54, 48], eye: [236, 234, 230] } } },
  { id: 'lib-spidey', name: 'Spidey', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [58, 92, 176], faceMask: { c: [196, 54, 48], eye: [236, 236, 240] } } },
  { id: 'lib-vader', name: 'Vader', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [30, 30, 34], helmet: { c: [34, 34, 40], visor: [92, 96, 108] } } },
  { id: 'lib-trooper', name: 'Trooper', recipe: { skin: 'light', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [232, 232, 236], helmet: { c: [236, 236, 240], visor: [40, 40, 46] } } },
  { id: 'lib-terminator', name: 'T-800', recipe: { skin: 'light', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'sweater', c1: [40, 38, 44], shades: [26, 26, 30], wideShades: true, brow: 'flat', mouth: 'neutral' } },
];

export const LIBRARY_BY_ID: Record<string, LibraryFace> =
  Object.fromEntries(AVATAR_LIBRARY.map((f) => [f.id, f]));
