# Chat to Blog

- Contributors: akirk
- Tags: beeper, chat, media, import, gallery
- Requires at least: 6.0
- Requires PHP: 7.4
- Tested up to: 7.1
- Stable tag: 0.9.4
- License: GPL-2.0-or-later
- License URI: https://www.gnu.org/licenses/gpl-2.0.html

Import photos and videos from your Beeper chats and turn them into WordPress posts with gallery or individual media blocks.

## Description

Chat to Blog helps you save photos and videos that arrive in Signal, WhatsApp, and other group chats before they disappear into chat history. It connects to the Beeper Desktop local API, lets you browse chat media, and publishes selected items directly as WordPress posts with gallery or individual image/video blocks.

Beeper Desktop acts as the local bridge. It connects to your chat apps as a desktop device, decrypts your chat media on your computer, and exposes a private API that this plugin can read after you approve it.

Pick a chat from the horizontal chat bar, scroll or jump to a month in the timeline, and click the pictures you want. Selected media collects in a panel on the right where you can drag it into the order you want, give the post a title and some text, choose a category and a date, and then save a draft or publish. Everything you pick is imported into the WordPress Media Library along with the caption, sender and timestamp from the chat, and the post is built from standard Gutenberg image, gallery and video blocks — so the result is an ordinary WordPress post you can keep editing in the block editor.

Because Beeper Desktop's API only listens on localhost, the browser talks to it directly and hands the media to WordPress, which means the WordPress site itself never needs network access to your chats.

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
- Import media into the Media Library without creating a post
- Choose which post types Chat to Blog appears on and can post to
- Media is imported to the WordPress Media Library with full metadata

### Requirements

- [Beeper Desktop](https://www.beeper.com/download) running on the same machine where you use the WordPress admin
- Signal, WhatsApp, or another chat network connected inside Beeper Desktop
- Beeper API token (generated from Beeper Desktop settings)

## Installation

1. Upload the `chat-to-blog` folder to `/wp-content/plugins/`
2. Activate the plugin through the WordPress admin
3. Go to **Settings > Chat to Blog** to configure your Beeper connection

### Beeper API Token

1. Install [Beeper Desktop](https://www.beeper.com/download)
2. Connect the chat networks you want to import from, such as Signal or WhatsApp
3. Keep Beeper Desktop running on the same computer where you use the WordPress admin
4. Open **Beeper Desktop** and go to **Settings** (gear icon)
5. Click **Developers** in the sidebar
6. Turn on **Beeper Desktop API** (the API starts on `localhost:23373`)
7. Scroll to **Approved connections** and click the **+** button
8. Paste the token in the Chat to Blog settings page

## Frequently Asked Questions

### How do I create a post?

Go to **Posts > Chat to Blog** in the WordPress admin, select a chat from the horizontal chat list at the top, click images to select them (they appear in the right panel), drag to reorder them if needed, enter a post title and optional text, choose between the Gallery and Individual images format, and click **Save Draft** or **Publish**.

### Does my WordPress site need to reach Beeper?

No. The Beeper Desktop API only listens on localhost, so the media is fetched by your browser and passed to WordPress from there. This does mean the admin page has to be open on the same machine where Beeper Desktop is running.

### Will the same picture be imported twice?

No. Every imported attachment stores the chat media identifier it came from, and already-imported media is shown with a dimmed overlay so you can see at a glance what has been used before.

### Can I post to a custom post type?

Yes. On the settings page you can enable any public post type. Chat to Blog then appears in that post type's menu and can create entries of that type.

### How are videos handled?

Videos are marked with a play icon and a "VIDEO" badge in the browser. They are imported to the Media Library like images and embedded as native WordPress video blocks with controls. When using the Gallery format with mixed media, the images are grouped in the gallery and the videos are added below as individual blocks.

### How do I load older media?

Scroll to the end of a chat's media to fetch older messages, or use the timeline above the grid to jump straight to a month.

### Can I import media without creating a post?

Yes. Select the media and use **Import Without Posting** to add it to the Media Library only.

### How can I translate the plugin?

The plugin is fully translatable. Generate a `.pot` file with a tool like [Poedit](https://poedit.net/) or WP-CLI, put translations in the `languages/` directory named `chat-to-blog-{locale}.po` and `.mo`, and generate the JSON file used for the JavaScript strings with `wp i18n make-json languages/chat-to-blog-{locale}.po --no-purge`.

## Screenshots

1. Browsing chat media and composing a post from the selected images.
2. The settings screen on a phone: the Beeper connection steps and the API token field, one column deep.

## Changelog

### 0.9.4
- Match the launcher icon to the catalog entry.
- Improved Beeper onboarding and a clearer error when Beeper Desktop cannot be reached.
- Timeline for jumping to a month within a chat.
- Import media without creating a post.
- Support for multiple post types.
