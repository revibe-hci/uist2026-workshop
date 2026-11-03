# Video tools

Scripts that made the argue demo video and table 7's supercut. They need Google Chrome, Node 18+, Python 3 and ffmpeg.

## Argue demo video (`../argue-demo.mp4`)

Records `../argue-demo.html` in headless Chrome, with the page's Web Audio as the soundtrack. It captures at 3200×1800 with `html{zoom:2}`, then scales down to 1080p, so text stays sharp. Headless screencast frames always come at CSS pixel size.

    mkdir /tmp/rec && cd /tmp/rec
    node <repo>/revibes/misty/demos/tools/record-argue-demo.mjs
    sh <repo>/revibes/misty/demos/tools/encode-argue-demo.sh

## Supercut

`titles.txt` lists the clips in order: `<filename> | <title> | <names>`. `cards.mjs` renders the title cards, and `build.py` joins cards and clips with crossfades and normalized audio.

    cd supercut
    node cards.mjs "$PWD/titles.txt" "$PWD/cards"
    python3 build.py <folder with the videos> "$PWD/cards" "$PWD/out/supercut.mp4" "$PWD/titles.txt"

The source videos and the result (2:46, 1080p, 69 MB) are not in git.
