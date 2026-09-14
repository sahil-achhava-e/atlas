/**
 * The avatar library: thirty faces to pick from, plus Atlas.
 *
 * These are RECIPES, not images. Each is drawn by the same code that draws
 * Atlas (portraitArt.ts) from the same vocabulary, so a library costs thirty
 * lines rather than thirty PNGs.
 *
 * At 18x28 a face cannot look like a person: there is one pixel row for the
 * eyes and one for the mouth. What DOES read is a costume, so every entry is
 * chosen for a silhouette you can name from across the room: a helmet, a mask,
 * a hat brim, dark lenses, a colour of hair nobody else has.
 *
 * WHAT WENT WRONG LAST TIME, and the rule that replaced it: the previous set
 * was borrowed from film and television, and ten of the thirty ended up as the
 * same face. Nine were tan-skinned, eight had black hair, nine had a beard or a
 * moustache — four were literally `skin: tan, hairc: BLACK, beard: BLACK` with
 * a different shirt. Names carried the difference and the drawing did not.
 *
 * So the set is budgeted now, and the budget is checked by a test:
 *
 *   skin        roughly even across all four tones, none over a third
 *   facial hair at most a quarter of the set
 *   covered     hat, helmet, mask or paint on about half, bare on the rest
 *   hair        no style on more than a third
 *
 * Names are neutral on purpose — birds, stars, minerals, trees. Nothing
 * borrowed, so nothing to untangle, and a name nobody already has a picture of
 * leaves the costume free to be the thing you recognise.
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
const AUBURN: RGB = [156, 78, 44];
const GINGER: RGB = [206, 104, 50];
const BLOND: RGB = [224, 192, 112];
const WHITE: RGB = [226, 226, 230];
const GREY: RGB = [166, 166, 174];
const STEEL: RGB = [120, 132, 148];

export const AVATAR_LIBRARY: LibraryFace[] = [
  // ── Bare faces: the hair and the build do the work ────────────────────────
  { id: 'lib-wren', name: 'Wren', recipe: { skin: 'tan', hairc: AUBURN, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'polo', c1: [86, 168, 148], c2: [236, 236, 232], brow: 'raised', mouth: 'smile', lashes: true, eyes: [76, 54, 40] } },
  { id: 'lib-heron', name: 'Heron', recipe: { skin: 'light', hairc: GREY, hair: 'styleFrame', hairargs: { length: 18, vol: 2 }, cloth: 'cardigan', c1: [148, 156, 168], c2: [226, 228, 232], brow: 'soft', mouth: 'neutral', eyes: [92, 104, 120] } },
  { id: 'lib-amber', name: 'Amber', recipe: { skin: 'light', hairc: BLOND, hair: 'styleFrame', hairargs: { length: 15, vol: 1 }, cloth: 'blouse', c1: [222, 168, 76], brow: 'soft', mouth: 'smile', lashes: true, blush: true, eyes: [96, 122, 84] } },
  { id: 'lib-onyx', name: 'Onyx', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [34, 32, 40], brow: 'flat', mouth: 'neutral', eyes: [70, 50, 36] } },
  { id: 'lib-jasper', name: 'Jasper', recipe: { skin: 'tan', hairc: BROWN, hair: 'styleMessy', hairargs: { length: 14 }, cloth: 'polo', c1: [196, 110, 62], c2: [240, 214, 176], brow: 'raised', mouth: 'grin', eyes: [82, 58, 40] } },
  { id: 'lib-willow', name: 'Willow', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 20, vol: 2 }, cloth: 'blouse', c1: [124, 156, 116], brow: 'soft', mouth: 'neutral', lashes: true, eyes: [64, 48, 36] } },
  { id: 'lib-rowan', name: 'Rowan', recipe: { skin: 'light', hairc: GINGER, hair: 'styleMessy', hairargs: { length: 13 }, cloth: 'polo', c1: [180, 62, 58], c2: [238, 222, 200], brow: 'raised', mouth: 'grin', blush: true, eyes: [92, 130, 96] } },
  { id: 'lib-indigo', name: 'Indigo', recipe: { skin: 'light', hairc: [86, 84, 190], hair: 'styleFrame', hairargs: { length: 16, vol: 1 }, cloth: 'sweater', c1: [52, 50, 84], brow: 'flat', mouth: 'neutral', lashes: true, eyes: [92, 88, 176] } },
  { id: 'lib-basalt', name: 'Basalt', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [72, 70, 80], heavy: true, brow: 'soft', mouth: 'smile', eyes: [66, 46, 34] } },
  { id: 'lib-vega', name: 'Vega', recipe: { skin: 'light', hairc: WHITE, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'cardigan', c1: [228, 230, 236], c2: [140, 156, 196], glasses: true, brow: 'soft', mouth: 'neutral', eyes: [88, 110, 160] } },

  // ── Lenses: three faces you read by what is over the eyes ─────────────────
  { id: 'lib-cobalt', name: 'Cobalt', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'sweater', c1: [38, 62, 132], shades: [40, 84, 176], wideShades: true, brow: 'flat', mouth: 'neutral' } },
  { id: 'lib-hazel', name: 'Hazel', recipe: { skin: 'tan', hairc: DARKBROWN, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'cardigan', c1: [168, 140, 96], c2: [232, 220, 196], glasses: true, brow: 'soft', mouth: 'smile', eyes: [88, 66, 40] } },
  { id: 'lib-slate', name: 'Slate', recipe: { skin: 'light', hairc: GREY, hair: 'styleRecede', cloth: 'dressshirt', c1: [128, 140, 156], tie: [70, 82, 98], facial: 'stubble', brow: 'angry', mouth: 'neutral', eyes: [96, 104, 116] } },

  // ── Brims and crowns: headwear is the whole silhouette ────────────────────
  { id: 'lib-osprey', name: 'Osprey', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'suit', c1: [66, 62, 78], tie: [172, 140, 66], headwear: { kind: 'fedora', c: [58, 54, 68] }, brow: 'flat', mouth: 'neutral', eyes: [68, 48, 34] } },
  { id: 'lib-rook', name: 'Rook', recipe: { skin: 'light', hairc: BLACK, hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'suit', c1: [44, 46, 54], tie: [40, 42, 50], headwear: { kind: 'flat', c: [56, 58, 66] }, brow: 'angry', mouth: 'neutral', eyes: [84, 96, 112] } },
  { id: 'lib-kestrel', name: 'Kestrel', recipe: { skin: 'tan', hairc: BROWN, hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'cardigan', c1: [122, 96, 62], c2: [206, 186, 150], headwear: { kind: 'cap', c: [96, 74, 48] }, shades: [70, 62, 50], mouth: 'neutral' } },
  { id: 'lib-tern', name: 'Tern', recipe: { skin: 'tan', hairc: GREY, hair: 'styleRecede', cloth: 'dressshirt', c1: [236, 238, 242], tie: [72, 118, 172], headwear: { kind: 'cap', c: [66, 112, 168] }, brow: 'soft', mouth: 'smile', eyes: [82, 118, 168] } },
  { id: 'lib-plover', name: 'Plover', recipe: { skin: 'brown', hairc: GREY, hair: 'styleFrame', hairargs: { length: 14, vol: 1 }, cloth: 'sweater', c1: [74, 52, 104], headwear: { kind: 'pointed', c: [92, 66, 132] }, brow: 'soft', mouth: 'neutral', eyes: [72, 50, 38] } },
  { id: 'lib-saffron', name: 'Saffron', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 17, vol: 1 }, cloth: 'blouse', c1: [226, 152, 48], headwear: { kind: 'band', c: [196, 88, 40] }, brow: 'raised', mouth: 'grin', lashes: true, eyes: [74, 52, 36] } },
  { id: 'lib-juniper', name: 'Juniper', recipe: { skin: 'brown', hairc: [76, 128, 88], hair: 'styleMessy', hairargs: { length: 16 }, cloth: 'sweater', c1: [58, 92, 70], headwear: { kind: 'band', c: [204, 186, 128] }, brow: 'raised', mouth: 'smile', eyes: [70, 96, 64] } },

  // ── Covered faces: helmet, mask, paint ────────────────────────────────────
  { id: 'lib-rigel', name: 'Rigel', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [58, 62, 72], helmet: { c: [214, 218, 226], visor: [62, 104, 148] } } },
  { id: 'lib-perseus', name: 'Perseus', recipe: { skin: 'brown', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [86, 78, 62], helmet: { c: [178, 152, 84], visor: [58, 52, 44], openJaw: true }, mouth: 'neutral' } },
  { id: 'lib-flint', name: 'Flint', recipe: { skin: 'light', hairc: DARKBROWN, hair: 'styleBald', cloth: 'sweater', c1: [122, 104, 74], faceMask: { c: [96, 100, 108], eye: [216, 184, 92], style: 'plain' } } },
  { id: 'lib-corvus', name: 'Corvus', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleBald', cloth: 'sweater', c1: [36, 38, 46], faceMask: { c: [42, 44, 54], eye: [206, 208, 214], style: 'eyes' } } },
  { id: 'lib-draco', name: 'Draco', recipe: { skin: 'light', hairc: [188, 72, 96], hair: 'styleMessy', hairargs: { length: 16 }, cloth: 'sweater', c1: [64, 44, 62], facePaint: { skin: [232, 226, 234], mouth: [176, 54, 82] }, brow: 'angry', mouth: 'grin' } },

  // ── Braids, and the four faces that keep their facial hair ────────────────
  { id: 'lib-lyra', name: 'Lyra', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleFrame', hairargs: { length: 18, vol: 1 }, cloth: 'blouse', c1: [180, 84, 132], braids: { c: BLACK, long: true }, brow: 'soft', mouth: 'smile', lashes: true, eyes: [66, 46, 34] } },
  { id: 'lib-sorrel', name: 'Sorrel', recipe: { skin: 'brown', hairc: AUBURN, hair: 'styleFrame', hairargs: { length: 16, vol: 1 }, cloth: 'cardigan', c1: [148, 88, 56], c2: [226, 196, 156], braids: { c: AUBURN }, brow: 'raised', mouth: 'smile', lashes: true, eyes: [88, 60, 38] } },
  { id: 'lib-alder', name: 'Alder', recipe: { skin: 'brown', hairc: DARKBROWN, hair: 'styleMessy', hairargs: { length: 14 }, cloth: 'cardigan', c1: [92, 74, 54], c2: [198, 178, 140], beard: DARKBROWN, brow: 'soft', mouth: 'neutral', eyes: [72, 50, 36] } },
  { id: 'lib-umber', name: 'Umber', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleRecede', cloth: 'polo', c1: [124, 86, 52], c2: [226, 208, 176], facial: 'goatee', brow: 'flat', mouth: 'neutral', eyes: [68, 48, 34] } },
  { id: 'lib-altair', name: 'Altair', recipe: { skin: 'tan', hairc: STEEL, hair: 'styleRecede', cloth: 'suit', c1: [70, 84, 102], tie: [168, 176, 190], facial: 'mustache', brow: 'flat', mouth: 'smile', eyes: [88, 100, 118] } },
];

export const LIBRARY_BY_ID: Record<string, LibraryFace> =
  Object.fromEntries(AVATAR_LIBRARY.map((f) => [f.id, f]));
