from modules import script_callbacks, shared


def on_ui_settings():
    section = ("gallery_refresh_fix", "Gallery Refresh Fix")

    shared.opts.add_option(
        "grf_gallery_fix",
        shared.OptionInfo(
            True,
            "Recover the result gallery after the webui was restarted while the tab stayed open",
            section=section,
        ).info("takes effect immediately"),
    )
    shared.opts.add_option(
        "grf_block_heartbeat",
        shared.OptionInfo(
            True,
            "Block Gradio's heartbeat connection, freeing browser connection slots for live preview and interrupt when many tabs are open",
            section=section,
        ).info("takes effect after reloading the browser tab"),
    )


script_callbacks.on_ui_settings(on_ui_settings)
