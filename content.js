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

    // Post-process to detect contact sequences
    this.detectContactSequences(messages);

    return messages;
  }

  // Extract contact card information
  extractContactCard(messageElement) {
    console.log('Extracting contact card from message element:', messageElement);
    
    // Common selectors for contact cards in WhatsApp Web
    const contactSelectors = [
      '[data-testid="contact-card"]',
      '.contact-card',
      '[data-testid="msg-contact"]',
      '.message-contact',
      '.quoted-mention[data-app="contact"]',
      // Look for elements containing contact-related attributes
      '[data-id*="contact"]',
      '[class*="contact"]',
      // Look for the button structure you provided
      'div[role="button"][data-tab="6"]',
      'div[role="button"] span.x1iyjqo2'
    ];

    let contactElement = null;
    for (const selector of contactSelectors) {
      contactElement = messageElement.querySelector(selector);
      if (contactElement) break;
    }
    
    // Check for the specific contact info span structure - look for MULTIPLE spans
    const contactInfoSpans = messageElement.querySelectorAll('span.x1iyjqo2.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1rg5ohu._ao3e');
    if (contactInfoSpans.length > 0) {
      console.log('Found', contactInfoSpans.length, 'contact info spans');
      
      let contactName = null;
      let contactPhone = null;
      
      // Check each span to identify name vs phone
      contactInfoSpans.forEach((span, index) => {
        if (span && span.textContent) {
          const text = span.textContent.trim();
          console.log(`Span ${index}:`, text);
          
          // Check if this looks like a phone number
          if (text.match(/^\+?\d[\d\s\-\(\)]+\d$/) || text.match(/^\+?\s?\d{1,4}\s?\(\d{3}\)\s?\d{3}-\d{4}$/)) {
            contactPhone = text.replace(/[\s\-\(\)]/g, '');
            console.log('Found phone number:', contactPhone);
          } else if (text.length > 0 && !text.toLowerCase().includes('click') && !text.toLowerCase().includes('contact info')) {
            // This is likely a contact name
            contactName = text;
            console.log('Found contact name:', contactName);
          }
        }
      });
      
      // If we found either name or phone, create contact info
      if (contactName || contactPhone) {
        const contactInfo = {
          name: contactName || 'Shared Contact',
          phone: contactPhone || null,
          displayName: contactName
        };
        console.log('Extracted contact info from multiple spans:', contactInfo);
        return contactInfo;
      }
    }
    
    // Alternative: look for spans containing phone numbers with similar class patterns
    const phoneSpans = messageElement.querySelectorAll('span[dir="auto"]');
    for (const span of phoneSpans) {
      if (span.textContent) {
        const text = span.textContent.trim();
        // Check if this looks like a phone number
        if (text.match(/^\+?\d[\d\s\-\(\)]+\d$/) || text.match(/^\+?\s?\d{1,4}\s?\(\d{3}\)\s?\d{3}-\d{4}$/)) {
          console.log('Found phone number in dir="auto" span:', text);
          const result = this.parseContactFromSpan(span, text);
          console.log('Parsed contact info from phone span:', result);
          return result;
        }
      }
    }

    // Enhanced text pattern search - look more broadly in the message
    const allTextElements = messageElement.querySelectorAll('span, div, p');
    for (const textElement of allTextElements) {
      if (textElement && textElement.textContent) {
        const textContent = textElement.textContent.trim();
        
        // Check for "click here for contact info" pattern
        if (textContent.toLowerCase().includes('click here for contact info') ||
            textContent.toLowerCase().includes('contact info') ||
            textContent.toLowerCase().includes('shared contact') ||
            textContent.toLowerCase().includes('contact card')) {
          
          console.log('Found contact pattern in text:', textContent);
          // Try to extract contact info from nearby elements or data attributes
          return this.extractContactFromText(messageElement, textContent);
        }
      }
    }
    
    // Final fallback: Check ALL spans in the message for phone numbers
    const allSpans = messageElement.querySelectorAll('span');
    for (const span of allSpans) {
      if (span && span.textContent) {
        const text = span.textContent.trim();
        // Check if this looks like a phone number with the format you specified
        if (text.match(/^\+?\d+\s*\(\d{3}\)\s*\d{3}-\d{4}$/) || 
            text.match(/^\+?\d[\d\s\-\(\)]{7,}$/) ||
            text.match(/^\+\d{1,4}\s?\(\d{3}\)\s?\d{3}-\d{4}$/)) {
          console.log('Found potential contact phone in span:', text);
          return this.parseContactFromSpan(span, text);
        }
      }
    }

    if (!contactElement) return null;

    // Extract contact information from the contact element
    const contactInfo = {
      name: null,
      phone: null,
      displayName: null
    };

    // First, try to find multiple spans with the specific classes within this contact element
    const contactSpansInElement = contactElement.querySelectorAll('span.x1iyjqo2.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1rg5ohu._ao3e');
    if (contactSpansInElement.length > 0) {
      console.log('Found', contactSpansInElement.length, 'contact spans within contact element');
      
      contactSpansInElement.forEach((span, index) => {
        if (span && span.textContent) {
          const text = span.textContent.trim();
          console.log(`Contact element span ${index}:`, text);
          
          // Check if this looks like a phone number
          if (text.match(/^\+?\d[\d\s\-\(\)]+\d$/) || text.match(/^\+?\s?\d{1,4}\s?\(\d{3}\)\s?\d{3}-\d{4}$/)) {
            contactInfo.phone = text.replace(/[\s\-\(\)]/g, '');
            console.log('Found phone in contact element:', contactInfo.phone);
          } else if (text.length > 0 && !text.toLowerCase().includes('click') && !text.toLowerCase().includes('contact info')) {
            // This is likely a contact name
            contactInfo.name = text;
            console.log('Found name in contact element:', contactInfo.name);
          }
        }
      });
      
      // If we found info from the spans, return it
      if (contactInfo.name || contactInfo.phone) {
        return contactInfo;
      }
    }

    // Fallback to traditional selectors
    // Try to extract contact name
    const nameSelectors = [
      '.contact-name',
      '.contact-title',
      '[data-testid="contact-name"]',
      '.copyable-text span',
      '.quoted-mention span'
    ];

    for (const selector of nameSelectors) {
      const nameEl = contactElement.querySelector(selector);
      if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
        contactInfo.name = nameEl.textContent.trim();
        break;
      }
    }

    // Try to extract phone number from data attributes or text
    const phoneSelectors = [
      '[data-phone]',
      '[data-testid="contact-phone"]',
      '.contact-phone'
    ];

    for (const selector of phoneSelectors) {
      const phoneEl = contactElement.querySelector(selector);
      if (phoneEl) {
        const phone = phoneEl.getAttribute('data-phone') || phoneEl.textContent;
        if (phone && phone.trim()) {
          contactInfo.phone = phone.trim();
          break;
        }
      }
    }

    // If still no phone found, try to extract from parent element attributes
    if (!contactInfo.phone) {
      const dataId = messageElement.getAttribute('data-id');
      if (dataId && dataId.includes('@')) {
        // Extract phone number from WhatsApp message ID format
        const phoneMatch = dataId.match(/(\d+)@/);
        if (phoneMatch) {
          contactInfo.phone = phoneMatch[1];
        }
      }
    }

    // Look for contact info in aria-labels or titles
    const ariaElements = contactElement.querySelectorAll('[aria-label], [title]');
    ariaElements.forEach(el => {
      const label = el.getAttribute('aria-label') || el.getAttribute('title');
      if (label) {
        // Extract phone number from aria-label
        const phoneMatch = label.match(/(\+?\d[\d\s\-\(\)]+\d)/);
        if (phoneMatch && !contactInfo.phone) {
          contactInfo.phone = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
        }
        
        // Extract name if not found
        if (!contactInfo.name && label.toLowerCase().includes('contact')) {
          const nameMatch = label.match(/contact[:\s]+([^,\n]+)/i);
          if (nameMatch) {
            contactInfo.name = nameMatch[1].trim();
          }
        }
      }
    });

    return (contactInfo.name || contactInfo.phone) ? contactInfo : null;
  }

  // Parse contact info from the specific span element structure
  parseContactFromSpan(spanElement, contactText) {
    const contactInfo = {
      name: null,
      phone: null,
      displayName: null
    };

    // Check if the content is a phone number
    const phoneMatch = contactText.match(/(\+?\d[\d\s\-\(\)]+\d)/);
    if (phoneMatch) {
      contactInfo.phone = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
      
      // Look for a name in nearby elements (sibling or parent elements)
      const parentElement = spanElement.parentElement;
      if (parentElement) {
        // Look for other spans that might contain the contact name
        const siblingSpans = parentElement.querySelectorAll('span');
        for (const siblingSpan of siblingSpans) {
          if (siblingSpan !== spanElement && siblingSpan.textContent) {
            const siblingText = siblingSpan.textContent.trim();
            // Check if this looks like a name (not a phone number)
            if (siblingText && 
                !siblingText.match(/^[\+\d\s\-\(\)]+$/) && 
                siblingText.length > 1 && 
                siblingText.length < 50 &&
                !siblingText.toLowerCase().includes('click') &&
                !siblingText.toLowerCase().includes('contact info')) {
              contactInfo.name = siblingText;
              break;
            }
          }
        }
      }
      
      // If no name found, check for contact name in message structure
      if (!contactInfo.name) {
        const messageContainer = spanElement.closest('[data-testid="msg-container"]') || 
                               spanElement.closest('.message-in') || 
                               spanElement.closest('.message-out');
        
        if (messageContainer) {
          // Look for text elements that might contain the contact name
          const textElements = messageContainer.querySelectorAll('span, div');
          for (const textEl of textElements) {
            if (textEl !== spanElement && textEl.textContent) {
              const text = textEl.textContent.trim();
              if (text && 
                  text !== contactText &&
                  !text.match(/^[\+\d\s\-\(\)]+$/) &&
                  !text.toLowerCase().includes('click') &&
                  !text.toLowerCase().includes('contact info') &&
                  text.length > 1 && 
                  text.length < 50) {
                // This might be the contact name
                contactInfo.name = text;
                break;
              }
            }
          }
        }
      }
      
      // If still no name, use a default
      if (!contactInfo.name) {
        contactInfo.name = 'Shared Contact';
      }
    } else {
      // If it's not a phone number, it might be a name
      contactInfo.name = contactText;
      
      // Look for phone number in nearby elements
      const parentElement = spanElement.parentElement;
      if (parentElement) {
        const siblingSpans = parentElement.querySelectorAll('span');
        for (const siblingSpan of siblingSpans) {
          if (siblingSpan !== spanElement && siblingSpan.textContent) {
            const siblingText = siblingSpan.textContent.trim();
            const phoneMatch = siblingText.match(/(\+?\d[\d\s\-\(\)]+\d)/);
            if (phoneMatch) {
              contactInfo.phone = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
              break;
            }
          }
        }
      }
    }

    return (contactInfo.name || contactInfo.phone) ? contactInfo : null;
  }

  // Extract contact info from text-based contact messages
  extractContactFromText(messageElement, textContent) {
    const contactInfo = {
      name: null,
      phone: null,
      displayName: null
    };

    // Try to find contact information in the message structure
    // Look for vCard-like patterns or structured contact data
    const vCardMatch = textContent.match(/BEGIN:VCARD[\s\S]*?END:VCARD/i);
    if (vCardMatch) {
      const vCard = vCardMatch[0];
      const nameMatch = vCard.match(/FN:(.+)/);
      const phoneMatch = vCard.match(/TEL.*?:(.+)/);
      
      if (nameMatch) contactInfo.name = nameMatch[1].trim();
      if (phoneMatch) contactInfo.phone = phoneMatch[1].trim();
    }

    // Look for patterns like "Name: John Doe, Phone: +1234567890"
    const namePhoneMatch = textContent.match(/name[:\s]+([^,\n]+)[,\s]+phone[:\s]+([\+\d\s\-\(\)]+)/i);
    if (namePhoneMatch) {
      contactInfo.name = namePhoneMatch[1].trim();
      contactInfo.phone = namePhoneMatch[2].replace(/[\s\-\(\)]/g, '');
    }

    // Look for phone numbers in the text
    if (!contactInfo.phone) {
      const phoneMatch = textContent.match(/(\+?\d[\d\s\-\(\)]{8,})/);
      if (phoneMatch) {
        contactInfo.phone = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
      }
    }

    // Try to extract from message element's data attributes
    const dataId = messageElement.getAttribute('data-id');
    if (dataId) {
      // WhatsApp message IDs often contain phone numbers
      const phoneMatch = dataId.match(/(\d{10,})@/);
      if (phoneMatch) {
        contactInfo.phone = phoneMatch[1];
      }
    }

    // Look in sibling elements or parent for additional contact info
    const siblingElements = messageElement.querySelectorAll('*');
    for (const el of siblingElements) {
      const text = el.textContent || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const combinedText = (text + ' ' + ariaLabel).toLowerCase();
      
      if (combinedText.includes('contact') && !contactInfo.name) {
        // Try to extract name from contact-related elements
        const nameMatch = text.match(/^([A-Za-z\s]+)$/);
        if (nameMatch && nameMatch[1].length > 2 && nameMatch[1].length < 50) {
          contactInfo.name = nameMatch[1].trim();
        }
      }
    }

    // If we found a phone but no name, set a default name
    if (contactInfo.phone && !contactInfo.name) {
      contactInfo.name = 'Shared Contact';
    }

    return (contactInfo.name || contactInfo.phone) ? contactInfo : null;
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
    let contactInfo = null;
    
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
    } else {
      // Check for contact card
      contactInfo = this.extractContactCard(messageElement);
      if (contactInfo) {
        messageType = 'contact';
        text = `Contact: ${contactInfo.name}${contactInfo.phone ? ` (${contactInfo.phone})` : ''}`;
        console.log('Contact detected - Original text:', text);
        console.log('Contact info extracted:', contactInfo);
      }
    }

    return {
      sender: sender,
      text: text,
      timestamp: timestamp,
      messageType: messageType,
      isOutgoing: isOutgoing,
      contactInfo: contactInfo,
      element: messageElement
    };
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
      callback({
        type: 'complete',
        messages: allMessages,
        chatTitle: this.getChatTitle()
      });
    }

    this.isExtractingAll = false;
    return allMessages;
  }

  // Detect contact card sequences in message flow
  detectContactSequences(messages) {
    console.log('Detecting contact sequences in', messages.length, 'messages');
    
    for (let i = 0; i < messages.length; i++) {
      const currentMsg = messages[i];
      
      // Look for messages that might be contact cards or contain "click here for contact info"
      if (this.isLikelyContactCard(currentMsg)) {
        console.log('Found potential contact card at index', i, ':', currentMsg.text);
        
        // Look ahead for the next few messages to find contact name and phone
        const contactInfo = this.extractContactFromFollowingMessages(messages, i);
        
        if (contactInfo) {
          console.log('Found contact info in following messages:', contactInfo);
          
          // Update the original contact card message
          currentMsg.messageType = 'contact';
          currentMsg.contactInfo = contactInfo;
          currentMsg.text = `Contact: ${contactInfo.name}${contactInfo.phone ? ` (${contactInfo.phone})` : ''}`;
          
          // Mark the following messages as part of this contact
          this.markContactMessages(messages, i, contactInfo);
        }
      }
    }
  }

  // Check if a message is likely a contact card
  isLikelyContactCard(message) {
    const text = message.text.toLowerCase();
    return text.includes('click here for contact info') ||
           text.includes('contact info') ||
           text.includes('shared contact') ||
           text.includes('contact card') ||
           message.messageType === 'contact';
  }

  // Extract contact info from messages following a contact card
  extractContactFromFollowingMessages(messages, contactCardIndex) {
    const contactInfo = {
      name: null,
      phone: null,
      displayName: null
    };
    
    // Look at the next 5 messages for contact details
    const lookAheadLimit = Math.min(contactCardIndex + 6, messages.length);
    
    for (let i = contactCardIndex + 1; i < lookAheadLimit; i++) {
      const msg = messages[i];
      if (!msg || !msg.text) continue;
      
      const text = msg.text.trim();
      console.log(`Checking message ${i} for contact info:`, text);
      
      // Check if this looks like a phone number
      if (text.match(/^\+?\d[\d\s\-\(\)]+\d$/) || text.match(/^\+?\s?\d{1,4}\s?\(\d{3}\)\s?\d{3}-\d{4}$/)) {
        contactInfo.phone = text.replace(/[\s\-\(\)]/g, '');
        console.log('Found phone number in message flow:', contactInfo.phone);
      } 
             // Check if this looks like a contact name (not too short, not too long, no numbers)
       else if (text.length >= 2 && 
                text.length <= 50 && 
                !text.match(/^\+?\d/) && 
                !text.toLowerCase().includes('click') &&
                !text.toLowerCase().includes('contact info') &&
                !text.toLowerCase().includes('http') &&
                !text.toLowerCase().includes('here') &&
                !text.toLowerCase().includes('for') &&
                text.match(/^[a-zA-Z][\w\s\u00C0-\u017F\u0100-\u024F\u1E00-\u1EFF]*[a-zA-Z]$|^[a-zA-Z]$/)) {
        // This looks like a name
        if (!contactInfo.name) {
          contactInfo.name = text;
          console.log('Found contact name in message flow:', contactInfo.name);
        }
      }
      
      // If we found both name and phone, we're done
      if (contactInfo.name && contactInfo.phone) {
        break;
      }
    }
    
    // Return contact info if we found at least a name or phone
    return (contactInfo.name || contactInfo.phone) ? contactInfo : null;
  }

  // Mark messages that are part of a contact sequence
  markContactMessages(messages, contactCardIndex, contactInfo) {
    const lookAheadLimit = Math.min(contactCardIndex + 6, messages.length);
    
    for (let i = contactCardIndex + 1; i < lookAheadLimit; i++) {
      const msg = messages[i];
      if (!msg || !msg.text) continue;
      
      const text = msg.text.trim();
      
      // Mark phone number messages
      if (contactInfo.phone && text.replace(/[\s\-\(\)]/g, '') === contactInfo.phone) {
        msg.messageType = 'contact-phone';
        msg.isContactPart = true;
        msg.parentContactIndex = contactCardIndex;
        console.log(`Marked message ${i} as contact phone`);
      }
      // Mark name messages
      else if (contactInfo.name && text === contactInfo.name) {
        msg.messageType = 'contact-name';
        msg.isContactPart = true;
        msg.parentContactIndex = contactCardIndex;
        console.log(`Marked message ${i} as contact name`);
      }
    }
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
    const headers = ['Timestamp', 'Sender', 'Message', 'Type', 'Direction', 'Contact Name', 'Contact Phone', 'Is Contact Part'];
    const rows = messages.map(msg => [
      msg.timestamp,
      msg.sender,
      msg.text.replace(/"/g, '""'), // Escape quotes
      msg.messageType,
      msg.isOutgoing ? 'Outgoing' : 'Incoming',
      msg.contactInfo?.name || '',
      msg.contactInfo?.phone || '',
      msg.isContactPart ? 'Yes' : 'No'
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
      const chatTitle = whatsappParser.getChatTitle();
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