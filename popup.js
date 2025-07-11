// WhatsApp Message Parser - Popup Script
class PopupController {
  constructor() {
    this.currentMessages = [];
    this.currentChatTitle = '';
    this.isExtracting = false;
    this.autoExtractInterval = null;
    this.autoExtractActive = false;
    this.autoExtractCount = 0;
    this.nextExtractTime = null;
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

    // Auto-extract buttons
    document.getElementById('startAutoExtract').addEventListener('click', () => this.startAutoExtract());
    document.getElementById('stopAutoExtract').addEventListener('click', () => this.stopAutoExtract());

    // Export buttons
    document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
    document.getElementById('exportCSV').addEventListener('click', () => this.exportCSV());

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extractionProgress') {
        this.handleExtractionProgress(message.data);
      }
    });

    // Load saved auto-extract settings
    this.loadAutoExtractSettings();
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

  async startAutoExtract() {
    if (this.autoExtractActive) {
      return;
    }

    const frequency = parseInt(document.getElementById('extractFrequency').value);
    const unit = document.getElementById('frequencyUnit').value;

    if (!frequency || frequency < 1) {
      this.showTemporaryMessage('Please enter a valid frequency', 'error');
      return;
    }

    // Convert to milliseconds
    let intervalMs;
    switch (unit) {
      case 'seconds':
        intervalMs = frequency * 1000;
        break;
      case 'minutes':
        intervalMs = frequency * 60 * 1000;
        break;
      case 'hours':
        intervalMs = frequency * 60 * 60 * 1000;
        break;
      default:
        intervalMs = frequency * 60 * 1000; // Default to minutes
    }

    this.autoExtractActive = true;
    this.autoExtractCount = 0;
    
    // Save settings
    await this.saveAutoExtractSettings(frequency, unit);

    // Show auto-extract status
    document.getElementById('autoExtractStatus').style.display = 'block';
    document.getElementById('startAutoExtract').style.display = 'none';
    document.getElementById('stopAutoExtract').style.display = 'block';

    // Initial extraction
    this.performAutoExtraction();

    // Set up interval
    this.autoExtractInterval = setInterval(() => {
      this.performAutoExtraction();
    }, intervalMs);

    // Update next extraction time
    this.updateNextExtractionTime(intervalMs);
    
    this.updateStatus('success', `Auto-extract started (every ${frequency} ${unit})`);
  }

  async stopAutoExtract() {
    if (!this.autoExtractActive) {
      return;
    }

    this.autoExtractActive = false;
    
    if (this.autoExtractInterval) {
      clearInterval(this.autoExtractInterval);
      this.autoExtractInterval = null;
    }

    // Hide auto-extract status
    document.getElementById('autoExtractStatus').style.display = 'none';
    document.getElementById('startAutoExtract').style.display = 'block';
    document.getElementById('stopAutoExtract').style.display = 'none';

    this.updateStatus('ready', 'Auto-extract stopped');
    
    // Clear saved settings
    await this.clearAutoExtractSettings();
  }

  async performAutoExtraction() {
    try {
      const response = await this.sendMessageToContent({ action: 'extractVisible' });
      
      if (response && response.success) {
        this.autoExtractCount++;
        this.currentMessages = response.messages;
        this.currentChatTitle = response.chatTitle;
        
        // Update auto-extract status
        document.getElementById('autoExtractCount').textContent = 
          `${this.autoExtractCount} extractions completed`;
        
        // Show results if we have messages
        if (response.messages.length > 0) {
          this.showResults(response.messages);
        }

        // Log to background for potential storage/export
        chrome.runtime.sendMessage({
          action: 'autoExtractionComplete',
          data: {
            timestamp: new Date().toISOString(),
            messageCount: response.messages.length,
            chatTitle: response.chatTitle
          }
        });
      }
    } catch (error) {
      console.error('Auto-extraction error:', error);
    }
  }

  updateNextExtractionTime(intervalMs) {
    if (!this.autoExtractActive) return;

    const now = new Date();
    this.nextExtractTime = new Date(now.getTime() + intervalMs);
    
    const timeString = this.nextExtractTime.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    document.getElementById('nextExtractTime').textContent = `Next: ${timeString}`;

    // Update the time every second
    setTimeout(() => {
      if (this.autoExtractActive) {
        const remaining = this.nextExtractTime.getTime() - new Date().getTime();
        if (remaining > 0) {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          document.getElementById('nextExtractTime').textContent = 
            `Next: ${minutes}:${seconds.toString().padStart(2, '0')}`;
          
          setTimeout(() => this.updateNextExtractionTime(0), 1000);
        }
      }
    }, 1000);
  }

  async saveAutoExtractSettings(frequency, unit) {
    try {
      await chrome.storage.local.set({
        autoExtractSettings: {
          frequency: frequency,
          unit: unit,
          active: true
        }
      });
    } catch (error) {
      console.error('Error saving auto-extract settings:', error);
    }
  }

  async loadAutoExtractSettings() {
    try {
      const result = await chrome.storage.local.get('autoExtractSettings');
      if (result.autoExtractSettings) {
        const settings = result.autoExtractSettings;
        document.getElementById('extractFrequency').value = settings.frequency || 5;
        document.getElementById('frequencyUnit').value = settings.unit || 'minutes';
        
        // Don't auto-start, just restore the settings
      }
    } catch (error) {
      console.error('Error loading auto-extract settings:', error);
    }
  }

  async clearAutoExtractSettings() {
    try {
      await chrome.storage.local.remove('autoExtractSettings');
    } catch (error) {
      console.error('Error clearing auto-extract settings:', error);
    }
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