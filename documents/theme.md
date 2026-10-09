# Deep Teal theme

Deep Teal is the default app theme. Its base background is `#102c30`, its surfaces use lighter teal tones, and its primary accent is `#80e0d5`. Text, borders, primary buttons, chat bubbles, and loading indicators use shared theme tokens so they change with the selected theme.

The startup tokens are defined in `src/index.html`. The runtime palette and theme picker are defined in `src/utils/renderer.js` and `src/components/views/CustomizeView.js`. Preferences persist the selected theme. A saved `dark` selection from earlier versions is migrated to `deepteal`; the former dark palette remains available as **Charcoal** in Customize. The transparency setting continues to apply to background surfaces.
