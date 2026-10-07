# Arabic document font

`NotoSansArabic-Regular.ttf` is an unmodified Noto font from the
[official archived Noto font repository](https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf).
The accompanying `OFL.txt` is its redistribution license.

The static TrueType asset is intentional: the newer Arabic WOFF subset produced
missing glyphs with the current PDF fontkit subset embedder in both Ghostscript
and macOS Quartz. Latin text continues to use the existing Noto Sans dependency.
The shared canvas selects script-specific runs for PDF and SVG preview, keeping
Arabic shaping intact without rendering Latin text through the Arabic subset.

The API build copies these runtime assets into `dist/assets`; the production
container copies the complete `dist` directory. No system-installed font or
runtime font download is required.
