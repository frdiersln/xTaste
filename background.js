// Background service worker for xTaste extension
class XTasteBackground {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.onInstall();
            } else if (details.reason === 'update') {
                this.onUpdate(details.previousVersion);
            }
        });

        // Listen for messages from popup and content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Listen for tab updates to manage extension state
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete') {
                this.handleTabUpdate(tabId, tab);
            }
        });

        // Listen for download completion
        chrome.downloads.onChanged.addListener((downloadDelta) => {
            this.handleDownloadChange(downloadDelta);
        });
    }

    onInstall() {
        console.log('xTaste extension installed');
        
        // Initialize storage with default values
        chrome.storage.local.set({
            posts: [],
            loadingState: 'idle',
            settings: {
                autoScroll: true,
                scrollDelay: 2000,
                maxConsecutiveNoNewPosts: 5
            }
        });

        // Open welcome page or show notification
        this.showInstallationNotification();
    }

    onUpdate(previousVersion) {
        console.log(`xTaste extension updated from ${previousVersion}`);
        
        // Handle any migration logic here if needed
        this.migrateDataIfNeeded(previousVersion);
    }

    async migrateDataIfNeeded(previousVersion) {
        try {
            // Add any data migration logic for future updates
            console.log('Checking for data migration...');
            
            // Example: Migrate from old storage format
            const result = await chrome.storage.local.get(['posts']);
            if (result.posts && Array.isArray(result.posts)) {
                // Ensure all posts have required fields
                const migratedPosts = result.posts.map(post => ({
                    url: post.url || '',
                    username: post.username || 'unknown',
                    displayName: post.displayName || post.username || 'Unknown User',
                    avatar: post.avatar || '',
                    content: post.content || '',
                    media: post.media || [],
                    timestamp: post.timestamp || new Date().toISOString(),
                    scrapedAt: post.scrapedAt || new Date().toISOString(),
                    ...post
                }));
                
                await chrome.storage.local.set({ posts: migratedPosts });
            }
        } catch (error) {
            console.error('Error during migration:', error);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_STORAGE_DATA':
                    const data = await chrome.storage.local.get(null);
                    sendResponse({ success: true, data });
                    break;

                case 'CLEAR_STORAGE':
                    await chrome.storage.local.clear();
                    await chrome.storage.local.set({
                        posts: [],
                        loadingState: 'idle'
                    });
                    sendResponse({ success: true });
                    break;

                case 'EXPORT_DATA':
                    const exportData = await this.exportUserData();
                    sendResponse({ success: true, data: exportData });
                    break;

                case 'IMPORT_DATA':
                    await this.importUserData(message.data);
                    sendResponse({ success: true });
                    break;

                case 'GET_TAB_INFO':
                    const tab = await this.getCurrentTab();
                    sendResponse({ success: true, tab });
                    break;

                default:
                    console.log('Unknown message type:', message.type);
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async handleTabUpdate(tabId, tab) {
        // Check if the tab is on X/Twitter likes page
        if (tab.url && (tab.url.includes('x.com') || tab.url.includes('twitter.com')) && tab.url.includes('/likes')) {
            // Tab is on likes page - extension is ready to use
            this.updateBadge(tabId, 'ready');
        } else if (tab.url && (tab.url.includes('x.com') || tab.url.includes('twitter.com'))) {
            // Tab is on X/Twitter but not likes page
            this.updateBadge(tabId, 'warning');
        } else {
            // Tab is not on X/Twitter
            this.updateBadge(tabId, 'inactive');
        }
    }

    updateBadge(tabId, status) {
        switch (status) {
            case 'ready':
                chrome.action.setBadgeText({ text: '✓', tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#00ba7c', tabId });
                break;
            case 'warning':
                chrome.action.setBadgeText({ text: '!', tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b', tabId });
                break;
            case 'loading':
                chrome.action.setBadgeText({ text: '⟳', tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0', tabId });
                break;
            default:
                chrome.action.setBadgeText({ text: '', tabId });
        }
    }

    handleDownloadChange(downloadDelta) {
        if (downloadDelta.state && downloadDelta.state.current === 'complete') {
            if (downloadDelta.filename && downloadDelta.filename.current.includes('xTaste-likes-')) {
                this.showDownloadSuccessNotification();
            }
        } else if (downloadDelta.state && downloadDelta.state.current === 'interrupted') {
            console.error('Download failed:', downloadDelta);
        }
    }

    async getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }

    async exportUserData() {
        const data = await chrome.storage.local.get(null);
        return {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            posts: data.posts || [],
            settings: data.settings || {}
        };
    }

    async importUserData(importData) {
        if (!importData || !importData.posts) {
            throw new Error('Invalid import data');
        }

        // Validate and merge imported posts
        const existingData = await chrome.storage.local.get(['posts']);
        const existingPosts = existingData.posts || [];
        
        // Merge posts and remove duplicates
        const allPosts = [...existingPosts, ...importData.posts];
        const uniquePosts = [];
        const seenUrls = new Set();
        
        allPosts.forEach(post => {
            if (post.url && !seenUrls.has(post.url)) {
                seenUrls.add(post.url);
                uniquePosts.push(post);
            }
        });

        await chrome.storage.local.set({
            posts: uniquePosts,
            settings: { ...importData.settings }
        });
    }

    showInstallationNotification() {
        // This would show a notification, but Chrome extensions have limited notification capabilities
        // In a real extension, you might want to open a welcome tab or show the popup
        console.log('xTaste extension is ready! Navigate to your X/Twitter likes page to get started.');
    }

    showDownloadSuccessNotification() {
        console.log('HTML file downloaded successfully!');
    }
}

// Initialize the background script
new XTasteBackground();
