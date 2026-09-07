"""Flip Atlas's theme colour:  python3 .preview/theme.py purple|blue

The whole app is styled through the --cth-* tokens, so a retint is a swap of
the cream/ink ramps in tokens.css plus the splash tile in index.html. Every run
starts from the COMMITTED state of those two files, so variants never stack —
which also means uncommitted edits to them are discarded. Refresh the browser
after (CSS hot-reloads; index.html needs the reload).
"""
import pathlib, subprocess, sys

R = pathlib.Path(__file__).resolve().parent.parent
variant = sys.argv[1] if len(sys.argv) > 1 else 'purple'
VARIANTS = ('purple', 'amethyst', 'indigo', 'plum', 'nebula', 'blue')
if variant not in VARIANTS:
    sys.exit('usage: theme.py ' + '|'.join(VARIANTS))

# always start from the committed state so variants never stack
subprocess.run(['git', 'checkout', '--',
                'src/renderer/src/design/tokens.css', 'src/renderer/index.html'], cwd=R, check=True)

# (light-block value, dark-block value) keyed by the current committed value
PAL = {
 'purple': {
  'light': {'--cth-cream-50':'#FDFCFF','--cth-cream-100':'#F7F5FF','--cth-cream-200':'#EAE5FA',
            '--cth-cream-300':'#D6CEF2','--cth-paper-100':'#FCFBFF','--cth-paper-200':'#F0ECFB',
            '--cth-ink-900':'#1A1030','--cth-ink-700':'#3B2C5E','--cth-ink-500':'#6A5A90',
            '--cth-ink-300':'#A99CC6','--cth-ink-100':'#DAD2EC',
            '--cth-ground-centre':'#FDFCFF','--cth-ground-bloom':'rgba(110, 76, 220, 0.12)','--cth-ground-edge':'#EDE8FB'},
  'dark':  {'--cth-cream-50':'#15121D','--cth-cream-100':'#1B1727','--cth-cream-200':'#251F34',
            '--cth-cream-300':'#312A44','--cth-paper-100':'#181423','--cth-paper-200':'#211B2F',
            '--cth-ground-centre':'#262038','--cth-ground-bloom':'rgba(120, 86, 235, 0.18)','--cth-ground-edge':'#110E19'},
  'mark':  ('#5B3FA8', '#3B2673'),   # splash tile fill, its border
 },
 'amethyst': {   # deeper lavender ground, true violet ink
  'light': {'--cth-cream-50':'#F6F2FE','--cth-cream-100':'#EDE7FA','--cth-cream-200':'#DED4F4',
            '--cth-cream-300':'#C7B8EB','--cth-paper-100':'#F7F4FE','--cth-paper-200':'#E7E0F7',
            '--cth-ink-900':'#1B1136','--cth-ink-700':'#3A2A66','--cth-ink-500':'#665694',
            '--cth-ink-300':'#A294C8','--cth-ink-100':'#CFC5E6',
            '--cth-ground-centre':'#F4F0FD','--cth-ground-bloom':'rgba(109, 75, 196, 0.13)','--cth-ground-edge':'#E2DAF6'},
  'dark':  {'--cth-cream-50':'#130E20','--cth-cream-100':'#191330','--cth-cream-200':'#231B3F',
            '--cth-cream-300':'#2F2551','--cth-paper-100':'#16102A','--cth-paper-200':'#1E1736',
            '--cth-ground-centre':'#251D42','--cth-ground-bloom':'rgba(126, 92, 240, 0.19)','--cth-ground-edge':'#0E0A18'},
  'mark':  ('#6D4BC4', '#3F2A80'),
 },
 'indigo': {   # violet leaning blue — the coolest of the purple family
  'light': {'--cth-cream-50':'#F3F4FE','--cth-cream-100':'#E9EAFA','--cth-cream-200':'#D8DAF4',
            '--cth-cream-300':'#BEC2EB','--cth-paper-100':'#F5F6FE','--cth-paper-200':'#E3E5F8',
            '--cth-ink-900':'#141433','--cth-ink-700':'#2E3163','--cth-ink-500':'#5A5E90',
            '--cth-ink-300':'#989CC4','--cth-ink-100':'#C7CAE4',
            '--cth-ground-centre':'#F2F3FD','--cth-ground-bloom':'rgba(75, 79, 192, 0.13)','--cth-ground-edge':'#DDDFF5'},
  'dark':  {'--cth-cream-50':'#0F1022','--cth-cream-100':'#151732','--cth-cream-200':'#1E2142',
            '--cth-cream-300':'#2A2E55','--cth-paper-100':'#12142B','--cth-paper-200':'#1A1D38',
            '--cth-ground-centre':'#202445','--cth-ground-bloom':'rgba(96, 104, 236, 0.19)','--cth-ground-edge':'#0B0C18'},
  'mark':  ('#4B4FC0', '#2A2C78'),
 },
 'plum': {   # warm purple with a mauve lean — the least "screen blue" of them
  'light': {'--cth-cream-50':'#FBF3FC','--cth-cream-100':'#F2E6F6','--cth-cream-200':'#E6D3ED',
            '--cth-cream-300':'#D2B6DE','--cth-paper-100':'#FCF6FD','--cth-paper-200':'#EDDFF2',
            '--cth-ink-900':'#26102E','--cth-ink-700':'#4A2757','--cth-ink-500':'#775285',
            '--cth-ink-300':'#B291BC','--cth-ink-100':'#DCC7E2',
            '--cth-ground-centre':'#FAF2FB','--cth-ground-bloom':'rgba(150, 70, 175, 0.12)','--cth-ground-edge':'#EBDBF0'},
  'dark':  {'--cth-cream-50':'#180E1D','--cth-cream-100':'#20142A','--cth-cream-200':'#2C1C38',
            '--cth-cream-300':'#3A2748','--cth-paper-100':'#1C1124','--cth-paper-200':'#261731',
            '--cth-ground-centre':'#2D1D3A','--cth-ground-bloom':'rgba(178, 92, 220, 0.18)','--cth-ground-edge':'#120A17'},
  'mark':  ('#7B3F9E', '#4A2260'),
 },
 'nebula': {   # deep space violet — the darkest light theme of the set
  'light': {'--cth-cream-50':'#F0EDFB','--cth-cream-100':'#E4DFF6','--cth-cream-200':'#D3CBEF',
            '--cth-cream-300':'#B9AEE4','--cth-paper-100':'#F4F1FD','--cth-paper-200':'#DDD6F2',
            '--cth-ink-900':'#170F2E','--cth-ink-700':'#332658','--cth-ink-500':'#5E5088',
            '--cth-ink-300':'#9A8CC0','--cth-ink-100':'#C4B9DF',
            '--cth-ground-centre':'#EEEAFA','--cth-ground-bloom':'rgba(122, 90, 240, 0.13)','--cth-ground-edge':'#D8D0F1'},
  'dark':  {'--cth-cream-50':'#0E0B1A','--cth-cream-100':'#140F26','--cth-cream-200':'#1C1634',
            '--cth-cream-300':'#282046','--cth-paper-100':'#110D20','--cth-paper-200':'#19122E',
            '--cth-ground-centre':'#211838','--cth-ground-bloom':'rgba(122, 90, 240, 0.20)','--cth-ground-edge':'#09070F'},
  'mark':  ('#7A5AF0', '#3D2A9B'),
 },
 'blue': {
  'light': {'--cth-cream-50':'#FBFDFF','--cth-cream-100':'#F1F6FD','--cth-cream-200':'#E0EBF8',
            '--cth-cream-300':'#C6DAEF','--cth-paper-100':'#FAFCFF','--cth-paper-200':'#EAF2FA',
            '--cth-ink-900':'#101827','--cth-ink-700':'#2C3E5C','--cth-ink-500':'#5A6E8C',
            '--cth-ink-300':'#96A8C0','--cth-ink-100':'#CBD8E7',
            '--cth-ground-centre':'#FBFDFF','--cth-ground-bloom':'rgba(47, 95, 168, 0.13)','--cth-ground-edge':'#E6EFF9'},
  'dark':  {'--cth-cream-50':'#11151E','--cth-cream-100':'#161C27','--cth-cream-200':'#1F2735',
            '--cth-cream-300':'#2A3446','--cth-paper-100':'#131822','--cth-paper-200':'#1B222F',
            '--cth-ground-centre':'#1F2839','--cth-ground-bloom':'rgba(78, 138, 235, 0.18)','--cth-ground-edge':'#0D1118'},
  'mark':  ('#2F5FA8', '#1B3A६E'.replace('६','6'), ),
 },
}[variant]

p = R / 'src/renderer/src/design/tokens.css'
lines = p.read_text().split('\n')
dark_at = next(i for i, l in enumerate(lines) if "data-cth-theme='dark'" in l)
for i, l in enumerate(lines):
    block = 'dark' if i > dark_at else 'light'
    for tok, val in PAL[block].items():
        if l.strip().startswith(tok + ':'):
            head = l.split(':')[0]
            tail = ('  /* ' + l.split('/*')[1]) if '/*' in l else ''
            lines[i] = f'{head}: {val};' + (' ' + tail if tail else '')
p.write_text('\n'.join(lines))

h = R / 'src/renderer/index.html'
s = h.read_text()
fill, border = PAL['mark']
s = s.replace('background: #6E1423; color: #F4F1EA; border: 4px solid #4A0D17;',
              f'background: {fill}; color: #F4F1EA; border: 4px solid {border};')
s = s.replace('<div class="mk">MD</div>', '<div class="mk">A</div>')
s = s.replace('background: #FFF8E7; color: #1A1320;',
              f"background: {PAL['light']['--cth-cream-100']}; color: {PAL['light']['--cth-ink-900']};")
h.write_text(s)
print(variant, 'applied')
