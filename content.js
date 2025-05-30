class XTasteContentScript {
    constructor() {
        this.posts = [];
        this.isLoading = false;
        this.isPaused = false;
        this.scrollCount = 0;
        this.lastPostCount = 0;
        this.consecutiveNoNewPosts = 0;
        this.maxConsecutiveNoNewPosts = 5;
        
        this.setupMessageListener();
        this.loadStoredPosts();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                switch (message.type) {
                    case 'START_LOADING':
                        this.startLoading();
                        sendResponse({ success: true });
                        break;
                    case 'STOP_LOADING':
                        this.stopLoading();
                        sendResponse({ success: true });
                        break;
                    case 'RESUME_LOADING':
                        this.resumeLoading();
                        sendResponse({ success: true });
                        break;
                    case 'GET_POSTS':
                        sendResponse({ posts: this.posts });
                        break;
                    case 'PING':
                        sendResponse({ success: true, ready: true });
                        break;
                    case 'RESET_POSTS':
                        this.posts = [];
                        this.savePostsToStorage();
                        sendResponse({ success: true });
                        break;
                    default:
                        sendResponse({ success: false, error: 'Unknown message type' });
                }
            } catch (error) {
                console.error('Error handling message:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true; // Keep message channel open for async response
        });
    }

    async loadStoredPosts() {
        try {
            const result = await chrome.storage.local.get(['posts']);
            this.posts = result.posts || [];
        } catch (error) {
            console.error('Error loading stored posts:', error);
        }
    }

    async savePostsToStorage() {
        try {
            await chrome.storage.local.set({ posts: this.posts });
        } catch (error) {
            console.error('Error saving posts:', error);
        }
    }

    async updateLoadingState(state) {
        try {
            await chrome.storage.local.set({ loadingState: state });
        } catch (error) {
            console.error('Error updating loading state:', error);
        }
    }

    async startLoading() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.isPaused = false;
        this.consecutiveNoNewPosts = 0;
        
        await this.updateLoadingState('loading');
        
        // Notify popup about state change
        this.sendMessage('LOADING_STARTED', { totalPosts: this.posts.length });
        
        console.log('Starting to load liked posts...');
        this.loadPosts();
    }

    async stopLoading() {
        this.isLoading = false;
        this.isPaused = true;
        
        await this.updateLoadingState('paused');
        
        console.log('Loading stopped');
        this.sendMessage('LOADING_STOPPED', { totalPosts: this.posts.length });
    }

    async resumeLoading() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.isPaused = false;
        this.consecutiveNoNewPosts = 0;
        
        await this.updateLoadingState('loading');
        
        // Notify popup about state change
        this.sendMessage('LOADING_RESUMED', { totalPosts: this.posts.length });
        
        console.log('Resuming loading...');
        this.loadPosts();
    }

    async loadPosts() {
        let noNewContentCount = 0;
        const maxNoNewContent = 5; // Allow 5 scrolls without new content before stopping
        
        // Get total liked posts count from the page
        const totalLikedPosts = this.getTotalLikedPostsCount();
        console.log(`Total liked posts available: ${totalLikedPosts}`);
        
        while (this.isLoading && !this.isPaused) {
            const currentPosts = this.scrapePosts();
            const newPostsCount = currentPosts.length;
            
            console.log(`Scraped ${newPostsCount} posts, current total: ${this.posts.length}`);
            
            // Merge new posts with existing posts (avoid duplicates)
            const mergedPosts = this.mergePosts(this.posts, currentPosts);
            const previousTotal = this.posts.length;
            this.posts = mergedPosts;
            await this.savePostsToStorage();

            const actualNewPosts = this.posts.length - previousTotal;
            console.log(`Added ${actualNewPosts} new posts. Total: ${this.posts.length}`);

            // Send progress update
            const progressPercentage = totalLikedPosts > 0 
                ? Math.min((this.posts.length / totalLikedPosts) * 100, 100)
                : Math.min((this.scrollCount / 50) * 100, 90);
                
            this.sendMessage('PROGRESS_UPDATE', {
                postsLoaded: this.posts.length,
                progress: progressPercentage,
                totalExpected: totalLikedPosts
            });

            // Check if we found new posts
            if (actualNewPosts === 0) {
                this.consecutiveNoNewPosts++;
                console.log(`No new posts found. Consecutive count: ${this.consecutiveNoNewPosts}`);
            } else {
                console.log(`Found ${actualNewPosts} new posts!`);
                this.consecutiveNoNewPosts = 0;
                noNewContentCount = 0; // Reset the no content counter when we find new posts
            }

            // Scroll down to load more posts
            const scrollResult = await this.scrollDown();
            this.scrollCount++;

            // Check if we've reached the total posts limit or no new content is loading
            if (totalLikedPosts > 0 && this.posts.length >= totalLikedPosts) {
                console.log(`Reached total liked posts limit: ${this.posts.length}/${totalLikedPosts}`);
                break;
            }

            if (scrollResult.reachedBottom && !scrollResult.newContentLoaded) {
                noNewContentCount++;
                console.log(`Reached bottom with no new content. Count: ${noNewContentCount}`);
                
                if (noNewContentCount >= maxNoNewContent) {
                    console.log('No new content loading after multiple attempts. Completing...');
                    break;
                }
            } else if (scrollResult.newContentLoaded) {
                noNewContentCount = 0; // Reset if new content was loaded
            }

            // Also check the consecutive no new posts limit
            if (this.consecutiveNoNewPosts >= this.maxConsecutiveNoNewPosts) {
                console.log('Reached maximum consecutive no-new-posts limit. Completing...');
                break;
            }

            // Wait a bit before next iteration
            await this.sleep(1500);
        }

        if (this.isLoading) {
            // Loading completed naturally
            this.isLoading = false;
            await this.updateLoadingState('completed');
            
            console.log(`Loading completed! Total posts: ${this.posts.length}`);
            this.sendMessage('LOADING_COMPLETE', { totalPosts: this.posts.length });
        }
    }

    getTotalLikedPostsCount() {
        try {
            // Try the provided XPath
            const xpath = '/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/div/div/div/div/div[2]/div/div';
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            let element = result.singleNodeValue;
            
            // If XPath doesn't work, try alternative selectors
            if (!element) {
                // Try different selectors that might contain the likes count
                const selectors = [
                    '[data-testid="UserProfileHeader_Items"] div:contains("Beğeni")',
                    '[data-testid="UserProfileHeader_Items"] div:contains("Likes")',
                    'div[role="tablist"] div:contains("Beğeni")',
                    'div[role="tablist"] div:contains("Likes")'
                ];
                
                for (const selector of selectors) {
                    try {
                        if (selector.includes(':contains')) {
                            // Handle pseudo-selector manually
                            const baseSelector = selector.split(':contains')[0];
                            const searchText = selector.match(/\("([^"]+)"\)/)?.[1];
                            const elements = document.querySelectorAll(baseSelector);
                            
                            for (const el of elements) {
                                if (el.textContent.includes(searchText)) {
                                    element = el;
                                    break;
                                }
                            }
                        } else {
                            element = document.querySelector(selector);
                        }
                        
                        if (element) break;
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            if (!element) {
                console.log('Could not find likes count element');
                return 0;
            }
            
            const text = element.textContent.trim();
            console.log(`Found likes count text: "${text}"`);
            
            // Extract numeric value - for format like "23,3 B Beğeni"
            const match = text.match(/([0-9]+(?:,\d+)?)/);
            
            if (!match) {
                console.log('Could not parse likes count from text');
                return 0;
            }
            
            const numericPart = match[1]; // e.g., "23,3"
            
            let number;
            
            // If there's a comma, treat it as decimal separator and multiply by 1000
            // Turkish format: 23,3 means 23.3 thousand = 23,300
            if (numericPart.includes(',')) {
                // Replace comma with dot for decimal parsing, then multiply by 1000
                const decimalNumber = parseFloat(numericPart.replace(',', '.'));
                number = decimalNumber * 1000;
            } else {
                number = parseFloat(numericPart);
            }
            
            const totalCount = Math.floor(number);
            console.log(`Parsed total liked posts count: ${totalCount} (from "${numericPart}"${numericPart.includes(',') ? ' - treated as thousands' : ''})`);
            return totalCount;
            
        } catch (error) {
            console.error('Error getting total liked posts count:', error);
            return 0;
        }
    }

    scrapePosts() {
        const posts = [];
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        
        articles.forEach((article, index) => {
            try {
                const post = this.extractPostData(article);
                if (post && post.url) {
                    posts.push(post);
                }
            } catch (error) {
                console.error(`Error extracting post ${index}:`, error);
            }
        });

        // Remove duplicates based on URL
        const uniquePosts = [];
        const seenUrls = new Set();
        
        posts.forEach(post => {
            if (!seenUrls.has(post.url)) {
                seenUrls.add(post.url);
                uniquePosts.push(post);
            }
        });

        return uniquePosts;
    }

    mergePosts(existingPosts, newPosts) {
        // Create a map of existing posts by URL for fast lookup
        const existingPostsMap = new Map();
        existingPosts.forEach(post => {
            existingPostsMap.set(post.url, post);
        });

        // Add new posts that don't already exist
        const mergedPosts = [...existingPosts];
        let addedCount = 0;

        newPosts.forEach(newPost => {
            if (!existingPostsMap.has(newPost.url)) {
                mergedPosts.push(newPost);
                existingPostsMap.set(newPost.url, newPost);
                addedCount++;
            }
        });

        console.log(`Merged posts: ${addedCount} new, ${mergedPosts.length} total`);
        return mergedPosts;
    }

    extractPostData(article) {
        try {
            // Extract tweet URL
            const timeElement = article.querySelector('time');
            const linkElement = timeElement?.closest('a');
            const url = linkElement?.href;

            if (!url) return null;

            // Extract user information
            const userLink = article.querySelector('a[role="link"]');
            const displayNameElement = article.querySelector('[data-testid="User-Name"] span');
            const usernameMatch = userLink?.href?.match(/\/([^\/]+)$/);
            const username = usernameMatch ? usernameMatch[1] : '';

            // Extract avatar
            const avatarImg = article.querySelector('img[alt]');
            const avatar = avatarImg?.src;

            // Extract tweet content
            const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
            const content = tweetTextElement?.textContent || '';

            // Extract media
            const media = [];
            const mediaImages = article.querySelectorAll('[data-testid="tweetPhoto"] img');
            mediaImages.forEach(img => {
                if (img.src && !img.src.includes('placeholder')) {
                    media.push(img.src);
                }
            });

            // Extract timestamp
            const timestamp = timeElement?.getAttribute('datetime');

            return {
                url: url,
                username: username,
                displayName: displayNameElement?.textContent || username,
                avatar: avatar,
                content: content,
                media: media,
                timestamp: timestamp,
                scrapedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error extracting post data:', error);
            return null;
        }
    }

    async scrollDown() {
        return new Promise((resolve) => {
            const beforeScrollHeight = document.documentElement.scrollHeight;
            const beforeScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            console.log(`Before scroll - Height: ${beforeScrollHeight}, Top: ${beforeScrollTop}`);
            
            // Scroll to absolute bottom with multiple methods for better compatibility
            const scrollToBottom = () => {
                // Method 1: Scroll to maximum height
                window.scrollTo(0, document.documentElement.scrollHeight);
                
                // Method 2: Scroll the document element
                document.documentElement.scrollTop = document.documentElement.scrollHeight;
                
                // Method 3: Scroll the body element  
                document.body.scrollTop = document.body.scrollHeight;
            };
            
            // Initial scroll
            scrollToBottom();

            // Wait for initial scroll and new content to load
            setTimeout(async () => {
                // Give time for new content to load (Twitter loads content dynamically)
                await this.sleep(3000);
                
                // Try scrolling again to make sure we're at the absolute bottom
                scrollToBottom();
                await this.sleep(1000);
                
                const afterScrollHeight = document.documentElement.scrollHeight;
                const afterScrollTop = Math.max(
                    window.pageYOffset || 0,
                    document.documentElement.scrollTop || 0,
                    document.body.scrollTop || 0
                );
                
                console.log(`After scroll - Height: ${afterScrollHeight}, Top: ${afterScrollTop}`);
                
                // Check if we're truly at the bottom (within 50px tolerance)
                const isAtBottom = (afterScrollTop + window.innerHeight >= afterScrollHeight - 50);
                const newContentLoaded = (afterScrollHeight > beforeScrollHeight + 10);
                
                console.log(`At bottom: ${isAtBottom}, New content loaded: ${newContentLoaded}`);
                
                // If we're not at bottom and there's new content, try one more aggressive scroll
                if (!isAtBottom && newContentLoaded) {
                    console.log('Doing final scroll to ensure we reach bottom...');
                    scrollToBottom();
                    await this.sleep(1500);
                }
                
                const finalScrollHeight = document.documentElement.scrollHeight;
                const finalScrollTop = Math.max(
                    window.pageYOffset || 0,
                    document.documentElement.scrollTop || 0,
                    document.body.scrollTop || 0
                );
                const finalIsAtBottom = (finalScrollTop + window.innerHeight >= finalScrollHeight - 50);
                const finalNewContentLoaded = (finalScrollHeight > beforeScrollHeight + 10);
                
                console.log(`Final - Height: ${finalScrollHeight}, Top: ${finalScrollTop}, At bottom: ${finalIsAtBottom}, New content: ${finalNewContentLoaded}`);
                
                resolve({
                    reachedBottom: finalIsAtBottom,
                    newContentLoaded: finalNewContentLoaded,
                    scrollHeight: finalScrollHeight
                });
            }, 1500);
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    sendMessage(type, data) {
        try {
            chrome.runtime.sendMessage({ type, data });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }
}

// Initialize when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.xTasteContentScript) {
            window.xTasteContentScript = new XTasteContentScript();
        }
    });
} else {
    if (!window.xTasteContentScript) {
        window.xTasteContentScript = new XTasteContentScript();
    }
}
