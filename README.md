# ForgeNeo-GalleryRefreshFix

An extension for [Forge Classic Neo](https://github.com/Haoming02/sd-webui-forge-classic/tree/neo) that fixes the result gallery no longer updating after the webui was restarted while a browser tab stayed open.

## The problem

After restarting the webui, an already-open tab still shows the live preview and step counter while generating, but the finished image never appears in the gallery - it keeps showing the previous result until the page is reloaded.

In the browser DevTools you can see that clicking Generate sends `queue/join` but never opens a `/queue/data` stream anymore.

## Why it happens

Gradio's frontend delivers results over one long-lived `/queue/data` stream per tab and remembers whether that stream is open. It only clears that "open" state when the server sends a `close_stream` message. When the stream is cut off instead (the connection is reset by the restart, or the server can't be reached), the state stays "open", so Gradio never opens a new stream and the results have nowhere to go. The live preview keeps working because it is polled separately.

## What this extension does

It adds a small script that watches the `/queue/data` stream only. If the stream ends without a `close_stream` message, the script delivers the same error Gradio would report for the interrupted job, followed by a `close_stream`, so Gradio resets its state and opens a fresh stream on the next Generate.

- All other requests, and the data of a working stream, pass through unchanged.
- No Gradio or Forge files are modified.
- A job that was running at the moment of the restart still shows an error - it really was lost. The next Generate works normally.
- When it steps in, it logs a `[ForgeNeo-GalleryRefreshFix]` warning in the browser console.

## Installation

1. In the webui, open **Extensions** > **Install from URL**.
2. Paste `https://github.com/Xeno443/ForgeNeo-GalleryRefreshFix` and click **Install**.
3. Restart the webui and reload the browser tabs.

Manual install: clone this repository into `webui/extensions/`.

## Compatibility

Tested with Forge Classic Neo 2.29 (Gradio 4.40). The fix relies on Gradio's client behavior, so other Gradio versions may need re-checking.

## License

[The Unlicense](LICENSE) - public domain.
