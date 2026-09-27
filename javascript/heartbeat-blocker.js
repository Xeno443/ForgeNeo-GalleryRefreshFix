// ForgeNeo-GalleryRefreshFix - heartbeat blocker
//
// Every open tab keeps a permanent /heartbeat/{session} connection. Browsers
// allow only 6 HTTP/1.1 connections per host, so with several tabs open the
// heartbeats use up all slots, and live preview polling, interrupt and even
// page loads stall in the browser.
//
// The heartbeat's only job is to tell the server when a tab closes, so it can
// run `unload` events and expire gr.State values with a time-to-live. Forge
// uses neither, and the page never reads the heartbeat's messages. So when the
// `grf_block_heartbeat` setting is on, this answers the heartbeat request with
// a local, never-ending empty stream instead of opening a real connection.
// Gradio itself is not modified.
//
// Gradio opens the heartbeat before Forge has loaded its settings, so the
// request is held until the settings are available, then blocked or let through.

(function () {
    "use strict";

    const LOG_PREFIX = "[ForgeNeo-GalleryRefreshFix]";

    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function" || originalFetch.__heartbeatBlocker) {
        return;
    }

    function isHeartbeatRequest(input, init) {
        try {
            const url = input instanceof Request ? input.url : String(input);
            const method = (init && init.method) || (input instanceof Request ? input.method : "GET");
            return method.toUpperCase() === "GET" && new URL(url, window.location.href).pathname.includes("/heartbeat/");
        } catch (e) {
            return false;
        }
    }

    function optionsAvailable() {
        return new Promise(function (resolve) {
            if (typeof onOptionsAvailable === "function") {
                onOptionsAvailable(resolve);
            } else {
                resolve();
            }
        });
    }

    // Off unless the setting is explicitly turned on.
    function blockingEnabled() {
        try {
            return typeof opts !== "undefined" && opts.grf_block_heartbeat === true;
        } catch (e) {
            return false;
        }
    }

    function idleStream() {
        return new Response(new ReadableStream({ start() {} }), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
        });
    }

    async function fetchWithHeartbeatBlocker(input, init) {
        if (!isHeartbeatRequest(input, init)) {
            return originalFetch.apply(window, arguments);
        }

        const args = arguments;
        await optionsAvailable();

        if (!blockingEnabled()) {
            return originalFetch.apply(window, args);
        }
        console.info(LOG_PREFIX, "heartbeat connection blocked - frees a browser connection slot");
        return idleStream();
    }

    fetchWithHeartbeatBlocker.__heartbeatBlocker = true;
    window.fetch = fetchWithHeartbeatBlocker;
})();
