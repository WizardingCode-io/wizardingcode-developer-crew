# The encode

Every command here reads and writes files inside the project's folder, and nothing else. `raw/` and `review/` are folders beside the site's own, and do not ship; `assets/` is the site's.

## The scrub encode

To show a frame, a browser decodes forward from the keyframe before it. A clip as a tool delivers it has one every few seconds, so a scroll that asks for a frame far from the last keyframe waits on that decoding, and stutters. Encode the approved clip again with a keyframe every 8 frames:

```
ffmpeg -i raw/film.mp4 -c:v libx264 -crf 18 -preset slow -g 8 -keyint_min 8 -pix_fmt yuv420p -movflags +faststart -an assets/film.mp4
```

- `-g 8 -keyint_min 8`: a keyframe every 8 frames. Any position of the scroll then has an exact frame close by.
- `-crf 18`: the quality. A higher number is a smaller file and a rougher picture.
- `-pix_fmt yuv420p`: the pixel format every browser plays.
- `-movflags +faststart`: the index at the front of the file, so it can be used as soon as it has arrived.
- `-an`: no sound. A clip driven by the scroll never plays any.

Six seconds at 1080p should land between 4 and 8 MB. These numbers are starting points.

## When the file is too large

Change one thing at a time, and judge by dragging the result back and forth, not by a paused frame.

1. Raise `-crf` first, to 20, then 22.
2. Then narrow the picture: add `-vf scale=1728:-2` before the output's name.
3. Never lengthen the keyframe interval.

Footage full of fine detail (particles, cloth that fills the frame) hides compression and can go to `-crf 25`. Smooth gradients do the opposite: they break into bands, in the calm frames first, so look at those.

## The poster and the ending frame

From the encoded clip, so that they match it exactly:

```
ffmpeg -i assets/film.mp4 -frames:v 1 -q:v 2 assets/film-poster.jpg
ffmpeg -sseof -0.1 -i assets/film.mp4 -update 1 -frames:v 1 -q:v 2 assets/film-ending.jpg
```

The poster is what a visitor sees before the clip arrives and what the still hero shows. The ending frame is a picture of the page's own world, free to use in a section below.

## Three frames to look at

Before the user watches the clip, look at its start, its middle and its end. For a clip of six seconds:

```
ffmpeg -ss 0 -i raw/film.mp4 -frames:v 1 -q:v 2 review/start.jpg
ffmpeg -ss 3 -i raw/film.mp4 -frames:v 1 -q:v 2 review/middle.jpg
ffmpeg -sseof -0.1 -i raw/film.mp4 -update 1 -frames:v 1 -q:v 2 review/end.jpg
```

## Does the ending rest

The difference between each frame and the one before it, as one number per frame. The command prints a `YAVG` line for each: read the last ones. An arrival falls back to the level it began at; a clip that never settles keeps a high number through its last frames.

```
ffmpeg -i raw/film.mp4 -vf "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null -
```

Where the clip is good until its subject starts to move again near the end, cut it at the last steady moment and encode in one pass. The page reads the scroll as a share of the stage, whatever the clip's length, and a shorter clip changes nothing else. Here at 4.3 seconds:

```
ffmpeg -i raw/film.mp4 -t 4.3 -c:v libx264 -crf 18 -preset slow -g 8 -keyint_min 8 -pix_fmt yuv420p -movflags +faststart -an assets/film.mp4
```

Make the poster and the ending frame again after a cut.

## The frame that starts the next clip

At full quality, never a review frame:

```
ffmpeg -sseof -0.1 -i raw/part-1.mp4 -update 1 -frames:v 1 raw/part-1-last.png
```

## Several clips as one

Join the raw clips and encode once, so that nothing differs at a join:

```
ffmpeg -i raw/part-1.mp4 -i raw/part-2.mp4 -i raw/part-3.mp4 -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]" -map "[v]" -c:v libx264 -crf 18 -preset slow -g 8 -keyint_min 8 -pix_fmt yuv420p -movflags +faststart -an assets/film.mp4
```

Where a join still shows as a cut, cross-fade over a quarter of a second. The offset is the first clip's length less the fade:

```
ffmpeg -i raw/part-1.mp4 -i raw/part-2.mp4 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.25:offset=5.75[v]" -map "[v]" -c:v libx264 -crf 18 -preset slow -g 8 -keyint_min 8 -pix_fmt yuv420p -movflags +faststart -an assets/film.mp4
```

A cross-fade needs both clips at one size and one frame rate. Judge a join by dragging across it in both directions.

## Stills for the sections below

One clean pass, 1920 wide:

```
ffmpeg -i raw/still.png -vf scale=1920:-2 -q:v 2 assets/section.jpg
```

A screenshot or anything with sharp edges stays a PNG.
