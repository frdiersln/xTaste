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
        :root {
            --color-deep-purple: #2D174C;
            --color-hot-pink: #EF4A84;
            --color-sunset-orange: #F5A138;
            --color-sky-blue: #67D3F3;
            --color-white: #FFFFFF;
            --color-dark-bg: #0F0F0F;
            --color-card-bg: #1A1A1A;
            --color-border: #2D174C;
            --color-text-primary: #FFFFFF;
            --color-text-secondary: #B0B0B0;
            --color-text-muted: #7A7A7A;
            --color-success: #00BA7C;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, var(--color-dark-bg) 0%, var(--color-deep-purple) 100%);
            color: var(--color-text-primary);
            line-height: 1.6;
            overflow-x: hidden;
            position: relative;
        }

        /* Animated background gradient */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(45deg, 
                transparent 0%, 
                rgba(239, 74, 132, 0.03) 25%, 
                transparent 50%, 
                rgba(103, 211, 243, 0.03) 75%, 
                transparent 100%);
            background-size: 400% 400%;
            animation: gradientShift 20s ease-in-out infinite;
            pointer-events: none;
            z-index: 0;
        }

        @keyframes gradientShift {
            0%, 100% { 
                background-position: 0% 50%;
                opacity: 0.3;
            }
            25% { 
                background-position: 100% 50%;
                opacity: 0.5;
            }
            50% { 
                background-position: 100% 100%;
                opacity: 0.3;
            }
            75% { 
                background-position: 0% 100%;
                opacity: 0.5;
            }
        }

        .header {
            background: linear-gradient(135deg, var(--color-card-bg) 0%, rgba(45, 23, 76, 0.3) 100%);
            border-radius: 16px;
            padding: clamp(20px, 5vw, 30px);
            margin: clamp(15px, 4vw, 20px);
            text-align: center;
            border: 2px solid var(--color-border);
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .header::before {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            background: linear-gradient(45deg, var(--color-hot-pink), var(--color-sky-blue), var(--color-sunset-orange));
            border-radius: 18px;
            z-index: -2;
        }

        .header::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, var(--color-card-bg) 0%, rgba(45, 23, 76, 0.8) 100%);
            border-radius: 16px;
            z-index: -1;
        }

        .header h1 {
            font-size: clamp(24px, 6vw, 32px);
            font-weight: 800;
            background: linear-gradient(45deg, var(--color-sky-blue), var(--color-hot-pink), var(--color-sunset-orange));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: clamp(8px, 2vw, 12px);
            letter-spacing: -0.5px;
            position: relative;
            z-index: 1;
            text-shadow: 0 2px 10px rgba(103, 211, 243, 0.3);
        }

        .header p {
            color: var(--color-text-secondary);
            font-size: clamp(13px, 3.5vw, 16px);
            font-weight: 500;
            margin-bottom: clamp(4px, 1vw, 6px);
            position: relative;
            z-index: 1;
        }

        .header p:last-child {
            margin-bottom: 0;
        }

        .container {
            max-width: 700px;
            margin: 0 auto;
            padding: clamp(15px, 4vw, 25px);
            width: 100%;
            position: relative;
            z-index: 1;
        }

        .post {
            background: linear-gradient(135deg, var(--color-card-bg) 0%, rgba(45, 23, 76, 0.3) 100%);
            border: 2px solid var(--color-border);
            border-radius: 16px;
            padding: clamp(16px, 4vw, 20px);
            margin-bottom: clamp(16px, 4vw, 20px);
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            display: block;
            word-wrap: break-word;
            overflow-wrap: break-word;
            position: relative;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .post::before {
            content: '';
            position: absolute;
            inset: 0;
            padding: 2px;
            background: linear-gradient(45deg, var(--color-sky-blue), var(--color-hot-pink));
            border-radius: 16px;
            mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            mask-composite: xor;
            -webkit-mask-composite: xor;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .post:hover {
            transform: translateY(-4px) scale(1.01);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
        }

        .post:hover::before {
            opacity: 0.4;
        }

        .post-header {
            display: flex;
            align-items: flex-start;
            margin-bottom: clamp(12px, 3vw, 16px);
            gap: clamp(12px, 3vw, 16px);
        }

        .avatar {
            width: clamp(40px, 8vw, 48px);
            height: clamp(40px, 8vw, 48px);
            border-radius: 50%;
            background: linear-gradient(135deg, var(--color-sky-blue), var(--color-hot-pink));
            flex-shrink: 0;
            border: 2px solid var(--color-border);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }

        .user-info {
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }

        .display-name {
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: 4px;
            font-size: clamp(15px, 4vw, 18px);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .username {
            color: var(--color-text-secondary);
            font-size: clamp(13px, 3.5vw, 16px);
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .post-content {
            margin-bottom: clamp(12px, 3vw, 16px);
            font-size: clamp(15px, 4vw, 18px);
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.6;
            color: var(--color-text-primary);
            font-weight: 400;
        }

        .post-media {
            margin-bottom: clamp(12px, 3vw, 16px);
            overflow: hidden;
        }

        .post-media img {
            max-width: 100%;
            height: auto;
            border-radius: 12px;
            margin-bottom: clamp(8px, 2vw, 12px);
            display: block;
            border: 1px solid var(--color-border);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }

        .post-meta {
            color: var(--color-text-muted);
            font-size: clamp(13px, 3.5vw, 16px);
            font-weight: 500;
            word-wrap: break-word;
            line-height: 1.4;
            padding-top: clamp(8px, 2vw, 12px);
            border-top: 1px solid rgba(45, 23, 76, 0.3);
        }

        .stats {
            background: linear-gradient(135deg, var(--color-card-bg) 0%, rgba(45, 23, 76, 0.3) 100%);
            border: 2px solid var(--color-border);
            border-radius: 16px;
            padding: clamp(20px, 5vw, 25px);
            margin-bottom: clamp(20px, 5vw, 25px);
            text-align: center;
            position: relative;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .stats::before {
            content: '';
            position: absolute;
            inset: 0;
            padding: 2px;
            background: linear-gradient(45deg, var(--color-sky-blue), var(--color-hot-pink));
            border-radius: 16px;
            mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            mask-composite: xor;
            -webkit-mask-composite: xor;
            opacity: 0.3;
        }

        .stats h2 {
            font-size: clamp(20px, 5vw, 24px);
            font-weight: 800;
            background: linear-gradient(45deg, var(--color-sky-blue), var(--color-hot-pink), var(--color-sunset-orange));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: clamp(12px, 3vw, 16px);
            position: relative;
            z-index: 1;
        }

        .stats p {
            font-size: clamp(14px, 4vw, 18px);
            font-weight: 500;
            color: var(--color-text-secondary);
            margin-bottom: clamp(6px, 2vw, 10px);
            position: relative;
            z-index: 1;
        }

        .stats p:last-child {
            margin-bottom: 0;
        }

        .stats strong {
            color: var(--color-text-primary);
            font-weight: 700;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .footer {
            text-align: center;
            padding: clamp(25px, 6vw, 40px) clamp(15px, 4vw, 25px);
            color: var(--color-text-secondary);
            border-top: 2px solid var(--color-border);
            margin-top: clamp(25px, 6vw, 40px);
            background: linear-gradient(135deg, var(--color-card-bg) 0%, rgba(45, 23, 76, 0.2) 100%);
            backdrop-filter: blur(10px);
        }

        .footer a {
            color: var(--color-sky-blue);
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .footer a:hover {
            color: var(--color-hot-pink);
            text-shadow: 0 0 10px rgba(239, 74, 132, 0.3);
        }

        /* Mobile optimizations */
        @media (max-width: 480px) {
            .container {
                padding: 12px;
            }
            
            .post {
                padding: 14px;
                margin-bottom: 14px;
                border-radius: 12px;
            }

            .post-header {
                margin-bottom: 10px;
                gap: 10px;
            }

            .avatar {
                width: 36px;
                height: 36px;
            }

            .post-content {
                margin-bottom: 10px;
                font-size: 15px;
            }

            .post-meta {
                font-size: 13px;
            }

            .stats {
                padding: 16px;
                margin-bottom: 16px;
                border-radius: 12px;
            }

            .header {
                padding: 16px;
                margin: 12px;
                border-radius: 12px;
            }
        }

        /* Tablet optimizations */
        @media (min-width: 481px) and (max-width: 768px) {
            .container {
                padding: 18px;
            }
            
            .post {
                padding: 18px;
            }

            .avatar {
                width: 42px;
                height: 42px;
            }
        }

        /* Large screen optimizations */
        @media (min-width: 1200px) {
            .container {
                max-width: 750px;
            }
        }

        /* Landscape mobile optimizations */
        @media (max-height: 600px) and (orientation: landscape) {
            .header {
                padding: 12px;
                margin: 10px;
            }
            
            .header h1 {
                font-size: 22px;
                margin-bottom: 6px;
            }
            
            .header p {
                font-size: 13px;
            }
            
            .container {
                padding: 10px;
            }
            
            .post {
                padding: 12px;
                margin-bottom: 12px;
            }
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--color-deep-purple);
        }

        ::-webkit-scrollbar-thumb {
            background: linear-gradient(var(--color-sky-blue), var(--color-hot-pink));
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(var(--color-hot-pink), var(--color-sunset-orange));
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
            <h2>Collection Stats</h2>
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
