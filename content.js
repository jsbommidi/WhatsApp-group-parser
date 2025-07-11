// WhatsApp Group Message Parser - Content Script
class WhatsAppParser {
  constructor() {
    this.messages = [];
    this.chatTitle = '';
    this.isExtractingAll = false;
  }

  // Extract current chat title with enhanced reliability
  getChatTitle() {
    const titleSelectors = [
      // Main chat title selectors (ordered by reliability)
      '[data-testid="conversation-info-header-chat-title"]',
      'header [data-testid="conversation-title"]',
      'header span[title]',
      '._2_7_Y span[title]',
      '.p357zi0d.ac2vgrno.ln8gz9je span',
      'header .copyable-text span',
      'header ._3Tw4- span',
      'header ._315-i span'
    ];

    let chatTitle = '';
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const title = element.textContent?.trim() || element.title?.trim() || '';
        if (title && title !== 'WhatsApp' && title.length > 0) {
          chatTitle = title;
          break;
        }
      }
      if (chatTitle) break;
    }
    
    // Fallback: try to get from document title
    if (!chatTitle && document.title && document.title !== 'WhatsApp') {
      const titleMatch = document.title.match(/^(.+?) - WhatsApp$/);
      if (titleMatch) {
        chatTitle = titleMatch[1].trim();
      }
    }
    
    // Fallback: try to get from URL or other indicators
    if (!chatTitle) {
      const url = window.location.href;
      const chatMatch = url.match(/\/chat\/([^\/]+)/);
      if (chatMatch) {
        chatTitle = `Chat-${chatMatch[1].substring(0, 10)}`;
      } else {
        chatTitle = `Unknown Chat ${new Date().toISOString().substring(11, 19)}`;
      }
    }
    
    // Validate and clean the title
    if (typeof chatTitle !== 'string') {
      chatTitle = 'Unknown Chat';
    }
    
    chatTitle = chatTitle.trim();
    if (chatTitle.length === 0) {
      chatTitle = 'Empty Chat Name';
    }
    
    // Limit title length
    if (chatTitle.length > 40) {
      chatTitle = chatTitle.substring(0, 40) + ' and more';
    }
    
    console.log('Extracted chat title:', chatTitle);
    return chatTitle;
  }

  // Extract messages from the current view
  extractVisibleMessages() {
    const messageSelectors = [
      '[data-testid="msg-container"]',
      '.message-in, .message-out',
      '._2_7_Y[data-id]',
      '[data-id*="true_"]'
    ];

    let messageElements = [];
    for (const selector of messageSelectors) {
      messageElements = document.querySelectorAll(selector);
      if (messageElements.length > 0) break;
    }

    const messages = [];
    messageElements.forEach((msgEl, index) => {
      try {
        const message = this.parseMessage(msgEl);
        if (message) {
          messages.push(message);
        }
      } catch (error) {
        console.log(`Error parsing message ${index}:`, error);
      }
    });

    return messages;
  }

  // Parse individual message element
  parseMessage(messageElement) {
    // Try different selectors for different WhatsApp layouts
    const senderSelectors = [
      '[data-testid="msg-meta"] span[aria-label]',
      '.copyable-text[data-pre-plain-text*="]"]',
      '._2_7_Y[data-pre-plain-text*="]"]',
      '.message-author',
      '._315-i .copyable-text span'
    ];

    const textSelectors = [
      '[data-testid="conversation-compose-box-input"]',
      '.copyable-text span.selectable-text',
      '._2_7_Y .selectable-text',
      '.message-text',
      '.quoted-mention span'
    ];

    const timeSelectors = [
      '[data-testid="msg-meta"] span[aria-label]',
      '.copyable-text[data-pre-plain-text*="]"]',
      '._2_7_Y[data-pre-plain-text*="]"]'
    ];

    let sender = 'Unknown';
    let text = '';
    let timestamp = '';
    let isOutgoing = false;

    // Extract sender
    for (const selector of senderSelectors) {
      const senderEl = messageElement.querySelector(selector);
      if (senderEl) {
        const dataAttr = senderEl.getAttribute('data-pre-plain-text');
        if (dataAttr) {
          const match = dataAttr.match(/\[(.*?)\]/);
          if (match) {
            timestamp = match[1];
            const senderMatch = dataAttr.match(/\] (.*?):/);
            if (senderMatch) {
              sender = senderMatch[1];
            }
          }
        }
        break;
      }
    }

    // Extract message text
    for (const selector of textSelectors) {
      const textEl = messageElement.querySelector(selector);
      if (textEl && textEl.textContent.trim()) {
        text = textEl.textContent.trim();
        break;
      }
    }

    // Check if message is outgoing
    isOutgoing = messageElement.classList.contains('message-out') || 
                messageElement.querySelector('[data-testid="msg-container"]')?.classList.contains('message-out') ||
                messageElement.closest('[data-testid="msg-container"]')?.getAttribute('data-id')?.includes('false');
    
    console.log('Message parsing debug:', {
      sender: sender,
      text: text.substring(0, 30),
      isOutgoing: isOutgoing,
      hasMessageOut: messageElement.classList.contains('message-out'),
      containerClasses: messageElement.className,
      dataId: messageElement.closest('[data-testid="msg-container"]')?.getAttribute('data-id')
    });

    // If no sender found and it's outgoing, mark as "You"
    if (sender === 'Unknown' && isOutgoing) {
      sender = 'You';
    }

    // Extract timestamp if not found yet
    if (!timestamp) {
      const timeEl = messageElement.querySelector('[data-testid="msg-meta"] span');
      if (timeEl) {
        timestamp = timeEl.textContent || '';
      }
    }

    // Check for media/special message types
    let messageType = 'text';
    if (messageElement.querySelector('[data-testid="audio-msg"]')) {
      messageType = 'audio';
      text = text || '[Audio Message]';
    } else if (messageElement.querySelector('[data-testid="image-thumb"]')) {
      messageType = 'image';
      text = text || '[Image]';
    } else if (messageElement.querySelector('[data-testid="video-thumb"]')) {
      messageType = 'video';
      text = text || '[Video]';
    } else if (messageElement.querySelector('[data-testid="sticker"]')) {
      messageType = 'sticker';
      text = text || '[Sticker]';
    } else if (messageElement.querySelector('[data-testid="msg-document"]')) {
      messageType = 'document';
      text = text || '[Document]';
    }

    return {
      sender: sender,
      text: text,
      timestamp: timestamp,
      messageType: messageType,
      isOutgoing: isOutgoing,
      element: messageElement
    };
  }

  // New method to derive chat title from incoming messages
  getChatTitleFromMessages(messages) {
    console.log('getChatTitleFromMessages called with', messages.length, 'messages');
    console.log('First 3 messages:', messages.slice(0, 3).map(msg => ({
      sender: msg.sender,
      isOutgoing: msg.isOutgoing,
      text: msg.text.substring(0, 50)
    })));
    
    const firstIncoming = messages.find(msg => !msg.isOutgoing);
    console.log('First incoming message:', firstIncoming ? {
      sender: firstIncoming.sender,
      isOutgoing: firstIncoming.isOutgoing,
      text: firstIncoming.text.substring(0, 50)
    } : 'None found');
    
    const result = firstIncoming ? firstIncoming.sender : 'Unknown Chat';
    console.log('Returning chat title:', result);
    return result;
  }

  // Scroll to load all messages
  async scrollToLoadAllMessages(callback) {
    this.isExtractingAll = true;
    const chatArea = document.querySelector('[data-testid="conversation-panel-messages"]') || 
                    document.querySelector('#main') ||
                    document.querySelector('.app-wrapper-web');

    if (!chatArea) {
      console.error('Could not find chat area');
      return;
    }

    let previousHeight = 0;
    let currentHeight = chatArea.scrollHeight;
    let attempts = 0;
    const maxAttempts = 100;

    while (currentHeight !== previousHeight && attempts < maxAttempts && this.isExtractingAll) {
      previousHeight = currentHeight;
      chatArea.scrollTop = 0;
      
      // Wait for messages to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      currentHeight = chatArea.scrollHeight;
      attempts++;
      
      // Update progress
      if (callback) {
        const messages = this.extractVisibleMessages();
        callback({
          type: 'progress',
          messagesFound: messages.length,
          attempts: attempts,
          maxAttempts: maxAttempts
        });
      }
    }

    // Final extraction
    const allMessages = this.extractVisibleMessages();
    
    if (callback) {
      const title = this.getChatTitleFromMessages(allMessages);
      callback({
        type: 'complete',
        messages: allMessages,
        chatTitle: title
      });
    }

    this.isExtractingAll = false;
    return allMessages;
  }

  // Stop extraction
  stopExtraction() {
    this.isExtractingAll = false;
  }

  // Export messages to JSON
  exportToJSON(messages, chatTitle) {
    const data = {
      chatTitle: chatTitle || this.getChatTitle(),
      extractedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-${chatTitle || 'chat'}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export messages to CSV
  exportToCSV(messages, chatTitle) {
    const headers = ['Timestamp', 'Sender', 'Message', 'Type', 'Direction'];
    const rows = messages.map(msg => [
      msg.timestamp,
      msg.sender,
      msg.text.replace(/"/g, '""'), // Escape quotes
      msg.messageType,
      msg.isOutgoing ? 'Outgoing' : 'Incoming'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-${chatTitle || 'chat'}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize parser
const whatsappParser = new WhatsAppParser();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'ping':
      sendResponse({ success: true, message: 'Content script active' });
      break;
      
    case 'extractVisible':
      const visibleMessages = whatsappParser.extractVisibleMessages();
      const chatTitle = whatsappParser.getChatTitleFromMessages(visibleMessages);
      sendResponse({
        success: true,
        messages: visibleMessages,
        chatTitle: chatTitle,
        count: visibleMessages.length
      });
      break;

    case 'extractAll':
      whatsappParser.scrollToLoadAllMessages((result) => {
        chrome.runtime.sendMessage({
          action: 'extractionProgress',
          data: result
        });
      });
      sendResponse({ success: true, message: 'Started extracting all messages' });
      break;

    case 'stopExtraction':
      whatsappParser.stopExtraction();
      sendResponse({ success: true, message: 'Extraction stopped' });
      break;

    case 'exportJSON':
      whatsappParser.exportToJSON(request.messages, request.chatTitle);
      sendResponse({ success: true, message: 'JSON export started' });
      break;

    case 'exportCSV':
      whatsappParser.exportToCSV(request.messages, request.chatTitle);
      sendResponse({ success: true, message: 'CSV export started' });
      break;

    case 'getChatInfo':
      sendResponse({
        success: true,
        chatTitle: whatsappParser.getChatTitle(),
        isWhatsApp: window.location.hostname === 'web.whatsapp.com'
      });
      break;

    default:
      sendResponse({ success: false, message: 'Unknown action' });
  }
  
  return true; // Keep the message channel open for async responses
});

// Notify popup when page loads
if (window.location.hostname === 'web.whatsapp.com') {
  chrome.runtime.sendMessage({
    action: 'pageLoaded',
    url: window.location.href
  });
} 