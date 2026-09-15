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
 * it. What varies is hair, skin, clothing, and a handful of accessories.
 *
 * WHICH IS WHY THIS SET WORKS WHERE TWO EARLIER ONES DID NOT. The first was
 * film characters, seventeen of thirty with facial hair and four identical
 * recipes in different shirts. The second leaned on five hats and five
 * hairstyles to separate thirty people and kept converging. Anime hair is the
 * answer: blond, pink, green, scarlet, sky blue, violet, silver — colour alone
 * separates most of this set before a single garment is drawn.
 *
 * Six characters from each of five series, so no one series crowds the picker:
 * Naruto, One Piece, Fairy Tail, Attack on Titan, and That Time I Got
 * Reincarnated as a Slime. The series is data, not a label — the picker shows
 * the character's name and nothing else.
 *
 * Four accessories exist for the ones a silhouette alone cannot carry — a straw
 * hat, a mask, a blindfold and whiskers — and they are flags on the recipe
 * rather than a general slot system, because each was built for exactly one
 * character.
 *
 * The budget is checked by test/avatar-variety.test.cjs:
 *
 *   series      five, six faces each
 *   facial hair at most a quarter of the set
 *   hair        no style on more than a third
 *   uniqueness  no two share skin, hair colour, hair style, facial hair and
 *               headwear
 *
 * Skin tone is NOT budgeted here, unlike the country set this replaced: these
 * are specific characters and their tone is theirs. The test asks only that
 * more than one appears.
 *
 * An agent stores its avatar as this `id`, so a face survives a rename. The
 * `name` is a label in the picker's tooltip, not the agent's name.
 */
import type { RGB, Recipe } from './portraitArt';

