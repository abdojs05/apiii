const express = require('express');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

app.use(express.json());

async function shortenUrl(url) {
    if (!url) {
        throw new Error("Please provide a URL or link to shorten.");
    }

    try {
        const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 5000 });
        if (!response.ok) {
            throw new Error("Error: Could not generate a short URL.");
        }

        return response.text();
    } catch (error) {
        console.error('Error shortening URL:', error);
        throw error;
    }
}

async function fetchDownloadType(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Error fetching the page.');
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const downloadTextElement = $('span.download-text.one-line');

        if (downloadTextElement.length > 0) {
            const downloadText = downloadTextElement.text().trim();

            if (downloadText.includes('Download APK')) {
                return 'apk';
            } else if (downloadText.includes('Download XAPK')) {
                return 'xapk';
            }
        }
        return 'Text not found';
    } catch (error) {
        console.error('Error fetching the page:', error);
        return 'Error';
    }
}

const Proxy = (url) => url ? `https://translate.google.com/translate?sl=en&tl=fr&hl=en&u=${encodeURIComponent(url)}&client=webapp` : '';

const api = (ID, path = '/', query = {}) => {
    const baseURL = ID;
    const queryString = new URLSearchParams(Object.entries(query)).toString();
    return baseURL + path + (queryString ? '?' + queryString : '');
};

const formatFileSize = (bytes) => {
    if (bytes >= 1_000_000_000_000) {
        return (bytes / 1_000_000_000_000).toFixed(2) + ' TB';
    } else if (bytes >= 1_000_000_000) {
        return (bytes / 1_000_000_000).toFixed(2) + ' GB';
    } else if (bytes >= 1_000_000) {
        return (bytes / 1_000_000).toFixed(2) + ' MB';
    } else if (bytes >= 1_000) {
        return (bytes / 1_000).toFixed(2) + ' KB';
    } else {
        return bytes + ' bytes';
    }
};

const fetchFileSize = async (url) => {
    try {
        const response = await fetch(url, { method: 'HEAD', timeout: 5000 });

        if (!response.ok) {
            throw new Error('Error fetching file size.');
        }

        const contentLength = response.headers.get('Content-Length');
        return contentLength ? formatFileSize(parseInt(contentLength, 10)) : 'Unknown size';
    } catch (error) {
        console.error('Error fetching file size:', error);
        return 'Error';
    }
};

const formatApp = async (fullDownloadUrl) => {
    try {
        const proxiedUrl = Proxy(api(fullDownloadUrl));
        const downloadType = await fetchDownloadType(proxiedUrl);
        return downloadType;
    } catch (error) {
        console.error('Error formatting app:', error);
        return 'Error';
    }
};

app.get('/api/apkpure', async (req, res) => {
    const query = req.query.q;
    const formattedQuery = encodeURIComponent(query);
    const url = `https://apkpure.com/api/v1/search_suggestion_new?key=${formattedQuery}&limit=20`;

    try {
        const response = await fetch(url, { timeout: 5000 });
        if (!response.ok) {
            throw new Error('Failed to fetch app data');
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Unexpected data format');
        }

        const appDataPromises = data.map(async (app) => {
            if (app.title && app.packageName && app.version && app.installTotal && app.score && app.fullDownloadUrl && app.icon) {
                const img = await shortenUrl(app.icon);
                const downloadType = await formatApp(app.fullDownloadUrl);

                let proxiedUrl;
                if (downloadType === 'xapk') {
                    proxiedUrl = await shortenUrl(`https://translate.google.com/translate?sl=en&tl=fr&hl=en&client=webapp&u=https://d.apkpure.com/b/XAPK/${app.packageName}?version=latest`);
                } else if (downloadType === 'apk') {
                    proxiedUrl = await shortenUrl(`https://translate.google.com/translate?sl=en&tl=fr&hl=en&client=webapp&u=https://d.apkpure.com/b/APK/${app.packageName}?version%3Dlatest`);
                } else {
                    proxiedUrl = await shortenUrl(`https://translate.google.com/translate?sl=en&tl=fr&hl=en&client=webapp&u=https://d.apkpure.com/b/APK/${app.packageName}?version%3Dlatest`);
                }

                const fileSize = await fetchFileSize(proxiedUrl);

                return {
                    title: app.title,
                    packageName: app.packageName,
                    version: app.version,
                    installTotal: app.installTotal,
                    score: app.score,
                    downloadUrl: proxiedUrl,
                    icon: img,
                    fileSize: fileSize,
                    downloadType: downloadType
                };
            }
        });

        const appData = await Promise.all(appDataPromises);
        const filteredAppData = appData.filter(item => item !== undefined);

        res.json(filteredAppData);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'An error occurred while fetching app data' });
    }
});

app.get('/', (req, res) => {
    res.send('Use /api/apkpure?q=<query> to search for app data.');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
