# Chat to Blog

A WordPress plugin that imports media from chat conversations through Beeper Desktop and creates blog posts from them.

## Description

Chat to Blog helps you save photos and videos that arrive in Signal, WhatsApp, and other group chats before they disappear into chat history. It connects to the Beeper Desktop local API, lets you browse chat media, and publishes selected items directly as WordPress posts with gallery or individual image/video blocks.

Beeper Desktop acts as the local bridge. It connects to your chat apps as a desktop device, decrypts your chat media on your computer, and exposes a private API that this plugin can read after you approve it.

### Features

- Browse chats and group conversations connected through Beeper Desktop
- View and select images and videos from chat messages
- Support for multiple image formats: JPEG, PNG, GIF, WebP, HEIC/HEIF, AVIF, BMP, TIFF, SVG
- Support for multiple video formats: MP4, MOV, WebM, AVI, MKV, 3GP
- Videos display with play icon overlay and VIDEO badge for easy identification
- Drag and drop to reorder selected media
- Create posts as galleries or individual image/video blocks
- Videos are embedded as native WordPress video blocks with controls
- Mixed galleries: images grouped in gallery, videos added as separate blocks
- Automatic duplicate detection (won't re-import the same media twice)
- Set custom post dates for backdated publishing
- Media is imported to the WordPress Media Library with full metadata

## Requirements

- WordPress 5.0 or higher
- PHP 7.4 or higher
- [Beeper Desktop](https://www.beeper.com/download) running on the same machine where you use the WordPress admin
- Signal, WhatsApp, or another chat network connected inside Beeper Desktop
- Beeper API token (generated from Beeper Desktop settings)

## Installation

1. Upload the `chat-to-blog` folder to `/wp-content/plugins/`
2. Activate the plugin through the WordPress admin
3. Go to **Settings > Chat to Blog** to configure your Beeper connection

## Configuration

### Beeper API Token

1. Install [Beeper Desktop](https://www.beeper.com/download)
2. Connect the chat networks you want to import from, such as Signal or WhatsApp
3. Keep Beeper Desktop running on the same computer where you use the WordPress admin
4. Open **Beeper Desktop** and go to **Settings** (gear icon)
5. Click **Developers** in the sidebar
6. Turn on **Beeper Desktop API** (the API starts on `localhost:23373`)
7. Scroll to **Approved connections** and click the **+** button
8. Paste the token in the Chat to Blog settings page

## Usage

1. Go to **Posts > Chat to Blog** in the WordPress admin
2. Select a chat from the horizontal chat list at the top
3. Click on images to select them (they appear in the right panel)
4. Drag to reorder images if needed
5. Enter a post title and optional text content
6. Choose between Gallery or Individual images format
7. Click **Save Draft** or **Publish**

### Tips

- Already-imported media shows a dimmed overlay
- Videos are marked with a play icon and "VIDEO" badge
- When using Gallery format with mixed media, images are grouped in the gallery and videos are added below as individual blocks
- Click "Load More" to fetch older messages from a chat
- Set a custom date to backdate posts

## How It Works

1. The plugin communicates with Beeper Desktop's local API at `localhost:23373`
2. Chat messages and media metadata are fetched via the API
3. When creating a post, media is transferred as base64 data through the browser
4. The plugin imports media to the WordPress Media Library
5. Posts are created with Gutenberg image/gallery blocks

## Translations

The plugin is fully translatable. To create translations:

1. Use a tool like [Poedit](https://poedit.net/) or WP-CLI to generate a `.pot` file
2. Create translations in the `languages/` directory
3. Name files as `chat-to-blog-{locale}.po` and `chat-to-blog-{locale}.mo`

For JavaScript translations, the plugin uses `wp_set_script_translations()`. Generate a JSON file with:

```bash
wp i18n make-json languages/chat-to-blog-{locale}.po --no-purge
```

## File Structure

```
chat-to-blog/
├── chat-to-blog.php          # Main plugin file
├── includes/
│   ├── class-admin.php       # Admin pages and AJAX handlers
│   ├── class-beeper-api.php  # Beeper Desktop API client
│   └── class-media-importer.php  # Media Library import logic
├── templates/
│   ├── settings.php          # Settings page template
│   └── media-browser.php     # Media browser page template
├── assets/
│   ├── admin.js              # Main admin JavaScript
│   ├── admin.css             # Admin styles
│   ├── beeper-client.js      # Browser-side Beeper API client
│   └── sortable.min.js       # SortableJS for drag-and-drop
└── languages/                # Translation files (.po, .mo, .json)
```

## License

GPL v2 or later
