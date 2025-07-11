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
    this.currentFilters = {
      enabled: false,
      textFilter: '',
      textMode: 'simple',
      timeFilter: false,
      startDate: null,
      endDate: null
    };
    this.allMessages = [];
    this.filteredMessages = [];
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

    // Filter controls
    document.getElementById('enableFilters').addEventListener('change', (e) => this.toggleFilterOptions(e.target.checked));
    document.getElementById('enableTimeFilter').addEventListener('change', (e) => this.toggleTimeFilterOptions(e.target.checked));
    document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
    document.getElementById('clearFilters').addEventListener('click', () => this.clearFilters());
    
    // Quick time filter buttons
    document.querySelectorAll('.quick-time-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.setQuickTimeFilter(e.target.dataset.hours));
    });

    // Text mode change handler
    document.querySelectorAll('input[name="textMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.toggleFilterHelp(e.target.value));
    });

    // Export buttons
    document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
    document.getElementById('exportCSV').addEventListener('click', () => this.exportCSV());

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extractionProgress') {
        this.handleExtractionProgress(message.data);
      }
    });

    // Load saved settings
    this.loadAutoExtractSettings();
    this.loadFilterSettings();
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
        this.allMessages = response.messages;
        this.currentChatTitle = response.chatTitle;
        
        // Apply filters if enabled
        const messagesToShow = this.currentFilters.enabled ? 
          this.filterMessages(this.allMessages) : this.allMessages;
        
        this.currentMessages = messagesToShow;
        this.showResults(messagesToShow);
        
        if (this.currentFilters.enabled && messagesToShow.length !== this.allMessages.length) {
          this.showFilterStatus(messagesToShow.length);
          this.updateStatus('success', `Found ${response.count} messages, ${messagesToShow.length} match filters`);
        } else {
          this.updateStatus('success', `Found ${response.count} messages`);
        }
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
      this.allMessages = data.messages;
      this.currentChatTitle = data.chatTitle;
      
      // Apply filters if enabled
      const messagesToShow = this.currentFilters.enabled ? 
        this.filterMessages(this.allMessages) : this.allMessages;
      
      this.currentMessages = messagesToShow;
      this.showResults(messagesToShow);
      
      if (this.currentFilters.enabled && messagesToShow.length !== this.allMessages.length) {
        this.showFilterStatus(messagesToShow.length);
        this.updateStatus('success', `Extraction complete: ${data.messages.length} messages, ${messagesToShow.length} match filters`);
      } else {
        this.updateStatus('success', `Extraction complete: ${data.messages.length} messages`);
      }
      
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

  toggleFilterOptions(enabled) {
    const filterOptions = document.getElementById('filterOptions');
    filterOptions.style.display = enabled ? 'block' : 'none';
    this.currentFilters.enabled = enabled;
    
    if (!enabled) {
      this.clearFilters();
    }
  }

  toggleFilterHelp(mode) {
    const helpSimple = document.querySelector('.help-simple');
    const helpAdvanced = document.querySelector('.help-advanced');
    const textInput = document.getElementById('textFilter');
    
    if (mode === 'advanced') {
      helpSimple.style.display = 'none';
      helpAdvanced.style.display = 'block';
      textInput.placeholder = 'meeting AND project OR deadline';
    } else {
      helpSimple.style.display = 'block';
      helpAdvanced.style.display = 'none';
      textInput.placeholder = 'word1, word2, phrase';
    }
  }

  toggleTimeFilterOptions(enabled) {
    const timeFilterOptions = document.getElementById('timeFilterOptions');
    timeFilterOptions.style.display = enabled ? 'block' : 'none';
    this.currentFilters.timeFilter = enabled;
  }

  setQuickTimeFilter(hours) {
    const now = new Date();
    const startTime = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    
    // Update date and time inputs
    document.getElementById('endDate').value = now.toISOString().split('T')[0];
    document.getElementById('endTime').value = now.toTimeString().slice(0, 5);
    document.getElementById('startDate').value = startTime.toISOString().split('T')[0];
    document.getElementById('startTime').value = startTime.toTimeString().slice(0, 5);
    
    // Enable time filter
    document.getElementById('enableTimeFilter').checked = true;
    this.toggleTimeFilterOptions(true);
    
    // Update button states
    document.querySelectorAll('.quick-time-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');
  }

  applyFilters() {
    if (!this.currentFilters.enabled) {
      this.showTemporaryMessage('Enable filters first', 'error');
      return;
    }

    // Get filter values
    const textFilter = document.getElementById('textFilter').value.trim();
    const textMode = document.querySelector('input[name="textMode"]:checked').value;
    const timeFilterEnabled = document.getElementById('enableTimeFilter').checked;
    
    console.log('Applying filters:', { textFilter, textMode, timeFilterEnabled });
    
    let startDate = null;
    let endDate = null;
    
    if (timeFilterEnabled) {
      const startDateValue = document.getElementById('startDate').value;
      const startTimeValue = document.getElementById('startTime').value;
      const endDateValue = document.getElementById('endDate').value;
      const endTimeValue = document.getElementById('endTime').value;
      
      if (startDateValue) {
        startDate = new Date(`${startDateValue}T${startTimeValue || '00:00'}`);
      }
      if (endDateValue) {
        endDate = new Date(`${endDateValue}T${endTimeValue || '23:59'}`);
      }
    }

    // Update current filters
    this.currentFilters = {
      enabled: true,
      textFilter: textFilter,
      textMode: textMode,
      timeFilter: timeFilterEnabled,
      startDate: startDate,
      endDate: endDate
    };

    // Apply filters to current messages
    console.log('Filtering', this.allMessages.length, 'messages with filters:', this.currentFilters);
    this.filteredMessages = this.filterMessages(this.allMessages);
    console.log('Filtered results:', this.filteredMessages.length, 'messages');
    
    // Show filtered results
    this.showResults(this.filteredMessages);
    this.showFilterStatus(this.filteredMessages.length);
    
    // Save filter settings
    this.saveFilterSettings();
    
    this.showTemporaryMessage('Filters applied successfully');
  }

  clearFilters() {
    // Reset filter inputs
    document.getElementById('textFilter').value = '';
    document.querySelector('input[name="textMode"][value="simple"]').checked = true;
    this.toggleFilterHelp('simple');
    document.getElementById('enableTimeFilter').checked = false;
    document.getElementById('startDate').value = '';
    document.getElementById('startTime').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('endTime').value = '';
    
    // Reset UI
    this.toggleTimeFilterOptions(false);
    document.querySelectorAll('.quick-time-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Reset filters
    this.currentFilters = {
      enabled: document.getElementById('enableFilters').checked,
      textFilter: '',
      textMode: 'simple',
      timeFilter: false,
      startDate: null,
      endDate: null
    };
    
    // Show all messages if we have them
    if (this.allMessages.length > 0) {
      this.showResults(this.allMessages);
    }
    
    // Hide filter status
    document.getElementById('filterStatus').style.display = 'none';
    
    this.showTemporaryMessage('Filters cleared');
  }

  filterMessages(messages) {
    if (!this.currentFilters.enabled) {
      return messages;
    }

    let filtered = [...messages];

    // Apply text filter
    if (this.currentFilters.textFilter) {
      filtered = this.applyTextFilter(filtered, this.currentFilters.textFilter, this.currentFilters.textMode);
    }

    // Apply time filter
    if (this.currentFilters.timeFilter && (this.currentFilters.startDate || this.currentFilters.endDate)) {
      filtered = this.applyTimeFilter(filtered, this.currentFilters.startDate, this.currentFilters.endDate);
    }

    return filtered;
  }

  applyTextFilter(messages, textFilter, mode) {
    if (!textFilter.trim()) {
      return messages;
    }

    if (mode === 'simple') {
      return this.applySimpleTextFilter(messages, textFilter);
    } else {
      return this.applyAdvancedTextFilter(messages, textFilter);
    }
  }

  applySimpleTextFilter(messages, textFilter) {
    const searchTerms = textFilter.toLowerCase().split(',').map(term => term.trim()).filter(term => term);
    console.log('Simple text filter - search terms:', searchTerms);
    
    if (searchTerms.length === 0) {
      return messages;
    }

    const filtered = messages.filter(message => {
      if (!message || !message.text) {
        console.warn('Message missing text property:', message);
        return false;
      }
      const messageText = message.text.toLowerCase();
      const matches = searchTerms.some(term => messageText.includes(term));
      if (matches) {
        console.log('Message matches:', message.text.substring(0, 50));
      }
      return matches;
    });
    
    console.log('Simple filter result:', filtered.length, 'out of', messages.length);
    return filtered;
  }

  applyAdvancedTextFilter(messages, textFilter) {
    try {
      const query = this.parseLogicalQuery(textFilter);
      console.log('Advanced filter query:', query);
      
      const filtered = messages.filter(message => {
        if (!message || !message.text) {
          console.warn('Message missing text property:', message);
          return false;
        }
        const result = this.evaluateLogicalQuery(query, message.text.toLowerCase());
        if (result) {
          console.log('Advanced match:', message.text.substring(0, 50));
        }
        return result;
      });
      
      console.log('Advanced filter result:', filtered.length, 'out of', messages.length);
      return filtered;
    } catch (error) {
      console.warn('Error in advanced text filter, falling back to simple:', error);
      return this.applySimpleTextFilter(messages, textFilter);
    }
  }

  parseLogicalQuery(query) {
    // Clean and normalize the query
    let normalizedQuery = query.trim();
    
    // Handle quoted phrases first
    const phrases = [];
    normalizedQuery = normalizedQuery.replace(/"([^"]+)"/g, (match, phrase) => {
      phrases.push(phrase.toLowerCase());
      return `__PHRASE_${phrases.length - 1}__`;
    });
    
    // Normalize operators
    normalizedQuery = normalizedQuery
      .replace(/\s+AND\s+/gi, ' && ')
      .replace(/\s+OR\s+/gi, ' || ')
      .replace(/\s+NOT\s+/gi, ' ! ')
      .replace(/\s*\(\s*/g, ' ( ')
      .replace(/\s*\)\s*/g, ' ) ');
    
    // Tokenize
    const tokens = normalizedQuery.split(/\s+/).filter(token => token);
    
    return {
      tokens: tokens,
      phrases: phrases
    };
  }

  evaluateLogicalQuery(query, messageText) {
    const { tokens, phrases } = query;
    
    // Convert tokens to boolean expression
    let expression = tokens.map(token => {
      if (token === '&&' || token === '||' || token === '!' || token === '(' || token === ')') {
        return token;
      } else if (token.startsWith('__PHRASE_')) {
        const phraseIndex = parseInt(token.replace('__PHRASE_', '').replace('__', ''));
        const phrase = phrases[phraseIndex];
        return messageText.includes(phrase) ? 'true' : 'false';
      } else {
        return messageText.includes(token.toLowerCase()) ? 'true' : 'false';
      }
    }).join(' ');
    
    // Handle NOT operator
    expression = expression.replace(/!\s*true/g, 'false');
    expression = expression.replace(/!\s*false/g, 'true');
    
    try {
      // Safe evaluation of boolean expression
      return this.safeBooleanEval(expression);
    } catch (error) {
      console.warn('Error evaluating expression:', expression, error);
      return false;
    }
  }

  safeBooleanEval(expression) {
    // Only allow safe boolean operations - fix regex pattern
    const safeExpression = expression.replace(/[^truefals\s&|\(\)]/g, '');
    
    // Use eval for boolean expressions (safe since we sanitized input)
    try {
      return eval(safeExpression);
    } catch (error) {
      // If expression is malformed, return false
      console.warn('Error evaluating boolean expression:', safeExpression, error);
      return false;
    }
  }

  applyTimeFilter(messages, startDate, endDate) {
    return messages.filter(message => {
      // Try to parse the timestamp
      const messageTime = this.parseMessageTimestamp(message.timestamp);
      if (!messageTime) {
        return true; // Include messages with unparseable timestamps
      }

      if (startDate && messageTime < startDate) {
        return false;
      }
      if (endDate && messageTime > endDate) {
        return false;
      }
      return true;
    });
  }

  parseMessageTimestamp(timestamp) {
    if (!timestamp) return null;
    
    try {
      // Try different timestamp formats
      let date;
      
      // Format: "10:30 AM" or "22:30"
      if (timestamp.match(/^\d{1,2}:\d{2}(\s?(AM|PM))?$/i)) {
        const today = new Date();
        const timeStr = timestamp.replace(/\s/g, '');
        date = new Date(`${today.toDateString()} ${timeStr}`);
      }
      // Format: "12/31/2023, 10:30 AM"
      else if (timestamp.includes(',')) {
        date = new Date(timestamp);
      }
      // Format: "2023-12-31 10:30:00"
      else if (timestamp.includes('-') && timestamp.includes(':')) {
        date = new Date(timestamp);
      }
      // Format: ISO string
      else {
        date = new Date(timestamp);
      }
      
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      console.warn('Could not parse timestamp:', timestamp);
      return null;
    }
  }

  showFilterStatus(count) {
    const filterStatus = document.getElementById('filterStatus');
    const filteredCount = document.getElementById('filteredCount');
    
    filteredCount.textContent = `${count} messages match`;
    filterStatus.style.display = 'block';
  }

  async saveFilterSettings() {
    try {
      await chrome.storage.local.set({
        filterSettings: this.currentFilters
      });
    } catch (error) {
      console.error('Error saving filter settings:', error);
    }
  }

  async loadFilterSettings() {
    try {
      const result = await chrome.storage.local.get('filterSettings');
      if (result.filterSettings) {
        const settings = result.filterSettings;
        
        // Restore filter settings
        document.getElementById('enableFilters').checked = settings.enabled || false;
        this.toggleFilterOptions(settings.enabled || false);
        
        if (settings.textFilter) {
          document.getElementById('textFilter').value = settings.textFilter;
        }
        
        if (settings.textMode) {
          const modeElement = document.querySelector(`input[name="textMode"][value="${settings.textMode}"]`);
          if (modeElement) {
            modeElement.checked = true;
            this.toggleFilterHelp(settings.textMode);
          } else {
            // Fallback for old settings
            document.querySelector('input[name="textMode"][value="simple"]').checked = true;
            this.toggleFilterHelp('simple');
          }
        }
        
        document.getElementById('enableTimeFilter').checked = settings.timeFilter || false;
        this.toggleTimeFilterOptions(settings.timeFilter || false);
        
        if (settings.startDate) {
          const startDate = new Date(settings.startDate);
          document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
          document.getElementById('startTime').value = startDate.toTimeString().slice(0, 5);
        }
        
        if (settings.endDate) {
          const endDate = new Date(settings.endDate);
          document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
          document.getElementById('endTime').value = endDate.toTimeString().slice(0, 5);
        }
        
        this.currentFilters = settings;
      }
    } catch (error) {
      console.error('Error loading filter settings:', error);
    }
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
        this.allMessages = response.messages;
        this.currentChatTitle = response.chatTitle;
        
        // Apply filters if enabled
        const messagesToShow = this.currentFilters.enabled ? 
          this.filterMessages(this.allMessages) : this.allMessages;
        
        this.currentMessages = messagesToShow;
        
        // Update auto-extract status
        document.getElementById('autoExtractCount').textContent = 
          `${this.autoExtractCount} extractions completed`;
        
        // Show results if we have messages
        if (messagesToShow.length > 0) {
          this.showResults(messagesToShow);
          if (this.currentFilters.enabled && messagesToShow.length !== this.allMessages.length) {
            this.showFilterStatus(messagesToShow.length);
          }
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