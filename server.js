const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 中文广告类别
const AD_CATEGORIES = [
    "艺术与娱乐", "汽车", "商业与金融", "职业", "教育", "家庭与育儿",
    "食品与饮料", "健康与健身", "爱好与兴趣", "家居与园艺", "法律、政府与政治",
    "新闻", "个人理财", "宠物", "房地产", "科学", "购物", "社会",
    "体育", "风格与时尚", "技术与计算", "旅游", "天气"
];

async function callLLM(prompt) {
    const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": "Bearer sk-xrvqhapeipffppuyabhkzsflhjddtevhxbcqvpwjvwpwrxkn", // 记得替换成您的 API Key
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
        console.error("LLM API 错误:", errorText);
        throw new Error("大语言模型服务返回错误");
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
}

app.post("/api/get-category", async (req, res) => {
    try {
        const { gender, age, location } = req.body;
        if (!gender || age == null) {
            return res.status(400).json({ error: "请求缺少性别或年龄参数" });
        }

        let userInfoForPrompt = `一位${age}岁左右的${gender}`;
        if (location) {
            userInfoForPrompt += `，来自${location}`;
        }

        const categoryPrompt = `为${userInfoForPrompt}，从以下列表中选择一个最相关的广告类别：[${AD_CATEGORIES.join(", ")}]。只返回类别名称。`;
        let selectedCategory = await callLLM(categoryPrompt);
        
        // 确保返回的是列表中的有效类别
        selectedCategory = AD_CATEGORIES.find(c => selectedCategory.includes(c)) || "购物";

        res.json({ category: selectedCategory });

    } catch (err) {
        console.error("选择类别失败:", err);
        res.status(500).json({ error: "服务器内部错误" });
    }
});

app.post("/api/get-ad", async (req, res) => {
    try {
        const { gender, age, location, category } = req.body;
        if (!gender || age == null || !category) {
            return res.status(400).json({ error: "请求缺少性别、年龄或类别参数" });
        }

        let userInfoForPrompt = `一位${age}岁左右的${gender}`;
        if (location) {
            userInfoForPrompt += `，来自${location}`;
        }

        const adPrompt = `为“${category}”类别，创作一条现代、有吸引力的广告语，目标用户是${userInfoForPrompt}。要求25个字以内。`;
        const adContent = await callLLM(adPrompt);

        res.json({ ad: adContent || `探索“${category}”的无限可能！` });

    } catch (err) {
        console.error("生成广告语失败:", err);
        res.status(500).json({ error: "服务器内部错误" });
    }
});

app.get("/api/location", async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // 如果是本地开发环境，返回一个默认值
        if (!ip || ip === "::1" || ip === "12.7.0.0.1") {
             return res.json({ city: '本地网络', country: '开发环境' });
        }

        const response = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`);
        const data = await response.json();
        
        if (data.status === 'success') {
            res.json({ 
                city: data.city || '未知城市', 
                country: data.country || '未知国家' 
            });
        } else {
            res.json({ city: '未知', country: '地区' });
        }
    } catch (error) {
        console.error('获取地理位置失败:', error);
        res.status(500).json({ city: '错误', country: '获取失败' });
    }
});

app.listen(PORT, () => {
  console.log(`服务器正在 http://localhost:${PORT} 运行`);
});