export interface LibraryFace {
  id: string;
  name: string;
  /** Which series the character is from. NOT shown anywhere — the picker prints
   *  the name alone. It is kept because the set is balanced six per series and
   *  test/avatar-variety.test.cjs enforces that, which it cannot do if the only
   *  record of where a face came from is a comment. */
  series: string;
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
const PINK: RGB = [236, 146, 168];

export const AVATAR_LIBRARY: LibraryFace[] = [
  { id: 'lib-naruto', name: 'Naruto', series: 'Naruto', recipe: { skin: 'light', hairc: BLOND, hair: 'styleSpiky', cloth: 'polo', c1: [232, 126, 34], c2: [46, 52, 74], whiskers: true, brow: 'raised', mouth: 'grin', eyes: [86, 150, 196] } },
  { id: 'lib-sasuke', name: 'Sasuke', series: 'Naruto', recipe: { skin: 'light', hairc: [40, 42, 62], hair: 'styleMessy', hairargs: { length: 15 }, cloth: 'sweater', c1: [44, 56, 84], brow: 'angry', mouth: 'neutral', eyes: [54, 46, 52] } },
  { id: 'lib-sakura', name: 'Sakura', series: 'Naruto', recipe: { skin: 'light', hairc: PINK, hair: 'styleBun', cloth: 'blouse', c1: [206, 66, 84], brow: 'raised', mouth: 'smile', lashes: true, eyes: [92, 156, 116] } },
  { id: 'lib-kakashi', name: 'Kakashi', series: 'Naruto', recipe: { skin: 'light', hairc: GREY, hair: 'styleTallSpikes', cloth: 'sweater', c1: [58, 62, 76], mask: true, brow: 'soft', eyes: [70, 62, 60] } },
  { id: 'lib-hinata', name: 'Hinata', series: 'Naruto', recipe: { skin: 'light', hairc: [58, 62, 108], hair: 'styleFrame', hairargs: { length: 20, vol: 2 }, cloth: 'cardigan', c1: [214, 206, 232], c2: [246, 244, 250], brow: 'soft', mouth: 'neutral', lashes: true, eyes: [196, 190, 214] } },
  { id: 'lib-gaara', name: 'Gaara', series: 'Naruto', recipe: { skin: 'light', hairc: [186, 62, 44], hair: 'styleMessy', hairargs: { length: 13 }, cloth: 'sweater', c1: [110, 74, 58], brow: 'flat', mouth: 'neutral', eyes: [148, 176, 188] } },
  { id: 'lib-luffy', name: 'Luffy', series: 'One Piece', recipe: { skin: 'tan', hairc: BLACK, hair: 'styleMessy', hairargs: { length: 14 }, cloth: 'polo', c1: [198, 56, 50], c2: [156, 42, 40], hat: 'straw', scar: 'left', brow: 'raised', mouth: 'grin', eyes: [72, 46, 32] } },
  { id: 'lib-zoro', name: 'Zoro', series: 'One Piece', recipe: { skin: 'tan', hairc: [92, 148, 78], hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'sweater', c1: [58, 84, 62], scar: 'right', brow: 'angry', mouth: 'neutral', eyes: [70, 62, 44] } },
  { id: 'lib-nami', name: 'Nami', series: 'One Piece', recipe: { skin: 'light', hairc: [232, 138, 58], hair: 'styleFrame', hairargs: { length: 17, vol: 1 }, cloth: 'blouse', c1: [88, 168, 196], brow: 'raised', mouth: 'smile', lashes: true, eyes: [126, 90, 52] } },
  { id: 'lib-sanji', name: 'Sanji', series: 'One Piece', recipe: { skin: 'light', hairc: [236, 208, 120], hair: 'styleFloppy', cloth: 'suit', c1: [36, 36, 44], tie: [58, 60, 72], facial: 'goatee', brow: 'flat', mouth: 'neutral', eyes: [96, 118, 92] } },
  { id: 'lib-robin', name: 'Robin', series: 'One Piece', recipe: { skin: 'light', hairc: [26, 22, 28], hair: 'styleFrame', hairargs: { length: 20, vol: 1 }, cloth: 'blouse', c1: [124, 84, 156], brow: 'soft', mouth: 'smile', lashes: true, eyes: [72, 96, 76] } },
  { id: 'lib-usopp', name: 'Usopp', series: 'One Piece', recipe: { skin: 'dark', hairc: BLACK, hair: 'styleCurly', cloth: 'cardigan', c1: [178, 140, 66], c2: [96, 76, 52], headwear: { kind: 'band', c: [210, 198, 172] }, brow: 'raised', mouth: 'grin', eyes: [66, 46, 34] } },
  { id: 'lib-natsu', name: 'Natsu', series: 'Fairy Tail', recipe: { skin: 'tan', hairc: [226, 118, 138], hair: 'styleSpiky', cloth: 'sweater', c1: [42, 44, 52], brow: 'angry', mouth: 'grin', eyes: [86, 130, 90] } },
  { id: 'lib-lucy', name: 'Lucy', series: 'Fairy Tail', recipe: { skin: 'light', hairc: BLOND, hair: 'styleBun', cloth: 'blouse', c1: [226, 232, 240], brow: 'raised', mouth: 'smile', lashes: true, blush: true, eyes: [126, 90, 54] } },
  { id: 'lib-erza', name: 'Erza', series: 'Fairy Tail', recipe: { skin: 'light', hairc: [176, 44, 40], hair: 'styleFrame', hairargs: { length: 19, vol: 2 }, cloth: 'sweater', c1: [166, 172, 186], brow: 'flat', mouth: 'neutral', lashes: true, eyes: [96, 74, 56] } },
  { id: 'lib-gray', name: 'Gray', series: 'Fairy Tail', recipe: { skin: 'light', hairc: [46, 54, 84], hair: 'styleMessy', hairargs: { length: 14 }, cloth: 'cardigan', c1: [62, 72, 102], c2: [212, 220, 232], brow: 'raised', mouth: 'neutral', eyes: [70, 82, 96] } },
  { id: 'lib-wendy', name: 'Wendy', series: 'Fairy Tail', recipe: { skin: 'light', hairc: [86, 132, 190], hair: 'styleFrame', hairargs: { length: 21, vol: 2 }, cloth: 'blouse', c1: [232, 152, 176], brow: 'soft', mouth: 'smile', lashes: true, eyes: [96, 132, 168] } },
  { id: 'lib-gajeel', name: 'Gajeel', series: 'Fairy Tail', recipe: { skin: 'tan', hairc: [28, 26, 30], hair: 'styleTallSpikes', cloth: 'sweater', c1: [70, 66, 72], brow: 'angry', mouth: 'neutral', eyes: [148, 76, 64] } },
  { id: 'lib-eren', name: 'Eren', series: 'Attack on Titan', recipe: { skin: 'tan', hairc: DARKBROWN, hair: 'styleMessy', hairargs: { length: 16 }, cloth: 'cardigan', c1: [116, 90, 62], c2: [206, 198, 178], brow: 'angry', mouth: 'neutral', eyes: [104, 142, 132] } },
  { id: 'lib-mikasa', name: 'Mikasa', series: 'Attack on Titan', recipe: { skin: 'light', hairc: [30, 28, 36], hair: 'styleShort', hairargs: { part: 'R' }, cloth: 'sweater', c1: [166, 46, 44], brow: 'flat', mouth: 'neutral', lashes: true, eyes: [72, 66, 70] } },
  { id: 'lib-levi', name: 'Levi', series: 'Attack on Titan', recipe: { skin: 'light', hairc: [34, 32, 38], hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'dressshirt', c1: [240, 240, 244], tie: [236, 236, 238], brow: 'angry', mouth: 'neutral', eyes: [84, 92, 100] } },
  { id: 'lib-armin', name: 'Armin', series: 'Attack on Titan', recipe: { skin: 'light', hairc: [232, 206, 132], hair: 'styleFloppy', cloth: 'cardigan', c1: [120, 96, 66], c2: [210, 202, 182], brow: 'soft', mouth: 'neutral', eyes: [110, 148, 176] } },
  { id: 'lib-historia', name: 'Historia', series: 'Attack on Titan', recipe: { skin: 'light', hairc: [244, 224, 150], hair: 'styleFrame', hairargs: { length: 18, vol: 1 }, cloth: 'blouse', c1: [226, 230, 238], brow: 'soft', mouth: 'smile', lashes: true, blush: true, eyes: [116, 156, 190] } },
  { id: 'lib-hange', name: 'Hange', series: 'Attack on Titan', recipe: { skin: 'light', hairc: [128, 92, 54], hair: 'styleBun', cloth: 'cardigan', c1: [118, 92, 62], c2: [204, 196, 176], glasses: true, brow: 'raised', mouth: 'grin', eyes: [122, 96, 62] } },
  { id: 'lib-rimuru', name: 'Rimuru', series: 'Slime', recipe: { skin: 'light', hairc: [128, 190, 222], hair: 'styleFrame', hairargs: { length: 16, vol: 1 }, cloth: 'sweater', c1: [38, 40, 50], brow: 'soft', mouth: 'neutral', lashes: true, eyes: [214, 176, 72] } },
  { id: 'lib-milim', name: 'Milim', series: 'Slime', recipe: { skin: 'light', hairc: [232, 132, 168], hair: 'styleFrame', hairargs: { length: 21, vol: 1 }, cloth: 'blouse', c1: [232, 160, 184], braids: { c: [232, 132, 168], long: true }, brow: 'raised', mouth: 'grin', lashes: true, eyes: [196, 76, 96] } },
  { id: 'lib-shion', name: 'Shion', series: 'Slime', recipe: { skin: 'light', hairc: [146, 106, 196], hair: 'styleFrame', hairargs: { length: 20, vol: 2 }, cloth: 'blouse', c1: [96, 72, 132], brow: 'raised', mouth: 'smile', lashes: true, eyes: [180, 118, 206] } },
  { id: 'lib-shuna', name: 'Shuna', series: 'Slime', recipe: { skin: 'light', hairc: [242, 176, 200], hair: 'styleFrame', hairargs: { length: 19, vol: 1 }, cloth: 'blouse', c1: [214, 124, 156], braids: { c: [242, 176, 200] }, brow: 'soft', mouth: 'smile', lashes: true, eyes: [204, 118, 150] } },
  { id: 'lib-benimaru', name: 'Benimaru', series: 'Slime', recipe: { skin: 'tan', hairc: [206, 74, 52], hair: 'styleMessy', hairargs: { length: 15 }, cloth: 'sweater', c1: [58, 54, 62], brow: 'angry', mouth: 'neutral', eyes: [196, 88, 64] } },
  { id: 'lib-diablo', name: 'Diablo', series: 'Slime', recipe: { skin: 'light', hairc: [24, 22, 30], hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'suit', c1: [30, 30, 38], tie: [86, 60, 132], glasses: true, brow: 'flat', mouth: 'smile', eyes: [124, 190, 108] } },
];



export const LIBRARY_BY_ID: Record<string, LibraryFace> =
  Object.fromEntries(AVATAR_LIBRARY.map((f) => [f.id, f]));
