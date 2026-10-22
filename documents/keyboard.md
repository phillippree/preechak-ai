# Keyboard shortcuts

On macOS, window movement uses Command + arrow keys. Increase conversation background opacity with Command + period and decrease it with Command + comma. Defaults in registration, Help, and Customize use the same combinations. Windows/Linux retain their existing Ctrl movement and Alt opacity shortcuts.

The first macOS shortcut read migrates saved bindings that exactly match the previous Alt defaults. Other custom bindings are preserved. A local `commandShortcutsVersion` preference marks completion, so later customization is not overwritten. Restart the app to register the updated shortcuts. Global shortcuts may conflict with operating-system or other application bindings.

Regression tests cover platform defaults across all three consumers and one-time saved-binding migration without altering custom shortcuts.
