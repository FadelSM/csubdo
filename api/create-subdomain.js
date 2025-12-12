const GITHUB_TOKEN = "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";
const GITHUB_OWNER = "FadelSM";
const GITHUB_REPO = "api-pterogw";

const SUBDOMAIN_CONFIG = {
    "vortexx.web.id": {
        zone: "c18b51c25edcb0a1ed085a5db3dea175",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "kelazzz.biz.id": {
        zone: "0487158c5c8dbebdfcb2f53f20b3be6b",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "joomods.web.id": {
        zone: "87e098c925fd485d66d18807d7feb473",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "liinode.biz.id": {
        zone: "b8711da7208a687e9c2a85c94a710a04",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "blademoon.my.id": {
        zone: "451a7aecd42284d49f189b271d48fc2f",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "rezeemd.my.id": {
        zone: "493170047ee028aad6322f0da2f8e4af",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "pteroodctly.my.id": {
        zone: "",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "kaylapanel.my.id": {
        zone: "a5cd2c869d78330ab37790d283535b61",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    },
    "digitalzocean.biz.id": {
        zone: "25b80844e4f41eed83f47fa60ebd03e0",
        apitoken: "4Iv8vSQPpyjyoXcu2n4RaHWgpAQ4tj-vZh5jvmKX"
    }
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { subdomain, ip, domain } = req.body;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }
        
        const apiKey = authHeader.substring(7);
        
        if (!subdomain || !ip || !domain) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (!/^[a-zA-Z0-9-]+$/.test(subdomain)) {
            return res.status(400).json({ error: 'Invalid subdomain name' });
        }
        
        if (!isValidIP(ip)) {
            return res.status(400).json({ error: 'Invalid IP address' });
        }
        
        const user = await verifyApiKey(apiKey);
        if (!user) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
       
        const canCreate = await checkUserLimit(user.username);
        if (!canCreate) {
            return res.status(403).json({ error: 'Subdomain limit exceeded' });
        }
        
        const exists = await checkSubdomainExists(`${subdomain}.${domain}`);
        if (exists) {
            return res.status(409).json({ error: 'Subdomain already exists' });
        }
        
        const fullDomain = `${subdomain}.${domain}`;
        const success = await createCloudflareSubdomain(fullDomain, ip, domain);
        
        if (success) {
            await updateUserSubdomains(user.username, fullDomain, ip, domain);
            
            await sendTelegramNotification(`🆕 API subdomain created by ${user.username}\nDomain: ${fullDomain}\nIP: ${ip}`);
            
            return res.status(200).json({
                success: true,
                message: 'Subdomain created successfully',
                data: {
                    subdomain: fullDomain,
                    ip: ip
                }
            });
        } else {
            return res.status(500).json({ error: 'Failed to create subdomain' });
        }
        
    } catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

async function verifyApiKey(apiKey) {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/users`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) return null;
        
        const files = await response.json();
        
        for (const file of files) {
            if (file.name.endsWith('.json')) {
                const userResponse = await fetch(file.download_url);
                const userData = await userResponse.json();
                
                if (userData.apiKey === apiKey) {
                    return {
                        username: file.name.replace('.json', ''),
                        ...userData
                    };
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error verifying API key:', error);
        return null;
    }
}

async function checkUserLimit(username) {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/users/${username}.json`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!response.ok) return false;
        
        const userData = await response.json();
        const currentCount = userData.subdomains ? Object.keys(userData.subdomains).length : 0;
        
        return currentCount < 50; 
    } catch (error) {
        console.error('Error checking user limit:', error);
        return false;
    }
}

async function checkSubdomainExists(subdomain) {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!response.ok) return false;
        
        const usageData = await response.json();
        return usageData.subdomains && usageData.subdomains[subdomain];
    } catch (error) {
        console.error('Error checking subdomain existence:', error);
        return false;
    }
}

async function createCloudflareSubdomain(subdomain, ip, domain) {
    const config = SUBDOMAIN_CONFIG[domain];
    if (!config || !config.zone) {
        console.error('Domain configuration not found');
        return false;
    }
    
    try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${config.zone}/dns_records`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apitoken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'A',
                name: subdomain,
                content: ip,
                ttl: 300,
                proxied: false
            })
        });
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Cloudflare API error:', error);
        return false;
    }
}

async function updateUserSubdomains(username, subdomain, ip, domain) {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/users/${username}.json`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        const userData = await response.json();
        
        if (!userData.subdomains) {
            userData.subdomains = {};
        }
        
        userData.subdomains[subdomain] = {
            ip: ip,
            domain: domain,
            created: new Date().toISOString()
        };
        
        const shaResponse = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/users/${username}.json`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const shaData = await shaResponse.json();
        
        await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/users/${username}.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `API: Add subdomain ${subdomain}`,
                content: btoa(JSON.stringify(userData, null, 2)),
                sha: shaData.sha
            })
        });
 
        await updateUsageData(subdomain, username);
        
    } catch (error) {
        console.error('Error updating user subdomains:', error);
    }
}

async function updateUsageData(subdomain, username) {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        const usageData = await response.json();
        
        usageData.totalSubdomains++;
        usageData.subdomains[subdomain] = {
            owner: username,
            created: new Date().toISOString()
        };
        usageData.lastUpdated = new Date().toISOString();
        
        const shaResponse = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const shaData = await shaResponse.json();
        
        await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `API: Update usage data for ${subdomain}`,
                content: btoa(JSON.stringify(usageData, null, 2)),
                sha: shaData.sha
            })
        });
        
    } catch (error) {
        console.error('Error updating usage data:', error);
    }
}
 
 async function sendTelegramNotification(message) {
    try {
        await fetch(`https://api.telegram.org/bot8562086332:AAG-zkyhdmLzgQlwnvqsoDo1JgC72XBHMlE/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: '6433428707',
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('Error sending Telegram notification:', error);
    }
}
 
function isValidIP(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    return parts.every(part => {
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= 0 && num <= 255;
    });
}