const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 关键更新 ---
// 告诉 Express 我们部署在代理服务器后面，请信任 X-Forwarded-For 请求头。
// '1' 表示信任一层代理，这对于 Render, Heroku 等平台是标准配置。
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// (API 和 LLM 调用部分无需修改，保持原样)
const AD_CATEGORIES = [
  "艺术与娱乐", "汽车", "商业与金融", "职业", "教育", "家庭与育儿",
  "食品与饮料", "健康与健身", "爱好与兴趣", "家居与园艺", "法律、政府与政治",
  "新闻", "个人理财", "宠物", "房地产", "科学", "购物", "社会",
  "体育", "风格与时尚", "技术与计算", "旅游", "天气"
];

async function callLLM(prompt) {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
        throw new Error("API Key not set in environment variables.");
    }

    const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
            messages: [{ role: "user", content: prompt }],
            stream: false,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("LLM API Error:", errorText);
        throw new Error("LLM service returned an error");
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
}

app.post("/api/get-category", async (req, res) => {
    try {
        const { gender, age, location } = req.body;
        if (!gender || age == null) {
            return res.status(400).json({ error: "Request is missing gender or age." });
        }

        let userInfoForPrompt = `a ${gender}, around ${age} years old`;
        if (location) {
            userInfoForPrompt += ` from ${location}`;
        }

        const categoryPrompt = `For ${userInfoForPrompt}, pick the most relevant ad category from this list: [${AD_CATEGORIES.join(", ")}]. Return only the category name.`;
        let selectedCategory = await callLLM(categoryPrompt);
        selectedCategory = AD_CATEGORIES.find(c => selectedCategory.includes(c)) || "购物";

        res.json({ category: selectedCategory });

    } catch (err) {
        console.error("Failed to select category:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/get-ad", async (req, res) => {
    try {
        const { gender, age, location, category } = req.body;
        if (!gender || age == null || !category) {
            return res.status(400).json({ error: "Request is missing gender, age, or category." });
        }

        let userInfoForPrompt = `a ${gender}, around ${age} years old`;
        if (location) {
            userInfoForPrompt += ` from ${location}`;
        }

        const adPrompt = `Create a modern, appealing ad slogan for "${category}", targeted at ${userInfoForPrompt}. Keep it under 25 words.`;
        const adContent = await callLLM(adPrompt);

        res.json({ ad: adContent || `Explore the infinite possibilities of ${category}!` });

    } catch (err) {
        console.error("Failed to generate ad slogan:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});


// --- IP 地址识别 API (已更新并增加日志) ---
app.get("/api/location", async (req, res) => {
    try {
        // --- 关键修复：手动解析 X-Forwarded-For ---
        console.log("===== 正在尝试获取 IP 地址 =====");
        console.log("X-Forwarded-For Header:", req.headers['x-forwarded-for']);
        
        // X-Forwarded-For 包含一个 IP 列表，格式为: client, proxy1, proxy2
        // 我们需要的是第一个 IP (client)
        const xForwardedFor = req.headers['x-forwarded-for'];
        
        // 优先从 X-Forwarded-For 获取第一个 IP
        // 否则回退到 Express 解析的 req.ip (用于本地开发)
        const ipToQuery = xForwardedFor ? xForwardedFor.split(',')[0].trim() : req.ip;

        console.log(`最终决定查询的 IP: ${ipToQuery}`);
        // --- 修复结束 ---

        const ip = ipToQuery; // 使用我们新解析的 IP

        // 本地开发环境的判断依然保留 (并增强了对其它私有IP的判断)
        if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith('10.') || ip.startsWith('192.168.') || (ip.startsWith('172.') && (parseInt(ip.split('.')[1], 10) >= 16 && parseInt(ip.split('.')[1], 10) <= 31))) {
             console.log("检测为本地/私有 IP，返回 '开发环境'。");
             return res.json({ city: '开发环境', country: '本地网络' });
        }

        console.log(`正在查询 IP: ${ip} (使用 ip-api.com)`);
        const response = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await response.json();
        
        console.log("ip-api.com 响应:", data); // 记录来自 API 的响应
        
        if (data.status === 'success') {
            res.json({ 
                city: data.city || 'Unknown City', 
                country: data.country || 'Unknown Country' 
            });
        } else {
            // 如果 API 查询失败，也返回一个明确的信息
            console.log(`IP API 查询失败: ${data.message || 'Unknown error'}`);
            res.json({ city: 'Unknown', country: 'Location' });
        }
    } catch (error) {
        console.error('Failed to get location:', error);
        res.status(500).json({ city: 'Error', country: 'Failed to fetch' });
    }
});


app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});