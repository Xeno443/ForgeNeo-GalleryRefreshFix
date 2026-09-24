// ForgeNeo-GalleryRefreshFix
//
// Gradio's frontend keeps one /queue/data result stream per tab and tracks it
// with a `stream_status.open` flag. Only a received `close_stream` message
// resets that flag - a stream that errors out (e.g. connection reset by a
// webui restart), fails to connect, or just ends leaves it stuck at `true`.
// Every later Generate then sends queue/join but never reopens /queue/data,
// so results never reach the gallery.
//
// This wraps window.fetch for /queue/data only. Whenever the stream would end
// without a `close_stream`, it first delivers the same `unexpected_error` that
// Gradio's own error handler would have sent to pending events, followed by a
// synthetic `close_stream`, so Gradio resets its flag and opens a fresh stream
// on the next Generate. All other requests, and all data of a healthy stream,
// pass through untouched. Gradio itself is not modified.
//
// Forge loads extension JS as classic scripts in <head>, which run before
// Gradio's module bundle, so the wrapper is in place before the first stream.

(function () {
    "use strict";

    const LOG_PREFIX = "[ForgeNeo-GalleryRefreshFix]";
    // Same text Gradio's client uses for its own stream error.
    const ERROR_MESSAGE = "Connection errored out. ";
    // Leading blank line terminates any partial event the dead stream left behind.
    const RECOVERY_EVENTS =
        "\n\n" +
        "data: " + JSON.stringify({ msg: "unexpected_error", message: ERROR_MESSAGE, success: false }) + "\n\n" +
        "data: " + JSON.stringify({ msg: "close_stream" }) + "\n\n";

    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function" || originalFetch.__galleryRefreshFix) {
        return;
    }

    const encoder = new TextEncoder();

    function isQueueDataRequest(input, init) {
        try {
            const url = input instanceof Request ? input.url : String(input);
            const method = (init && init.method) || (input instanceof Request ? input.method : "GET");
            return method.toUpperCase() === "GET" && new URL(url, window.location.href).pathname.endsWith("/queue/data");
        } catch (e) {
            return false;
        }
    }

    function recoveryResponse() {
        return new Response(RECOVERY_EVENTS, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
        });
    }

    // Passes the SSE body through unchanged while watching for `close_stream`.
    function wrapBody(body) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let pendingLine = "";
        let sawCloseStream = false;
        let cancelled = false;

        function scan(text) {
            const lines = (pendingLine + text).split(/\r\n|\r|\n/);
            pendingLine = lines.pop();
            for (const line of lines) {
                if (/^data:\s*\{.*"msg"\s*:\s*"close_stream"/.test(line)) {
                    sawCloseStream = true;
                }
            }
        }

        function recover(controller, reason) {
            console.warn(LOG_PREFIX, "/queue/data " + reason + " without close_stream - resetting Gradio's stream state");
            controller.enqueue(encoder.encode(RECOVERY_EVENTS));
            controller.close();
        }

        return new ReadableStream({
            async pull(controller) {
                let result;
                try {
                    result = await reader.read();
                } catch (err) {
                    if (cancelled) return;
                    if (sawCloseStream) {
                        controller.error(err);
                    } else {
                        recover(controller, "errored (" + (err && err.message ? err.message : err) + ")");
                    }
                    return;
                }
                if (cancelled) return;
                if (result.done) {
                    if (sawCloseStream) {
                        controller.close();
                    } else {
                        recover(controller, "ended");
                    }
                    return;
                }
                scan(decoder.decode(result.value, { stream: true }));
                controller.enqueue(result.value);
            },
            cancel(reason) {
                cancelled = true;
                return reader.cancel(reason);
            },
        });
    }

    async function fetchWithGalleryRefreshFix(input, init) {
        if (!isQueueDataRequest(input, init)) {
            return originalFetch.apply(window, arguments);
        }

        let response;
        try {
            response = await originalFetch.apply(window, arguments);
        } catch (err) {
            if (err && err.name === "AbortError") throw err;
            console.warn(LOG_PREFIX, "/queue/data request failed - resetting Gradio's stream state", err);
            return recoveryResponse();
        }

        if (!response.ok) {
            console.warn(LOG_PREFIX, "/queue/data returned HTTP " + response.status + " - resetting Gradio's stream state");
            return recoveryResponse();
        }
        if (!response.body) {
            return response;
        }

        return new Response(wrapBody(response.body), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    }

    fetchWithGalleryRefreshFix.__galleryRefreshFix = true;
    window.fetch = fetchWithGalleryRefreshFix;
})();
