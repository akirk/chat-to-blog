# Chat to Blog

A WordPress plugin that imports media from Beeper chat conversations and creates blog posts from them.

## Description

Chat to Blog connects to the Beeper Desktop local API to browse images and videos from your chat conversations. Select media items, arrange them as you like, and publish them directly as WordPress blog posts with gallery or individual image blocks.

### Features

- Browse all your Beeper chats and group conversations
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
- [Beeper Desktop](https://www.beeper.com/) running on the same machine as WordPress
- Beeper API token (generated from Beeper Desktop settings)

## Installation

1. Upload the `chat-to-blog` folder to `/wp-content/plugins/`
2. Activate the plugin through the WordPress admin
3. Go to **Settings > Chat to Blog** to configure your Beeper connection

## Configuration

### Beeper API Token

1. Open **Beeper Desktop** on your computer
2. Go to **Settings** (gear icon)
3. Click **Developers** in the sidebar
4. Scroll to **Approved connections** and click the **+** button
5. Paste the token in the Chat to Blog settings page

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
