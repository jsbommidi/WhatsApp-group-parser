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
    // Filters should always start disabled
    this.currentFilters = {
      enabled: false,
      textFilter: '',
      numberFilter: '',
      textMode: 'simple',
      timeFilter: false,
      startDate: null,
      endDate: null
    };
    this.allMessages = [];
    this.filteredMessages = [];
    
    // Multi-chat collection
    this.multiChatMode = false;
    this.multiChatData = {
      chats: new Map(), // chatTitle -> {messages: [], extractedAt: timestamp, messageCount: number}
      totalMessages: 0,
      totalChats: 0
    };
    
    // Auto-extract chat list
    this.autoExtractChats = new Set(); // Set of chat titles to auto-extract
    
    // Track if actions are user-initiated
    this.isUserAction = false;
    
    this.init();
  }

  async init() {
    // Load saved settings first before binding events
    await this.loadMultiChatData();
    await this.loadAutoExtractSettings();
    await this.loadAutoExtractChats();
    // Note: Filter settings are NOT loaded - filters always start disabled
    await this.clearAnyExistingFilterSettings();
    this.initializeFilterDefaults();
    this.bindEvents();
    await this.checkWhatsAppStatus();
  }

  bindEvents() {
    // Extraction buttons
    document.getElementById('extractVisible').addEventListener('click', () => this.extractVisibleMessages());
    document.getElementById('extractAll').addEventListener('click', () => this.extractAllMessages());
    document.getElementById('stopExtraction').addEventListener('click', () => this.stopExtraction());

    // Multi-chat controls - with error checking
    try {
      const multiChatMode = document.getElementById('multiChatMode');
      const clearMultiChat = document.getElementById('clearMultiChat');
      const viewMultiChat = document.getElementById('viewMultiChat');
      const exportMultiJSON = document.getElementById('exportMultiJSON');
      const exportMultiCSV = document.getElementById('exportMultiCSV');
      
      if (multiChatMode) {
        multiChatMode.addEventListener('change', (e) => {
          this.isUserAction = true;
          this.toggleMultiChatMode(e.target.checked);
          this.isUserAction = false;
        });
        console.log('Multi-chat mode event listener added');
      } else {
        console.error('multiChatMode element not found');
      }
      
      if (clearMultiChat) {
        clearMultiChat.addEventListener('click', () => this.clearMultiChatCollection());
      } else {
        console.error('clearMultiChat element not found');
      }
      
      if (viewMultiChat) {
        viewMultiChat.addEventListener('click', () => this.showMultiChatResults());
      } else {
        console.error('viewMultiChat element not found');
      }
      
      if (exportMultiJSON) {
        exportMultiJSON.addEventListener('click', () => this.exportMultiChatJSON());
      } else {
        console.error('exportMultiJSON element not found');
      }
      
      if (exportMultiCSV) {
        exportMultiCSV.addEventListener('click', () => this.exportMultiChatCSV());
      } else {
        console.error('exportMultiCSV element not found');
      }
    } catch (error) {
      console.error('Error binding multi-chat events:', error);
    }

    // Auto-extract buttons
    document.getElementById('startAutoExtract').addEventListener('click', () => this.startAutoExtract());
    document.getElementById('stopAutoExtract').addEventListener('click', () => this.stopAutoExtract());
    
    // Multi-chat auto-extract controls
    try {
      const addCurrentChat = document.getElementById('addCurrentChat');
      if (addCurrentChat) {
        addCurrentChat.addEventListener('click', () => this.addCurrentChatToAutoExtract());
      } else {
        console.error('addCurrentChat element not found');
      }
    } catch (error) {
      console.error('Error binding auto-extract chat events:', error);
    }

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

    // Settings are now loaded in init() before bindEvents() is called
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
        this.updateCurrentChatDisplay(response.chatTitle);
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
        
        // If multi-chat mode is enabled, add to collection
        console.log('Multi-chat mode status:', this.multiChatMode);
        if (this.multiChatMode) {
          console.log('Adding to multi-chat collection:', response.chatTitle, response.messages.length);
          this.addToMultiChatCollection(response.chatTitle, response.messages);
        }
        
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
        
        // Update multi-chat display if in multi-chat mode
        if (this.multiChatMode) {
          this.updateMultiChatDisplay();
          this.showTemporaryMessage(`Added "${response.chatTitle}" to collection`);
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
      
      // If multi-chat mode is enabled, add to collection
      console.log('Extract All Complete - Multi-chat mode status:', this.multiChatMode);
      if (this.multiChatMode) {
        console.log('Adding extract all results to multi-chat collection:', data.chatTitle, data.messages.length);
        this.addToMultiChatCollection(data.chatTitle, data.messages);
      }
      
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
      
      // Update multi-chat display if in multi-chat mode
      if (this.multiChatMode) {
        this.updateMultiChatDisplay();
        this.showTemporaryMessage(`Added "${data.chatTitle}" to collection (${data.messages.length} messages)`);
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
      
      // Enhanced text display for contact messages
      let displayText = msg.text;
      if (msg.messageType === 'contact' && msg.contactInfo) {
        displayText = `📞 ${msg.contactInfo.name || 'Contact'}${msg.contactInfo.phone ? ` (${msg.contactInfo.phone})` : ''}`;
      }
      
      messageDiv.innerHTML = `
        <div class="message-sender">${this.escapeHtml(msg.sender)}</div>
        <div class="message-text">${this.escapeHtml(displayText.substring(0, 100))}${displayText.length > 100 ? '...' : ''}</div>
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
    const numberFilterGroup = document.getElementById('numberFilterGroup');
    
    if (mode === 'advanced') {
      helpSimple.style.display = 'none';
      helpAdvanced.style.display = 'block';
      numberFilterGroup.style.display = 'block';
      textInput.placeholder = 'meeting AND project OR deadline';
    } else {
      helpSimple.style.display = 'block';
      helpAdvanced.style.display = 'none';
      numberFilterGroup.style.display = 'none';
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
    const numberFilter = document.getElementById('numberFilter').value.trim();
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
      numberFilter: numberFilter,
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
    
    // Note: Filter settings are NOT saved - they reset each session
    
    this.showTemporaryMessage('Filters applied successfully');
  }

  clearFilters() {
    // Reset filter inputs
    document.getElementById('textFilter').value = '';
    document.getElementById('numberFilter').value = '';
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
      numberFilter: '',
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
    // Combine text filter with number filter if in advanced mode
    let combinedFilter = textFilter;
    if (mode === 'advanced' && this.currentFilters.numberFilter) {
      if (combinedFilter.trim()) {
        combinedFilter = `(${combinedFilter}) AND ${this.currentFilters.numberFilter}`;
      } else {
        combinedFilter = this.currentFilters.numberFilter;
      }
    }

    if (!combinedFilter.trim()) {
      return messages;
    }

    if (mode === 'simple') {
      return this.applySimpleTextFilter(messages, combinedFilter);
    } else {
      return this.applyAdvancedTextFilter(messages, combinedFilter);
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
      const parsed = this.parseAdvancedQuery(textFilter);
      
      if (!parsed.tokens || parsed.tokens.length === 0) {
        return this.applySimpleTextFilter(messages, textFilter);
      }
      
      const filtered = messages.filter(message => {
        if (!message || !message.text) {
          return false;
        }
        
        const messageText = message.text.toLowerCase();
        return this.evaluateAdvancedQuery(parsed, messageText);
      });
      
      return filtered;
    } catch (error) {
      console.warn('Error in advanced text filter, falling back to simple:', error);
      return this.applySimpleTextFilter(messages, textFilter);
    }
  }

  parseAdvancedQuery(query) {
    // Clean and normalize the query
    let normalizedQuery = query.trim().toLowerCase();
    
    // Handle quoted phrases first
    const phrases = [];
    normalizedQuery = normalizedQuery.replace(/"([^"]+)"/g, (match, phrase) => {
      phrases.push(phrase);
      return `PHRASE_${phrases.length - 1}`;
    });
    
    // Normalize operators and add spaces around them
    normalizedQuery = normalizedQuery
      .replace(/\s+and\s+/gi, ' AND ')
      .replace(/\s+or\s+/gi, ' OR ')
      .replace(/\s+not\s+/gi, ' NOT ')
      .replace(/\(/g, ' ( ')
      .replace(/\)/g, ' ) ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Split into tokens
    const tokens = normalizedQuery.split(' ').filter(token => token);
    
    return {
      tokens: tokens,
      phrases: phrases
    };
  }

  evaluateAdvancedQuery(parsed, messageText) {
    const { tokens, phrases } = parsed;
    
    // Convert to postfix notation for easier evaluation
    const postfix = this.infixToPostfix(tokens);
    
    // Evaluate postfix expression
    return this.evaluatePostfix(postfix, phrases, messageText);
  }

  infixToPostfix(tokens) {
    const precedence = { 'NOT': 3, 'AND': 2, 'OR': 1 };
    const rightAssociative = new Set(['NOT']);
    const output = [];
    const operators = [];
    
    for (const token of tokens) {
      if (token === '(') {
        operators.push(token);
      } else if (token === ')') {
        while (operators.length > 0 && operators[operators.length - 1] !== '(') {
          output.push(operators.pop());
        }
        operators.pop(); // Remove the '('
      } else if (['AND', 'OR', 'NOT'].includes(token)) {
        while (
          operators.length > 0 &&
          operators[operators.length - 1] !== '(' &&
          (
            precedence[operators[operators.length - 1]] > precedence[token] ||
            (precedence[operators[operators.length - 1]] === precedence[token] && !rightAssociative.has(token))
          )
        ) {
          output.push(operators.pop());
        }
        operators.push(token);
      } else {
        // Operand (word or phrase)
        output.push(token);
      }
    }
    
    while (operators.length > 0) {
      output.push(operators.pop());
    }
    
    return output;
  }

  evaluatePostfix(postfix, phrases, messageText) {
    const stack = [];
    
    for (const token of postfix) {
      if (token === 'AND') {
        if (stack.length < 2) return false;
        const b = stack.pop();
        const a = stack.pop();
        stack.push(a && b);
      } else if (token === 'OR') {
        if (stack.length < 2) return false;
        const b = stack.pop();
        const a = stack.pop();
        stack.push(a || b);
      } else if (token === 'NOT') {
        if (stack.length < 1) return false;
        const a = stack.pop();
        stack.push(!a);
      } else {
        // Operand - check if it matches the message
        let matches = false;
        if (token.startsWith('PHRASE_')) {
          const phraseIndex = parseInt(token.replace('PHRASE_', ''));
          if (phraseIndex >= 0 && phraseIndex < phrases.length) {
            matches = messageText.includes(phrases[phraseIndex]);
          }
        } else {
          matches = messageText.includes(token);
        }
        stack.push(matches);
      }
    }
    
    return stack.length === 1 ? stack[0] : false;
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

  // Initialize filter UI to default disabled state
  initializeFilterDefaults() {
    // Ensure main filter checkbox is unchecked
    document.getElementById('enableFilters').checked = false;
    
    // Ensure filter options are hidden
    this.toggleFilterOptions(false);
    
    // Reset all filter inputs to defaults
    document.getElementById('textFilter').value = '';
    document.getElementById('numberFilter').value = '';
    
    // Set simple mode as default
    document.querySelector('input[name="textMode"][value="simple"]').checked = true;
    this.toggleFilterHelp('simple');
    
    // Ensure time filter is disabled
    document.getElementById('enableTimeFilter').checked = false;
    this.toggleTimeFilterOptions(false);
    
    // Clear all time inputs
    document.getElementById('startDate').value = '';
    document.getElementById('startTime').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('endTime').value = '';
    
    // Remove active states from quick time buttons
    document.querySelectorAll('.quick-time-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Hide filter status
    document.getElementById('filterStatus').style.display = 'none';
  }

  // Clear any existing filter settings from storage
  async clearAnyExistingFilterSettings() {
    try {
      await chrome.storage.local.remove('filterSettings');
    } catch (error) {
      console.error('Error clearing filter settings:', error);
    }
  }

  // Filter settings are intentionally not saved/loaded
  // Filters should always start disabled for each session

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

    // Hide multi-chat auto-extract panel when auto-extract is active
    const multiChatAutoExtract = document.getElementById('multiChatAutoExtract');
    if (multiChatAutoExtract) {
      multiChatAutoExtract.style.display = 'none';
    }

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

    // Show multi-chat auto-extract panel if multi-chat mode is enabled
    const multiChatAutoExtract = document.getElementById('multiChatAutoExtract');
    if (multiChatAutoExtract && this.multiChatMode) {
      multiChatAutoExtract.style.display = 'block';
      this.updateCurrentChatDisplay(this.currentChatTitle);
      this.updateAutoExtractChatList();
    }

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
        
        // If multi-chat mode is enabled, add to collection
        console.log('Auto-extract - Multi-chat mode status:', this.multiChatMode);
        if (this.multiChatMode) {
          console.log('Adding auto-extracted messages to multi-chat collection:', response.chatTitle, response.messages.length);
          this.addToMultiChatCollection(response.chatTitle, response.messages);
        }
        
        // Apply filters if enabled
        const messagesToShow = this.currentFilters.enabled ? 
          this.filterMessages(this.allMessages) : this.allMessages;
        
        this.currentMessages = messagesToShow;
        
        // Update auto-extract status
        let statusText = `${this.autoExtractCount} extractions completed`;
        if (this.multiChatMode) {
          statusText += ` (${this.multiChatData.totalChats} chats collected)`;
        }
        document.getElementById('autoExtractCount').textContent = statusText;
        
        // Show results if we have messages
        if (messagesToShow.length > 0) {
          this.showResults(messagesToShow);
          if (this.currentFilters.enabled && messagesToShow.length !== this.allMessages.length) {
            this.showFilterStatus(messagesToShow.length);
          }
        }

        // Update multi-chat display if in multi-chat mode
        if (this.multiChatMode) {
          this.updateMultiChatDisplay();
        }

        // Log to background for potential storage/export
        chrome.runtime.sendMessage({
          action: 'autoExtractionComplete',
          data: {
            timestamp: new Date().toISOString(),
            messageCount: response.messages.length,
            chatTitle: response.chatTitle,
            multiChatMode: this.multiChatMode,
            totalChatsCollected: this.multiChatData.totalChats
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

  // Multi-Chat Collection Methods
  toggleMultiChatMode(enabled) {
    console.log('toggleMultiChatMode called with enabled:', enabled);
    this.multiChatMode = enabled;
    
    // Save immediately when mode changes
    this.saveMultiChatDataWithRetry();
    
    const multiChatStatus = document.getElementById('multiChatStatus');
    const multiChatAutoExtract = document.getElementById('multiChatAutoExtract');
    
    if (!multiChatStatus) {
      console.error('multiChatStatus element not found');
      return;
    }
    
    if (enabled) {
      multiChatStatus.style.display = 'block';
      this.updateMultiChatDisplay();
      
      // Show multi-chat auto-extract panel if auto-extract is not active
      if (multiChatAutoExtract && !this.autoExtractActive) {
        multiChatAutoExtract.style.display = 'block';
        this.updateCurrentChatDisplay(this.currentChatTitle);
        this.updateAutoExtractChatList();
      }
      
      // Only show message if this is a user action, not during loading
      const checkbox = document.getElementById('multiChatMode');
      if (checkbox && checkbox.checked === enabled && this.isUserAction) {
        this.showTemporaryMessage('Multi-chat mode enabled. Switch between chats and extract messages.');
      }
      console.log('Multi-chat mode enabled');
    } else {
      multiChatStatus.style.display = 'none';
      
      // Hide multi-chat auto-extract panel
      if (multiChatAutoExtract) {
        multiChatAutoExtract.style.display = 'none';
      }
      
      // Only show message if this is a user action, not during loading
      const checkbox = document.getElementById('multiChatMode');
      if (checkbox && checkbox.checked === enabled && this.isUserAction) {
        this.showTemporaryMessage('Multi-chat mode disabled.');
      }
      console.log('Multi-chat mode disabled');
    }
  }

  addToMultiChatCollection(chatTitle, messages) {
    console.log('addToMultiChatCollection called:', chatTitle, messages ? messages.length : 'no messages');
    
    // Enhanced validation
    if (!chatTitle || typeof chatTitle !== 'string' || chatTitle.trim() === '') {
      console.error('Invalid chat title:', chatTitle);
      this.showTemporaryMessage('Cannot add chat: Invalid chat title', 'error');
      return;
    }
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error('Invalid messages data:', { messages: !!messages, isArray: Array.isArray(messages), length: messages?.length });
      this.showTemporaryMessage('Cannot add chat: No messages found', 'error');
      return;
    }
    
    // Clean and validate chat title
    const cleanChatTitle = chatTitle.trim();
    if (cleanChatTitle.length > 40) {
      console.warn('Chat title too long, truncating:', cleanChatTitle.length);
      chatTitle = cleanChatTitle.substring(0, 40) + ' and more';
    } else {
      chatTitle = cleanChatTitle;
    }
    
    // Validate messages structure
    const validMessages = messages.filter(msg => 
      msg && typeof msg === 'object' && 
      msg.sender && msg.text && msg.timestamp
    );
    
    if (validMessages.length === 0) {
      console.error('No valid messages found');
      this.showTemporaryMessage('Cannot add chat: No valid messages', 'error');
      return;
    }
    
    if (validMessages.length !== messages.length) {
      console.warn(`Filtered out ${messages.length - validMessages.length} invalid messages`);
    }
    
    try {
      // Add or update chat in collection
      this.multiChatData.chats.set(chatTitle, {
        messages: validMessages,
        extractedAt: new Date().toISOString(),
        messageCount: validMessages.length,
        originalMessageCount: messages.length
      });
      
      // Update totals
      this.multiChatData.totalChats = this.multiChatData.chats.size;
      this.multiChatData.totalMessages = Array.from(this.multiChatData.chats.values())
        .reduce((total, chat) => total + chat.messageCount, 0);
      
      console.log('Chat added to collection. New totals:', {
        totalChats: this.multiChatData.totalChats,
        totalMessages: this.multiChatData.totalMessages,
        chatTitle: chatTitle,
        validMessages: validMessages.length
      });
      
      // Save with retry mechanism
      this.saveMultiChatDataWithRetry();
      
    } catch (error) {
      console.error('Error adding chat to collection:', error);
      this.showTemporaryMessage('Failed to add chat to collection', 'error');
    }
  }

  updateMultiChatDisplay() {
    console.log('updateMultiChatDisplay called');
    const multiChatCount = document.getElementById('multiChatCount');
    const multiChatMessages = document.getElementById('multiChatMessages');
    
    if (!multiChatCount || !multiChatMessages) {
      console.error('Multi-chat display elements not found:', {
        multiChatCount: !!multiChatCount,
        multiChatMessages: !!multiChatMessages
      });
      return;
    }
    
    multiChatCount.textContent = `${this.multiChatData.totalChats} chats collected`;
    multiChatMessages.textContent = `${this.multiChatData.totalMessages} total messages`;
    console.log('Multi-chat display updated:', this.multiChatData);
  }

  showMultiChatResults() {
    const multiChatResults = document.getElementById('multiChatResults');
    const resultsSection = document.getElementById('resultsSection');
    const collectedChats = document.getElementById('collectedChats');
    const multiChatTotal = document.getElementById('multiChatTotal');
    
    // Hide single chat results, show multi-chat results
    resultsSection.style.display = 'none';
    multiChatResults.style.display = 'block';
    
    // Update totals
    multiChatTotal.textContent = `${this.multiChatData.totalChats} chats, ${this.multiChatData.totalMessages} messages`;
    
    // Clear and populate collected chats
    collectedChats.innerHTML = '';
    
    if (this.multiChatData.chats.size === 0) {
      collectedChats.innerHTML = '<div style="text-align: center; color: #6b7280; font-style: italic; padding: 20px;">No chats collected yet. Switch to different chats and extract messages.</div>';
      return;
    }
    
    Array.from(this.multiChatData.chats.entries()).forEach(([chatTitle, chatData]) => {
      const chatItem = document.createElement('div');
      chatItem.className = 'collected-chat-item';
      
      const extractedDate = new Date(chatData.extractedAt);
      const timeAgo = this.getTimeAgo(extractedDate);
      
      chatItem.innerHTML = `
        <div class="collected-chat-title">${this.escapeHtml(chatTitle)}</div>
        <div class="collected-chat-meta">
          <span>Extracted ${timeAgo}</span>
          <span class="collected-chat-count">${chatData.messageCount} messages</span>
        </div>
        <div class="collected-chat-actions">
          <button onclick="popupController.removeFromCollection('${this.escapeHtml(chatTitle)}')">Remove</button>
          <button onclick="popupController.previewChatMessages('${this.escapeHtml(chatTitle)}')">Preview</button>
        </div>
      `;
      
      collectedChats.appendChild(chatItem);
    });
  }

  removeFromCollection(chatTitle) {
    this.multiChatData.chats.delete(chatTitle);
    
    // Update totals
    this.multiChatData.totalChats = this.multiChatData.chats.size;
    this.multiChatData.totalMessages = Array.from(this.multiChatData.chats.values())
      .reduce((total, chat) => total + chat.messageCount, 0);
    
    this.updateMultiChatDisplay();
    this.showMultiChatResults();
    this.saveMultiChatDataWithRetry();
    this.showTemporaryMessage(`Removed "${chatTitle}" from collection`);
  }

  previewChatMessages(chatTitle) {
    const chatData = this.multiChatData.chats.get(chatTitle);
    if (!chatData) return;
    
    // Show single chat results with this chat's data
    this.currentMessages = chatData.messages;
    this.currentChatTitle = chatTitle;
    this.showResults(chatData.messages);
    
    document.getElementById('multiChatResults').style.display = 'none';
    this.showTemporaryMessage(`Previewing messages from "${chatTitle}"`);
  }

  clearMultiChatCollection() {
    if (this.multiChatData.totalChats === 0) {
      this.showTemporaryMessage('No chats to clear', 'error');
      return;
    }
    
    this.multiChatData.chats.clear();
    this.multiChatData.totalChats = 0;
    this.multiChatData.totalMessages = 0;
    
    this.updateMultiChatDisplay();
    this.saveMultiChatDataWithRetry();
    
    // Hide multi-chat results
    document.getElementById('multiChatResults').style.display = 'none';
    
    this.showTemporaryMessage('Multi-chat collection cleared');
  }

  async exportMultiChatJSON() {
    if (this.multiChatData.totalChats === 0) {
      this.showTemporaryMessage('No chats to export', 'error');
      return;
    }
    
    const exportData = {
      exportType: 'multi-chat',
      exportedAt: new Date().toISOString(),
      totalChats: this.multiChatData.totalChats,
      totalMessages: this.multiChatData.totalMessages,
      chats: {}
    };
    
    // Convert Map to regular object for JSON export
    this.multiChatData.chats.forEach((chatData, chatTitle) => {
      exportData.chats[chatTitle] = chatData;
    });
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-multi-chat-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.showTemporaryMessage('Multi-chat JSON exported successfully');
  }

  async exportMultiChatCSV() {
    if (this.multiChatData.totalChats === 0) {
      this.showTemporaryMessage('No chats to export', 'error');
      return;
    }
    
    let csvContent = 'Chat Title,Timestamp,Sender,Message,Type,Direction\n';
    
    this.multiChatData.chats.forEach((chatData, chatTitle) => {
      chatData.messages.forEach(message => {
        const row = [
          `"${chatTitle.replace(/"/g, '""')}"`,
          `"${message.timestamp}"`,
          `"${message.sender.replace(/"/g, '""')}"`,
          `"${message.text.replace(/"/g, '""')}"`,
          message.messageType,
          message.isOutgoing ? 'Outgoing' : 'Incoming'
        ].join(',');
        csvContent += row + '\n';
      });
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-multi-chat-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.showTemporaryMessage('Multi-chat CSV exported successfully');
  }

  async saveMultiChatData() {
    try {
      const dataToSave = {
        multiChatMode: this.multiChatMode,
        totalChats: this.multiChatData.totalChats,
        totalMessages: this.multiChatData.totalMessages,
        chats: Object.fromEntries(this.multiChatData.chats),
        lastUpdated: new Date().toISOString()
      };
      
      console.log('Saving multi-chat data:', dataToSave);
      await chrome.storage.local.set({ multiChatData: dataToSave });
      console.log('Multi-chat data saved successfully');
    } catch (error) {
      console.error('Error saving multi-chat data:', error);
      throw error; // Re-throw for retry mechanism
    }
  }

  async saveMultiChatDataWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.saveMultiChatData();
        console.log(`Multi-chat data saved successfully on attempt ${attempt}`);
        return; // Success, exit retry loop
      } catch (error) {
        console.error(`Save attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          console.error('All save attempts failed, data may be lost');
          this.showTemporaryMessage('Failed to save data - please try again', 'error');
          return;
        }
        
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt - 1) * 100; // 100ms, 200ms, 400ms
        console.log(`Retrying save in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async loadMultiChatData() {
    try {
      console.log('Loading multi-chat data...');
      const result = await chrome.storage.local.get('multiChatData');
      console.log('Loaded data from storage:', result);
      
      if (result.multiChatData) {
        const data = result.multiChatData;
        
        // Validate data integrity
        if (!this.validateMultiChatData(data)) {
          console.warn('Invalid multi-chat data found, resetting...');
          await this.resetMultiChatData();
          return;
        }
        
        this.multiChatMode = data.multiChatMode || false;
        
        // Restore chats with validation
        const validChats = new Map();
        const chatsData = data.chats || {};
        
        Object.entries(chatsData).forEach(([chatTitle, chatData]) => {
          if (this.isValidChatData(chatTitle, chatData)) {
            validChats.set(chatTitle, chatData);
          } else {
            console.warn('Skipping invalid chat data:', chatTitle);
          }
        });
        
        this.multiChatData.chats = validChats;
        
        // Recalculate totals from valid data
        this.multiChatData.totalChats = validChats.size;
        this.multiChatData.totalMessages = Array.from(validChats.values())
          .reduce((total, chat) => total + (chat.messageCount || 0), 0);
        
        console.log('Restored multi-chat data:', {
          mode: this.multiChatMode,
          totalChats: this.multiChatData.totalChats,
          totalMessages: this.multiChatData.totalMessages,
          chats: Array.from(this.multiChatData.chats.keys()),
          lastUpdated: data.lastUpdated
        });
        
        // If data was cleaned up, save the corrected version
        if (validChats.size !== Object.keys(chatsData).length) {
          console.log('Data was cleaned up, saving corrected version...');
          await this.saveMultiChatDataWithRetry();
        }
        
        // Restore UI state
        const checkbox = document.getElementById('multiChatMode');
        if (checkbox) {
          checkbox.checked = this.multiChatMode;
          this.toggleMultiChatMode(this.multiChatMode);
        } else {
          console.error('multiChatMode checkbox not found when restoring state');
        }
      } else {
        console.log('No multi-chat data found in storage');
      }
    } catch (error) {
      console.error('Error loading multi-chat data:', error);
      await this.resetMultiChatData();
    }
  }

  validateMultiChatData(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.multiChatMode !== 'boolean') return false;
    if (typeof data.totalChats !== 'number' || data.totalChats < 0) return false;
    if (typeof data.totalMessages !== 'number' || data.totalMessages < 0) return false;
    if (!data.chats || typeof data.chats !== 'object') return false;
    return true;
  }

  isValidChatData(chatTitle, chatData) {
    if (!chatTitle || typeof chatTitle !== 'string' || chatTitle.trim() === '') return false;
    if (!chatData || typeof chatData !== 'object') return false;
    if (!Array.isArray(chatData.messages)) return false;
    if (typeof chatData.messageCount !== 'number' || chatData.messageCount < 0) return false;
    if (!chatData.extractedAt || typeof chatData.extractedAt !== 'string') return false;
    
    // Validate message count matches array length
    if (chatData.messages.length !== chatData.messageCount) {
      console.warn(`Message count mismatch for ${chatTitle}: ${chatData.messages.length} vs ${chatData.messageCount}`);
      return false;
    }
    
    return true;
  }

  async resetMultiChatData() {
    console.log('Resetting multi-chat data to defaults...');
    this.multiChatMode = false;
    this.multiChatData = {
      chats: new Map(),
      totalMessages: 0,
      totalChats: 0
    };
    
    try {
      await chrome.storage.local.remove('multiChatData');
      console.log('Corrupted multi-chat data removed from storage');
    } catch (error) {
      console.error('Error removing corrupted data:', error);
    }
  }

  // Update current chat display in auto-extract panel
  updateCurrentChatDisplay(chatTitle) {
    const currentChatName = document.getElementById('currentChatName');
    if (currentChatName && chatTitle) {
      currentChatName.textContent = chatTitle;
    }
  }

  // Add current chat to auto-extract list
  addCurrentChatToAutoExtract() {
    if (!this.currentChatTitle) {
      this.showTemporaryMessage('No current chat detected', 'error');
      return;
    }

    if (this.autoExtractChats.has(this.currentChatTitle)) {
      this.showTemporaryMessage('Chat already in auto-extract list', 'error');
      return;
    }

    this.autoExtractChats.add(this.currentChatTitle);
    this.updateAutoExtractChatList();
    this.saveAutoExtractChats();
    this.showTemporaryMessage(`Added "${this.currentChatTitle}" to auto-extract list`);
  }

  // Remove chat from auto-extract list
  removeChatFromAutoExtract(chatTitle) {
    console.log('Removing chat from auto-extract:', chatTitle);
    const wasRemoved = this.autoExtractChats.delete(chatTitle);
    console.log('Chat removed successfully:', wasRemoved);
    
    if (wasRemoved) {
      this.updateAutoExtractChatList();
      this.saveAutoExtractChats();
      this.showTemporaryMessage(`Removed "${chatTitle}" from auto-extract list`);
    } else {
      console.error('Failed to remove chat from auto-extract list');
      this.showTemporaryMessage('Failed to remove chat', 'error');
    }
  }

  // Update the auto-extract chat list display
  updateAutoExtractChatList() {
    console.log('Updating auto-extract chat list, current chats:', Array.from(this.autoExtractChats));
    const autoExtractChats = document.getElementById('autoExtractChats');
    const autoExtractChatCount = document.getElementById('autoExtractChatCount');
    
    if (!autoExtractChats || !autoExtractChatCount) {
      console.error('Auto-extract chat elements not found');
      return;
    }

    // Update count
    autoExtractChatCount.textContent = `${this.autoExtractChats.size} chats`;

    // Clear and populate list
    autoExtractChats.innerHTML = '';

    if (this.autoExtractChats.size === 0) {
      autoExtractChats.innerHTML = '<div class="no-chats-message">No chats added yet. Add current chat or switch to other chats to add them.</div>';
      return;
    }

    Array.from(this.autoExtractChats).forEach(chatTitle => {
      const chatItem = document.createElement('div');
      chatItem.className = 'auto-extract-chat-item';
      
      const chatNameSpan = document.createElement('span');
      chatNameSpan.className = 'auto-extract-chat-name';
      chatNameSpan.textContent = chatTitle;
      
      const removeButton = document.createElement('button');
      removeButton.className = 'btn-remove-chat';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => this.removeChatFromAutoExtract(chatTitle));
      
      chatItem.appendChild(chatNameSpan);
      chatItem.appendChild(removeButton);
      autoExtractChats.appendChild(chatItem);
    });
  }

  // Save auto-extract chat list to storage
  async saveAutoExtractChats() {
    try {
      await chrome.storage.local.set({
        autoExtractChats: Array.from(this.autoExtractChats)
      });
    } catch (error) {
      console.error('Error saving auto-extract chats:', error);
    }
  }

  // Load auto-extract chat list from storage
  async loadAutoExtractChats() {
    try {
      const result = await chrome.storage.local.get('autoExtractChats');
      if (result.autoExtractChats) {
        this.autoExtractChats = new Set(result.autoExtractChats);
        this.updateAutoExtractChatList();
      }
    } catch (error) {
      console.error('Error loading auto-extract chats:', error);
    }
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  // Debug function to check storage manually
  async debugStorage() {
    try {
      const result = await chrome.storage.local.get(null);
      console.log('FULL STORAGE DEBUG:', result);
      return result;
    } catch (error) {
      console.error('Error checking storage:', error);
    }
  }
}

// Initialize popup when DOM is loaded
// Initialize popup when DOM is ready
let popupController;
document.addEventListener('DOMContentLoaded', () => {
  popupController = new PopupController();
}); 