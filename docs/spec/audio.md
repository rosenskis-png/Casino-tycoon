# Audio and music (M10)

Sound is data (`src/data/sounds.ts`, `src/data/music.ts`), played by `src/platform/audio.ts` and `src/platform/music.ts`. The floor is heard through `src/ui/floorAudio.ts`. There are no audio files and no vibration.

## Mixer
- Master volume, mute, and five categories: **music, games, floor, crowd, interface**. `SOUND_CAT` assigns each sound to a category; anything unlisted counts as games.
- Settings are kept on the device (`ct-sound` in storage), not in saves. The sliders are on the title screen and in the Game tab.
- At most 24 sounds play at once. Interface sounds always play. Any single sound repeats at most every 60 ms.

## Sound on the floor
- A sound with a place (`x`, `y` on the event) is heard from the middle of the view. Within one screen (d ≤ 1, where d is the distance in screen half-widths or half-heights) it plays at 1 − 0.35·d. It fades to silence at two screens away, pans up to 60% left or right, and is scaled by zoom: close 1, default 0.85, wide 0.55, overview 0.3.
- A jackpot is always heard at 40% or more.
- **Ambient murmur:** band-passed noise with a slow wobble. Its level is the guests in view ÷ 30 (capped at 1) × the zoom factor.
- **Rounds in view:** when a game on screen finishes a round, it makes its sound (reels, a card, cards, chips, the roulette spin, a keno or bingo ball, a sportsbook roar). Two at most per 200 ms. Craps dice and table cheers come from the sim, as before.
- **Idle sounds:** machine chimes and bar glassware now and then, more often the busier the view.
- **Shows:** applause when a show in view ends.
- Everything on the floor goes quiet when paused, on the title screen, and at half level while you play a game yourself.

## Music
- Tracks are tempo, key, one chord per bar and 16-step patterns: drums, bass, pad, arpeggio and lead (`data/music.ts` explains the notation). A small look-ahead sequencer plays them.
- **Main theme** ("Casino Tycoon", swing lounge in F) plays on the title screen once you tap to start. iPhone needs that tap before any audio.
- **Nightclubs:** each club's card picks a track: House, Disco, Electro, Latin or Hip hop (`PlacedObject.track`, `setTrack`). It plays from the club while the game runs, placed like any floor sound but carrying 1.4× as far.
- **Show lounges** play "Showtime" while a show is on.
- Only the two loudest music sources play at once. A source you can't hear keeps time silently.
