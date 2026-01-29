# Agent Instructions for Chat to Blog

## What This Plugin Does

Chat to Blog is a WordPress plugin that imports media (images and videos) from Beeper chats and creates blog posts from them.

### Architecture

- **Beeper API**: The plugin connects to a local Beeper instance running at `localhost:23373` to fetch chat data and media
- **Media URLs**: Media is referenced via `localmxc://`, `mxc://`, or `file://` URLs from Beeper
- **Frontend**: JavaScript fetches media directly from Beeper's `/v1/assets/serve` endpoint using Bearer token authentication
- **Backend**: PHP handles WordPress AJAX for chat listing, post creation, and settings

### Key Files

- `chat-to-blog.php` - Main plugin file, defines version constants
- `includes/class-admin.php` - Admin UI, AJAX handlers, media browser
- `includes/class-beeper-api.php` - Beeper API client
- `includes/class-media-importer.php` - Handles importing media to WordPress media library
- `assets/admin.js` - Frontend JavaScript for media browser UI
- `assets/admin.css` - Styles for admin interface

### Media Flow

1. User selects a chat from dropdown
2. JavaScript calls Beeper API to list media in that chat
3. Thumbnails are loaded directly from Beeper's `/v1/assets/serve` endpoint
4. For videos without poster images, a `<video>` tag is used instead of `<img>`
5. When creating a post, selected media is downloaded and imported to WordPress media library

## Releasing a New Version

1. Update version number in `chat-to-blog.php` (both header comment and `CHAT_TO_BLOG_VERSION` constant)
2. Commit changes with descriptive message
3. Create and push tag WITHOUT 'v' prefix: `git tag 0.x.x && git push origin 0.x.x`
4. Create GitHub release: `gh release create 0.x.x --title "0.x.x" --notes "..."`

**Important**: Tags should be `0.9.2` not `v0.9.2`

## Development Notes

- The plugin requires Beeper desktop app running locally
- Media is fetched client-side directly from Beeper API to avoid WordPress proxy issues
- The `beeperToken` is passed to JavaScript for authentication with local Beeper API
- Nonce verification can fail in some WordPress hosting environments (e.g., with path-based authentication proxies), which is why media fetching was moved to client-side
