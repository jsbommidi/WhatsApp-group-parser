// WhatsApp Message Parser - Background Script (Service Worker)
class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('WhatsApp Message Parser installed');
      
      if (details.reason === 'install') {
        // Open welcome page or instructions
        chrome.tabs.create({
          url: 'https://web.whatsapp.com'
        });
      }
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    // Handle tab updates to inject content script if needed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('web.whatsapp.com')) {
        // Ensure content script is injected
        this.ensureContentScriptInjected(tabId);
      }
    });

    // Handle browser action click (when user clicks the extension icon)
    chrome.action.onClicked.addListener((tab) => {
      if (!tab.url.includes('web.whatsapp.com')) {
        // Redirect to WhatsApp Web if not already there
        chrome.tabs.update(tab.id, {
          url: 'https://web.whatsapp.com'
        });
      }
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'pageLoaded':
          console.log('WhatsApp page loaded:', message.url);
          // Could store tab info or update badge
          this.updateBadge(sender.tab.id, 'ready');
          break;

        case 'extractionProgress':
          // Forward progress updates to popup if it's open
          this.forwardToPopup(message);
          break;

        case 'extractionComplete':
          console.log('Extraction completed');
          this.updateBadge(sender.tab.id, 'complete');
          break;

        case 'exportStarted':
          console.log('Export started:', message.format);
          // Could show notification or update UI
          break;

        case 'error':
          console.error('Extension error:', message.error);
          this.updateBadge(sender.tab.id, 'error');
          break;

        default:
          console.log('Unknown message action:', message.action);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  async ensureContentScriptInjected(tabId) {
    try {
      // Check if content script is already injected by sending a ping
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.success) {
        return; // Content script is already active
      }
    } catch (error) {
      // Content script not injected, inject it now
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        console.log('Content script injected into tab:', tabId);
      } catch (injectionError) {
        console.error('Failed to inject content script:', injectionError);
      }
    }
  }

  updateBadge(tabId, status) {
    const badges = {
      ready: { text: '✓', color: '#25D366' },
      complete: { text: '!', color: '#007AFF' },
      error: { text: '✗', color: '#FF3B30' },
      loading: { text: '...', color: '#FF9500' }
    };

    const badge = badges[status] || badges.ready;
    
    chrome.action.setBadgeText({
      text: badge.text,
      tabId: tabId
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: badge.color,
      tabId: tabId
    });
  }

  async forwardToPopup(message) {
    // Try to send message to popup (if it's open)
    try {
      const views = chrome.extension.getViews({ type: 'popup' });
      if (views.length > 0) {
        // Popup is open, forward the message
        views[0].postMessage(message, '*');
      }
    } catch (error) {
      // Popup is not open, ignore
    }
  }

  // Utility method to get active WhatsApp tabs
  async getWhatsAppTabs() {
    try {
      const tabs = await chrome.tabs.query({
        url: ['https://web.whatsapp.com/*']
      });
      return tabs;
    } catch (error) {
      console.error('Error getting WhatsApp tabs:', error);
      return [];
    }
  }

  // Method to broadcast message to all WhatsApp tabs
  async broadcastToWhatsAppTabs(message) {
    try {
      const tabs = await this.getWhatsAppTabs();
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // Tab might not have content script, ignore
        }
      }
    } catch (error) {
      console.error('Error broadcasting to WhatsApp tabs:', error);
    }
  }
}

// Initialize the background service
const backgroundService = new BackgroundService();

// Handle service worker lifecycle
self.addEventListener('activate', (event) => {
  console.log('WhatsApp Message Parser service worker activated');
});

// Handle errors
self.addEventListener('error', (event) => {
  console.error('Service worker error:', event.error);
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in service worker:', event.reason);
});

// Expose service for debugging
if (typeof globalThis !== 'undefined') {
  globalThis.whatsappParserBackground = backgroundService;
} 