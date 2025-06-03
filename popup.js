class PopupController {
    constructor() {
        this.initializeElements();
        this.initializeEventListeners();
        this.checkCurrentTab();
        this.loadStoredData();
        this.setupMessageListener();
    }

    initializeElements() {
        this.elements = {
            warning: document.getElementById('warning'),
            loadButton: document.getElementById('loadButton'),
            loadButtonText: document.getElementById('loadButtonText'),
            saveButton: document.getElementById('saveButton'),
            resetButton: document.getElementById('resetButton'),
            postCount: document.getElementById('postCount'),
            status: document.getElementById('status'),
            progress: document.getElementById('progress'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText')
        };
    }

    initializeEventListeners() {
        this.elements.loadButton.addEventListener('click', () => this.handleLoadButtonClick());
        this.elements.saveButton.addEventListener('click', () => this.handleSaveButtonClick());
        this.elements.resetButton.addEventListener('click', () => this.handleResetButtonClick());
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'PROGRESS_UPDATE') {
                this.updateProgress(message.data);
            } else if (message.type === 'LOADING_COMPLETE') {
                this.handleLoadingComplete(message.data);
            } else if (message.type === 'LOADING_STOPPED') {
                this.handleLoadingStopped(message.data);
            } else if (message.type === 'LOADING_STARTED') {
                this.handleLoadingStarted(message.data);
            } else if (message.type === 'LOADING_RESUMED') {
                this.handleLoadingResumed(message.data);
            }
        });
    }

    async checkCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const isValidUrl = tab.url && (
                tab.url.includes('x.com') && tab.url.includes('/likes')
            );

            if (!isValidUrl) {
                this.showWarning();
                this.elements.loadButton.disabled = true;
            } else {
                this.hideWarning();
                this.elements.loadButton.disabled = false;
            }
        } catch (error) {
            console.error('Error checking tab:', error);
            this.showWarning();
        }
    }

    async loadStoredData() {
        try {
            const result = await chrome.storage.local.get(['posts', 'loadingState']);
            const posts = result.posts || [];
            const loadingState = result.loadingState || 'idle';

            this.elements.postCount.textContent = posts.length;
            this.elements.saveButton.disabled = posts.length === 0;

            this.updateLoadingState(loadingState);
        } catch (error) {
            console.error('Error loading stored data:', error);
        }
    }

    updateLoadingState(state) {
        switch (state) {
            case 'loading':
                this.elements.loadButtonText.textContent = 'Stop Loading';
                this.elements.loadButton.className = 'btn stop';
                this.elements.status.textContent = 'Loading...';
                this.showProgress();
                break;
            case 'paused':
                this.elements.loadButtonText.textContent = 'Resume Loading';
                this.elements.loadButton.className = 'btn resume';
                this.elements.status.textContent = 'Paused';
                this.showProgress();
                break;
            case 'completed':
                this.elements.loadButtonText.textContent = 'Load All Liked Posts';
                this.elements.loadButton.className = 'btn primary';
                this.elements.status.textContent = 'Completed';
                this.elements.status.className = 'stat-value success';
                this.hideProgress();
                break;
            default:
                this.elements.loadButtonText.textContent = 'Load All Liked Posts';
                this.elements.loadButton.className = 'btn primary';
                this.elements.status.textContent = 'Ready';
                this.elements.status.className = 'stat-value';
                this.hideProgress();
        }
    }

    async handleLoadButtonClick() {
        try {
            // Show connecting status
            this.elements.status.textContent = 'Connecting...';
            this.elements.status.className = 'stat-value';
            
            const result = await chrome.storage.local.get(['loadingState']);
            const currentState = result.loadingState || 'idle';

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Check if we're on the right page
            if (!tab.url || (!tab.url.includes('x.com') && !tab.url.includes('twitter.com')) || !tab.url.includes('/likes')) {
                this.elements.status.textContent = 'Navigate to your X/Twitter likes page first';
                this.elements.status.className = 'stat-value error';
                return;
            }

            let messageType;
            if (currentState === 'loading') {
                messageType = 'STOP_LOADING';
            } else if (currentState === 'paused') {
                messageType = 'RESUME_LOADING';
            } else {
                messageType = 'START_LOADING';
            }

            // Try to send message to content script with timeout
            try {
                // First, ping to check if content script is loaded
                await this.sendMessageWithTimeout(tab.id, { type: 'PING' }, 2000);
                
                // Content script is ready, send the actual message
                await this.sendMessageWithTimeout(tab.id, { type: messageType }, 5000);
                
                // Message sent successfully - the content script will send back status updates
                // Reset status to show the action was successful
                this.elements.status.textContent = 'Connected';
                this.elements.status.className = 'stat-value';
            } catch (messageError) {
                console.error('Failed to communicate with content script:', messageError);
                
                this.elements.status.textContent = 'Loading extension...';
                
                // Try to inject content script if it's not loaded
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    
                    // Wait a bit for the script to initialize
                    await this.sleep(1000);
                    
                    // Try sending the message again
                    await this.sendMessageWithTimeout(tab.id, { type: messageType }, 5000);
                    
                    // Success after injection - let the content script handle UI updates
                    this.elements.status.textContent = 'Connected';
                    this.elements.status.className = 'stat-value';
                } catch (injectionError) {
                    console.error('Failed to inject content script:', injectionError);
                    this.elements.status.textContent = 'Connection failed - please refresh the page';
                    this.elements.status.className = 'stat-value error';
                    return;
                }
            }
        } catch (error) {
            console.error('Error handling load button click:', error);
            this.elements.status.textContent = 'Unexpected error - please try again';
            this.elements.status.className = 'stat-value error';
        }
    }

    async sendMessageWithTimeout(tabId, message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Message timeout'));
            }, timeout);

            chrome.tabs.sendMessage(tabId, message, (response) => {
                clearTimeout(timeoutId);
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async handleSaveButtonClick() {
        try {
            this.elements.saveButton.disabled = true;
            this.elements.saveButton.textContent = 'Generating HTML...';

            const result = await chrome.storage.local.get(['posts']);
            const posts = result.posts || [];

            if (posts.length === 0) {
                alert('No posts to save. Please load posts first.');
                return;
            }

            const html = this.generateHTML(posts);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);

            const filename = `xTaste-likes-${new Date().toISOString().split('T')[0]}.html`;

            await chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            });

            this.elements.saveButton.textContent = 'Save as HTML';
            this.elements.saveButton.disabled = false;

        } catch (error) {
            console.error('Error saving HTML:', error);
            alert('Error saving file. Please try again.');
            this.elements.saveButton.textContent = 'Save as HTML';
            this.elements.saveButton.disabled = false;
        }
    }

    generateHTML(posts) {
        const currentDate = new Date().toLocaleDateString();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My X/Twitter Likes - xTaste Export</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #000;
            color: #fff;
            line-height: 1.6;
            overflow-x: hidden;
        }

        .header {
            background: #16181c;
            padding: clamp(15px, 4vw, 20px);
            text-align: center;
            border-bottom: 1px solid #333;
        }

        .header h1 {
            font-size: clamp(20px, 5vw, 28px);
            color: #1d9bf0;
            margin-bottom: clamp(6px, 2vw, 10px);
            word-break: break-word;
        }

        .header p {
            color: #8899a6;
            font-size: clamp(12px, 3vw, 16px);
            word-wrap: break-word;
            line-height: 1.4;
        }

        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: clamp(10px, 3vw, 20px);
            width: 100%;
        }

        .post {
            background: #16181c;
            border: 1px solid #333;
            border-radius: 12px;
            padding: clamp(12px, 3vw, 16px);
            margin-bottom: clamp(12px, 3vw, 16px);
            transition: border-color 0.2s ease;
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            display: block;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .post:hover {
            border-color: #1d9bf0;
        }

        .post-header {
            display: flex;
            align-items: flex-start;
            margin-bottom: clamp(8px, 2vw, 12px);
            gap: clamp(8px, 2vw, 12px);
        }

        .avatar {
            width: clamp(32px, 8vw, 40px);
            height: clamp(32px, 8vw, 40px);
            border-radius: 50%;
            background: #333;
            flex-shrink: 0;
        }

        .user-info {
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }

        .display-name {
            font-weight: 600;
            color: #fff;
            margin-bottom: 2px;
            font-size: clamp(13px, 3.5vw, 16px);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .username {
            color: #8899a6;
            font-size: clamp(11px, 3vw, 14px);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .post-content {
            margin-bottom: clamp(8px, 2vw, 12px);
            font-size: clamp(13px, 3.5vw, 16px);
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.5;
        }

        .post-media {
            margin-bottom: clamp(8px, 2vw, 12px);
            overflow: hidden;
        }

        .post-media img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin-bottom: clamp(4px, 1vw, 8px);
            display: block;
        }

        .post-meta {
            color: #8899a6;
            font-size: clamp(11px, 3vw, 14px);
            word-wrap: break-word;
            line-height: 1.3;
        }

        .stats {
            background: #16181c;
            border: 1px solid #333;
            border-radius: 12px;
            padding: clamp(15px, 4vw, 20px);
            margin-bottom: clamp(15px, 4vw, 20px);
            text-align: center;
        }

        .stats h2 {
            color: #1d9bf0;
            margin-bottom: clamp(6px, 2vw, 10px);
            font-size: clamp(16px, 4vw, 20px);
        }

        .stats p {
            font-size: clamp(12px, 3vw, 16px);
            margin-bottom: clamp(4px, 1vw, 8px);
        }

        .footer {
            text-align: center;
            padding: clamp(20px, 5vw, 40px) clamp(10px, 3vw, 20px);
            color: #8899a6;
            border-top: 1px solid #333;
            margin-top: clamp(20px, 5vw, 40px);
        }

        .footer a {
            color: #1d9bf0;
            text-decoration: none;
        }

        /* Mobile optimizations */
        @media (max-width: 480px) {
            .container {
                padding: 8px;
            }
            
            .post {
                padding: 10px;
                margin-bottom: 10px;
                border-radius: 8px;
            }

            .post-header {
                margin-bottom: 8px;
                gap: 8px;
            }

            .avatar {
                width: 28px;
                height: 28px;
            }

            .post-content {
                margin-bottom: 8px;
                font-size: 14px;
            }

            .post-meta {
                font-size: 12px;
            }

            .stats {
                padding: 12px;
                margin-bottom: 12px;
                border-radius: 8px;
            }

            .header {
                padding: 12px 8px;
            }
        }

        /* Tablet optimizations */
        @media (min-width: 481px) and (max-width: 768px) {
            .container {
                padding: 15px;
            }
            
            .post {
                padding: 14px;
            }

            .avatar {
                width: 36px;
                height: 36px;
            }
        }

        /* Large screen optimizations */
        @media (min-width: 1200px) {
            .container {
                max-width: 650px;
            }
        }

        /* Landscape mobile optimizations */
        @media (max-height: 600px) and (orientation: landscape) {
            .header {
                padding: 10px;
            }
            
            .header h1 {
                font-size: 20px;
                margin-bottom: 4px;
            }
            
            .header p {
                font-size: 12px;
            }
            
            .container {
                padding: 8px;
            }
            
            .post {
                padding: 8px;
                margin-bottom: 8px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>My X/Twitter Likes</h1>
        <p>Exported with xTaste • ${currentDate} • ${posts.length} posts</p>
        <p>Click on any post to view the original on X/Twitter</p>
    </div>

    <div class="container">
        <div class="stats">
            <h2>📊 Collection Stats</h2>
            <p>Total liked posts: <strong>${posts.length}</strong></p>
            <p>Export date: <strong>${currentDate}</strong></p>
        </div>

        ${posts.map(post => `
            <a href="${post.url}" target="_blank" class="post">
                <div class="post-header">
                    <img src="${post.avatar || '/api/placeholder/40/40'}" alt="Avatar" class="avatar" onerror="this.style.display='none'">
                    <div class="user-info">
                        <div class="display-name">${this.escapeHtml(post.displayName || 'Unknown User')}</div>
                        <div class="username">@${this.escapeHtml(post.username || 'unknown')}</div>
                    </div>
                </div>
                <div class="post-content">${this.escapeHtml(post.content || '')}</div>
                ${post.media && post.media.length > 0 ? `
                    <div class="post-media">
                        ${post.media.map(mediaUrl => `
                            <img src="${mediaUrl}" alt="Post media" onerror="this.style.display='none'">
                        `).join('')}
                    </div>
                ` : ''}
                <div class="post-meta">
                    ${post.timestamp ? new Date(post.timestamp).toLocaleString() : 'Date unknown'}
                </div>
            </a>
        `).join('')}
    </div>

    <div class="footer">
        <p>Generated by <a href="https://github.com/frdiersln/xTaste" target="_blank">xTaste Browser Extension</a></p>
    </div>
</body>
</html>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateProgress(data) {
        this.elements.postCount.textContent = data.postsLoaded;
        this.elements.progressFill.style.width = `${data.progress}%`;
        
        const progressText = data.totalExpected > 0 
            ? `Loading posts... ${data.postsLoaded}/${data.totalExpected} found`
            : `Loading posts... ${data.postsLoaded} found`;
            
        this.elements.progressText.textContent = progressText;
        this.elements.saveButton.disabled = data.postsLoaded === 0;
    }

    handleLoadingComplete(data) {
        this.elements.postCount.textContent = data.totalPosts;
        this.elements.status.textContent = 'Completed';
        this.elements.status.className = 'stat-value success';
        this.elements.loadButtonText.textContent = 'Load All Liked Posts';
        this.elements.loadButton.className = 'btn primary';
        this.elements.saveButton.disabled = false;
        this.hideProgress();
    }

    handleLoadingStopped(data) {
        this.elements.postCount.textContent = data.totalPosts;
        this.elements.status.textContent = 'Stopped';
        this.elements.loadButtonText.textContent = 'Resume Loading';
        this.elements.loadButton.className = 'btn resume';
        this.elements.saveButton.disabled = data.totalPosts === 0;
    }

    handleLoadingStarted(data) {
        this.elements.postCount.textContent = data.totalPosts;
        this.elements.status.textContent = 'Loading...';
        this.elements.loadButtonText.textContent = 'Stop Loading';
        this.elements.loadButton.className = 'btn stop';
        this.showProgress();
    }

    handleLoadingResumed(data) {
        this.elements.postCount.textContent = data.totalPosts;
        this.elements.status.textContent = 'Loading...';
        this.elements.loadButtonText.textContent = 'Stop Loading';
        this.elements.loadButton.className = 'btn stop';
        this.showProgress();
    }

    async handleResetButtonClick() {
        if (confirm('Are you sure you want to reset all loaded posts? This action cannot be undone.')) {
            try {
                // Clear posts from storage
                await chrome.storage.local.set({ 
                    posts: [],
                    loadingState: 'idle'
                });
                
                // Also notify content script to clear its local posts array
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    await chrome.tabs.sendMessage(tab.id, { type: 'RESET_POSTS' });
                } catch (messageError) {
                    console.log('Could not notify content script (tab might not have content script loaded)');
                }
                
                // Update UI
                this.elements.postCount.textContent = '0';
                this.elements.saveButton.disabled = true;
                this.elements.status.textContent = 'Ready';
                this.elements.status.className = 'stat-value';
                this.updateLoadingState('idle');
                this.hideProgress();
                
                console.log('Loaded posts reset successfully');
            } catch (error) {
                console.error('Error resetting posts:', error);
                alert('Error resetting posts. Please try again.');
            }
        }
    }

    showWarning() {
        this.elements.warning.classList.remove('hidden');
    }

    hideWarning() {
        this.elements.warning.classList.add('hidden');
    }

    showProgress() {
        this.elements.progress.classList.remove('hidden');
    }

    hideProgress() {
        this.elements.progress.classList.add('hidden');
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
