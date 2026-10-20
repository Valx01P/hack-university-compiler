# Lighter images

A photo straight from a phone is 4000 pixels wide and about 3 MB. A page shows
it 800 pixels wide. That is 2.9 MB nobody sees.

What we do now for every site:

1. Export at the largest size the page shows, times two for sharp screens.
2. Pick JPEG for photos and PNG for logos and screenshots.
3. Add `width` and `height` to every `<img>`, so the page does not jump.

The about page went from 5.1 MB to 410 KB.
