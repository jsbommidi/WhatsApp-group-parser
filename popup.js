// WhatsApp Message Parser - Popup Script
class PopupController {
  constructor() {
    this.currentMessages = [];
    this.currentChatTitle = '';
    this.isExtracting = false;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.checkWhatsAppStatus();
  }

  bindEvents() {
    // Extraction buttons
    document.getElementById('extractVisible').addEventListener('click', () => this.extractVisibleMessages());
    document.getElementById('extractAll').addEventListener('click', () => this.extractAllMessages());
    document.getElementById('stopExtraction').addEventListener('click', () => this.stopExtraction());

    // Export buttons
    document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
    document.getElementById('exportCSV').addEventListener('click', () => this.exportCSV());

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extractionProgress') {
        this.handleExtractionProgress(message.data);
      }
    });
  }

  async checkWhatsAppStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('web.whatsapp.com')) {
        this.showNotWhatsApp();
        return;
      }

      this.updateStatus('checking', 'Checking WhatsApp...');
      
      // Get chat info from content script
      const response = await this.sendMessageToContent({ action: 'getChatInfo' });
      
      if (response && response.success) {
        this.currentChatTitle = response.chatTitle;
        this.showMainContent();
        this.updateChatInfo(response.chatTitle);
        this.updateStatus('ready', 'Ready to extract messages');
      } else {
        this.updateStatus('error', 'Could not connect to WhatsApp');
      }
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
      this.updateStatus('error', 'Extension error occurred');
    }
  }

  async sendMessageToContent(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      console.error('Error sending message to content script:', error);
      return null;
    }
  }

  async extractVisibleMessages() {
    this.updateStatus('loading', 'Extracting visible messages...');
    this.showProgress(false);

    try {
      const response = await this.sendMessageToContent({ action: 'extractVisible' });
      
      if (response && response.success) {
        this.currentMessages = response.messages;
        this.currentChatTitle = response.chatTitle;
        this.showResults(response.messages);
        this.updateStatus('success', `Found ${response.count} messages`);
      } else {
        this.updateStatus('error', 'Failed to extract messages');
      }
    } catch (error) {
      console.error('Error extracting messages:', error);
      this.updateStatus('error', 'Extraction failed');
    }

    this.hideProgress();
  }

  async extractAllMessages() {
    this.isExtracting = true;
    this.updateStatus('loading', 'Starting full extraction...');
    this.showProgress(true);
    this.toggleExtractionButtons(true);

    try {
      const response = await this.sendMessageToContent({ action: 'extractAll' });
      
      if (response && response.success) {
        this.updateProgressText('Scrolling through chat history...');
      } else {
        this.updateStatus('error', 'Failed to start extraction');
        this.hideProgress();
        this.toggleExtractionButtons(false);
      }
    } catch (error) {
      console.error('Error starting extraction:', error);
      this.updateStatus('error', 'Extraction failed to start');
      this.hideProgress();
      this.toggleExtractionButtons(false);
    }
  }

  async stopExtraction() {
    this.isExtracting = false;
    this.updateStatus('stopping', 'Stopping extraction...');
    
    try {
      await this.sendMessageToContent({ action: 'stopExtraction' });
      this.updateStatus('ready', 'Extraction stopped');
    } catch (error) {
      console.error('Error stopping extraction:', error);
    }
    
    this.hideProgress();
    this.toggleExtractionButtons(false);
  }

  handleExtractionProgress(data) {
    if (data.type === 'progress') {
      const progress = Math.min((data.attempts / data.maxAttempts) * 100, 100);
      this.updateProgress(progress);
      this.updateProgressText(`Found ${data.messagesFound} messages (${data.attempts}/${data.maxAttempts} scrolls)`);
    } else if (data.type === 'complete') {
      this.currentMessages = data.messages;
      this.currentChatTitle = data.chatTitle;
      this.showResults(data.messages);
      this.updateStatus('success', `Extraction complete: ${data.messages.length} messages`);
      this.hideProgress();
      this.toggleExtractionButtons(false);
      this.isExtracting = false;
    }
  }

  async exportJSON() {
    try {
      await this.sendMessageToContent({
        action: 'exportJSON',
        messages: this.currentMessages,
        chatTitle: this.currentChatTitle
      });
      this.showTemporaryMessage('JSON export started');
    } catch (error) {
      console.error('Export failed:', error);
      this.showTemporaryMessage('Export failed', 'error');
    }
  }

  async exportCSV() {
    try {
      await this.sendMessageToContent({
        action: 'exportCSV',
        messages: this.currentMessages,
        chatTitle: this.currentChatTitle
      });
      this.showTemporaryMessage('CSV export started');
    } catch (error) {
      console.error('Export failed:', error);
      this.showTemporaryMessage('Export failed', 'error');
    }
  }

  updateStatus(type, text) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    statusText.textContent = text;
    
    // Remove existing status classes
    statusIndicator.className = 'status-indicator';
    
    // Add new status class
    switch (type) {
      case 'ready':
        statusIndicator.classList.add('status-ready');
        break;
      case 'loading':
        statusIndicator.classList.add('status-loading');
        break;
      case 'success':
        statusIndicator.classList.add('status-success');
        break;
      case 'error':
        statusIndicator.classList.add('status-error');
        break;
      case 'stopping':
        statusIndicator.classList.add('status-warning');
        break;
      default:
        statusIndicator.classList.add('status-checking');
    }
  }

  updateChatInfo(chatTitle) {
    const chatInfo = document.getElementById('chatInfo');
    const chatTitleElement = document.getElementById('chatTitle');
    
    chatTitleElement.textContent = chatTitle || 'Unknown Chat';
    chatInfo.style.display = 'block';
  }

  showMainContent() {
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('notWhatsApp').style.display = 'none';
  }

  showNotWhatsApp() {
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('notWhatsApp').style.display = 'block';
    this.updateStatus('error', 'Not on WhatsApp Web');
  }

  showProgress(showStop = false) {
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('stopExtraction').style.display = showStop ? 'block' : 'none';
  }

  hideProgress() {
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('stopExtraction').style.display = 'none';
  }

  updateProgress(percentage) {
    const progressFill = document.getElementById('progressFill');
    progressFill.style.width = `${percentage}%`;
  }

  updateProgressText(text) {
    document.getElementById('progressText').textContent = text;
  }

  toggleExtractionButtons(extracting) {
    const extractVisible = document.getElementById('extractVisible');
    const extractAll = document.getElementById('extractAll');
    
    extractVisible.disabled = extracting;
    extractAll.disabled = extracting;
  }

  showResults(messages) {
    const resultsSection = document.getElementById('resultsSection');
    const extractedCount = document.getElementById('extractedCount');
    const messagePreview = document.getElementById('messagePreview');
    const messageCount = document.getElementById('messageCount');

    extractedCount.textContent = `${messages.length} messages found`;
    messageCount.textContent = `${messages.length} messages`;

    // Show preview of first few messages
    messagePreview.innerHTML = '';
    const previewCount = Math.min(messages.length, 5);
    
    for (let i = 0; i < previewCount; i++) {
      const msg = messages[i];
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message-item';
      
      messageDiv.innerHTML = `
        <div class="message-sender">${this.escapeHtml(msg.sender)}</div>
        <div class="message-text">${this.escapeHtml(msg.text.substring(0, 100))}${msg.text.length > 100 ? '...' : ''}</div>
        <div class="message-meta">
          <span class="message-time">${this.escapeHtml(msg.timestamp)}</span>
          <span class="message-type">${msg.messageType}</span>
        </div>
      `;
      
      messagePreview.appendChild(messageDiv);
    }

    if (messages.length > previewCount) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'more-messages';
      moreDiv.textContent = `... and ${messages.length - previewCount} more messages`;
      messagePreview.appendChild(moreDiv);
    }

    resultsSection.style.display = 'block';
  }

  showTemporaryMessage(text, type = 'success') {
    const statusText = document.getElementById('statusText');
    const originalText = statusText.textContent;
    
    statusText.textContent = text;
    
    setTimeout(() => {
      statusText.textContent = originalText;
    }, 2000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
}); 