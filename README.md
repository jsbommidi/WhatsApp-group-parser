# WhatsApp Group Message Parser

A Chrome extension that allows you to extract and analyze messages from WhatsApp Web groups and individual chats. Export your conversations to JSON or CSV format for analysis, backup, or data migration.

## 🚀 Features

- **Extract Visible Messages**: Quickly extract messages currently visible in your chat
- **Extract All Messages**: Automatically scroll through chat history to extract all messages
- **Multiple Export Formats**: Export to JSON or CSV for analysis
- **Media Detection**: Identifies different message types (text, images, audio, video, documents, stickers)
- **Real-time Progress**: Live progress tracking during full chat extraction
- **Message Metadata**: Captures sender, timestamp, message type, and direction
- **Chat Information**: Extracts chat title and participant details
- **Modern UI**: Clean, WhatsApp-inspired interface

## 📦 Installation

### Method 1: Developer Mode (Recommended for now)

1. **Download the Extension**
   ```bash
   git clone https://github.com/jsbommidi/WhatsApp-group-parser.git
   cd WhatsApp-group-parser
   ```

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `WhatsApp-group-parser` folder
   - The extension should now appear in your extensions list

4. **Pin the Extension** (Optional)
   - Click the puzzle piece icon in Chrome toolbar
   - Find "WhatsApp Message Parser" and click the pin icon

### Method 2: Chrome Web Store
*Coming soon - the extension will be available on the Chrome Web Store*

## 🎯 Usage

### Getting Started

1. **Open WhatsApp Web**
   - Navigate to [web.whatsapp.com](https://web.whatsapp.com)
   - Log in with your phone's QR code scanner

2. **Select a Chat**
   - Choose any individual chat or group conversation
   - Make sure the chat is fully loaded

3. **Open the Extension**
   - Click the WhatsApp Message Parser icon in your Chrome toolbar
   - The extension will detect you're on WhatsApp Web

### Extracting Messages

#### Quick Extract (Visible Messages)
- Click **"Extract Visible Messages"**
- Extracts all messages currently visible on screen
- Fast and efficient for recent conversations

#### Full Extract (All Messages)
- Click **"Extract All Messages"**
- Automatically scrolls through entire chat history
- Progress bar shows extraction status
- Can be stopped at any time with "Stop Extraction"

### Exporting Data

Once messages are extracted:

1. **JSON Export**
   - Click "Export as JSON"
   - Downloads a structured JSON file with all message data
   - Includes metadata like timestamps, senders, and message types

2. **CSV Export**
   - Click "Export as CSV"
   - Downloads a spreadsheet-compatible file
   - Great for analysis in Excel, Google Sheets, or data tools

## 📊 Data Format

### JSON Export Structure
```json
{
  "chatTitle": "Group Name or Contact",
  "extractedAt": "2024-01-15T10:30:00.000Z",
  "messageCount": 1250,
  "messages": [
    {
      "sender": "John Doe",
      "text": "Hello everyone!",
      "timestamp": "10:30 AM",
      "messageType": "text",
      "isOutgoing": false
    }
  ]
}
```

### CSV Export Columns
- **Timestamp**: When the message was sent
- **Sender**: Who sent the message
- **Message**: The message content
- **Type**: Message type (text, image, audio, video, document, sticker, contact)
- **Direction**: Incoming or Outgoing
- **Contact Name**: Name from contact cards (when applicable)
- **Contact Phone**: Phone number from contact cards (when applicable)

## 🔧 Technical Details

### Message Types Detected
- **Text**: Regular text messages
- **Image**: Photos and images
- **Video**: Video files
- **Audio**: Voice messages and audio files
- **Document**: PDF, DOC, and other file attachments
- **Sticker**: WhatsApp stickers
- **Contact**: Shared contact cards with name and phone number extraction

### Browser Compatibility
- Google Chrome (Recommended)
- Microsoft Edge (Chromium-based)
- Other Chromium-based browsers

### Privacy & Security
- **Local Processing**: All data processing happens locally in your browser
- **No Data Collection**: The extension doesn't collect or transmit your data
- **No External Servers**: Messages are never sent to external servers
- **Offline Capable**: Works without internet connection once loaded

## 🛠️ Development

### Prerequisites
- Google Chrome or Chromium-based browser
- Basic understanding of Chrome extensions

### Project Structure
```
WhatsApp-group-parser/
├── manifest.json          # Extension configuration
├── content.js             # Content script for WhatsApp Web
├── popup.html             # Extension popup interface
├── popup.js               # Popup logic and controls
├── popup.css              # Popup styling
├── background.js          # Background service worker
├── icons/                 # Extension icons
└── README.md              # Documentation
```

### Local Development
1. Clone the repository
2. Make your changes
3. Reload the extension in `chrome://extensions/`
4. Test on WhatsApp Web

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## ⚠️ Important Notes

### Limitations
- **WhatsApp Web Only**: Works only with WhatsApp Web, not the mobile app
- **Visible Content**: Can only extract messages that WhatsApp Web loads
- **Rate Limiting**: Very large chats may take time to fully extract
- **DOM Dependent**: Relies on WhatsApp Web's HTML structure

### Best Practices
- **Stable Internet**: Ensure stable connection during full extractions
- **Close Other Tabs**: Close unnecessary tabs to improve performance
- **Regular Breaks**: For very large chats, consider extracting in sections
- **Backup Important Chats**: Use this tool to backup important conversations

### Known Issues
- Some very old messages might not be accessible
- WhatsApp Web updates may temporarily break functionality
- Large media files are only referenced, not downloaded

## 📱 Supported WhatsApp Features

✅ **Supported**
- Text messages
- Media messages (images, videos, audio)
- Document attachments
- Stickers
- Contact cards with name and phone extraction
- Group chats
- Individual chats
- Message timestamps
- Sender identification

❌ **Not Supported**
- Deleted messages
- Message reactions
- Voice message transcriptions
- Media file downloads
- Live location sharing

## 🔄 Updates

### Version 1.0
- Initial release
- Basic message extraction
- JSON and CSV export
- Progress tracking
- Modern UI

## 📞 Support

If you encounter any issues:

1. **Check WhatsApp Web**: Ensure you're on the latest version of WhatsApp Web
2. **Reload Extension**: Try disabling and re-enabling the extension
3. **Clear Cache**: Clear browser cache and cookies for WhatsApp Web
4. **Report Issues**: Create an issue on GitHub with detailed information

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- WhatsApp for providing WhatsApp Web
- Chrome Extensions API documentation
- Open source community for inspiration and tools

---

**Disclaimer**: This extension is not affiliated with WhatsApp or Meta. Use responsibly and in accordance with WhatsApp's Terms of Service. 