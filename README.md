# SAMMI-Elgato-StreamDeck-Extension
Work in progress elgato streamdeck extension for SAMMI

# Compiling
- `cd` into the directory that contains this README
- run `npm install`
- run `npm run build`
- run the "build_plugin.bat" file located in the src folder to package the .streamDeckPlugin file in "SAMMI_SD_Final".

Your output files should be the .streamDeckPlugin file located in "src/SAMMI_SD_FINAL", and the "compiled.sef" SAMMI Extension file located in "src/SAMMI_Extension".

# Debugging/Development

If you wish to work on the plugin, run the "create_symlink.bat" file to create a symbolic link to the Elgato Stream Deck plugin folder. This will allow you to not have to package your plugin anytime you want to see changes.

In order to see any changes, the Stream Deck application has to fully restart as far as I'm aware, so it can be a little painful to work on.

To see your changes:
- Create a symbolic link to the plugins folder
- close the Stream Deck application and wait for the icon to disappear from your system tray
- run `npm run build` and wait for it to finish
- Upon build you'll get "compiled.sef" for testing in the SAMMI Bridge, and a "main.exe" gets built, which should be automatically linked properly.
- Re-open the Stream Deck application.