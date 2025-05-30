# xTaste - Chrome Extension

A Chrome extension that allows you to save and share your X/Twitter likes as a shareable HTML file.

## Layout Design

"xTaste" Title on top,
if user is not in x.com/username/likes link show that warning "open x likes page to use extension please",
"load all liked posts" button (disabled if warning showing, turn into stop button while loading posts),
"save as HTML" button (disabled if there is no loaded post) 

## Features

- **Load All Liked Posts**: Automatically scrolls through your likes page for catching all posts that user's liked.
- **Save as HTML**: Exports all your likes to a shareable, standalone HTML file with embedded media.
- **Easy Reach To Real X Post**: Adds link of posts as a href attirbute so user can reach the real post when clicked on a post in generated HTML file.
- **Beautiful UI**: Clean, modern interface that matches X's design.
- **Smooth UX**: Create dynamic buttons! When post loading start show pause button, if paused show resume button on same place. Disable Save As HTML button if there is no loaded post. etc.
- **Progress Tracking**: Real-time progress updates while loading posts.
- **Offline Viewing**: Generated HTML files work offline for can be shared easily.

## How to Use

1. **Install the Extension**: Load this extension in Chrome (see installation instructions below)
2. **Navigate to Your Likes**: Go to your X/Twitter likes page (`x.com/[username]/likes`)
3. **Open the Extension**: Click the extension icon in your browser toolbar
4. **Load All Liked Posts**: Click "Load All Liked Posts" to automatically scroll and catch all your liked posts
5. **How Many Posts**: Check how many posts catched from extension, stop and resume if you request.
6. **Save as HTML**: When you think loaded post count is enough, use download as HTML button after clicked to stop button.

## Installation

1. **Download or Clone** this repository to your computer
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** by toggling the switch in the top right
4. **Click "Load unpacked"** and select the extension folder
5. **The extension** will now appear in your browser toolbar

## Why This Extension?

X/Twitter made all likes private by default, so only you can see your own likes. This extension helps you:

- **Share your taste**: Create shareable collections of posts you've liked
- **Backup your likes**: Keep a permanent record of posts you've enjoyed
- **Offline access**: View your likes even when offline

## Technical Details

- **Infinite Scroll Handling**: Automatically loads all posts by simulating scrolling, save loaded posts after every scroll.
- **Content Preservation**: Saves complete post content including images and text
- **Clean HTML Output**: Generates well-formatted, styled same with X/Twitter HTML files
- **Privacy Focused**: All processing happens locally in your browser

## Permissions Explained

- **activeTab**: Access the current tab to read likes
- **storage**: Save extension settings and progress
- **downloads**: Save the generated HTML file
- **host_permissions**: Access X/Twitter pages

## Privacy

This extension:
- ✅ Works entirely in your browser
- ✅ Doesn't send any data to external servers
- ✅ Only accesses X/Twitter when you're on the site
- ✅ Generated files stay on your computer

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve this extension!

## License

MIT License - feel free to use and modify as needed.
