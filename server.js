const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 预设的广告类别
const AD_CATEGORIES = [
  "Art & Entertainment", "Automobile", "Business & Finance", "Career", "Education", "Family & parenting",
  "Food & Beverage", "Health & Fitness", "Hobbies & Interests", "Home & Gardening", "Legal, Government & Politics","News", "Personal Finance", "Pet", "Real Estate", "Science", "Shopping", "Society", "Sports", "Style & Fashion", "Technology & Computing", "Travel", "Weather"
];

// 封装 LLM 调用逻辑
async function callLLM(prompt) {
    // 安全更新：从环境变量中读取 API Key
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
        throw new Error("API Key 未设置");
    }

    const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`, // 使用从环境变量获取的 Key
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
        throw new Error("LLM 服务返回错误");
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
}

// API 1: 获取广告类别
app.post("/api/get-category", async (req, res) => {
  try {
    const { gender, age, location } = req.body;
    if (!gender || age == null) {
      return res.status(400).json({ error: "请求中缺少性别或年龄参数。" });
    }

    let userInfoForPrompt = `一位约 ${age} 岁的${gender}`;
    if (location) {
      userInfoForPrompt = `来自 ${location} 的` + userInfoForPrompt;
    }

    const categoryPrompt = `为${userInfoForPrompt}，从以下列表中选择一个最相关的广告类别: [${AD_CATEGORIES.join(", ")}]。请只返回类别名称。`;
    let selectedCategory = await callLLM(categoryPrompt);
    selectedCategory = AD_CATEGORIES.find(c => selectedCategory.includes(c)) || "购物";
    
    res.json({ category: selectedCategory });

  } catch (err) {
    console.error("选择类别失败:", err);
    res.status(500).json({ error: "服务器内部错误" });
  }
});

// API 2: 根据类别生成广告语
app.post("/api/get-ad", async (req, res) => {
    try {
        const { gender, age, location, category } = req.body;
        if (!gender || age == null || !category) {
            return res.status(400).json({ error: "请求中缺少性别、年龄或类别参数。" });
        }

        let userInfoForPrompt = `一位约 ${age} 岁的${gender}`;
        if (location) {
            userInfoForPrompt = `来自 ${location} 的` + userInfoForPrompt;
        }

        const adPrompt = `请为${userInfoForPrompt}，生成一条关于“${category}”的广告语。第一句是广告语，第二句是具有引导/转化性质的具体内容，旨在引导用户进行下一步行动比如：购买、下载、注册、访问等等。要求：现代、有吸引力，30词左右的英文。仅显示广告主体本身。不要显示Prompt中的无关信息`;
        const adContent = await callLLM(adPrompt);

        res.json({ ad: adContent || `探索${category}的无限可能！` });

    } catch (err) {
        console.error("生成广告语失败:", err);
        res.status(500).json({ error: "服务器内部错误" });
    }
});


// 获取地理位置 API
app.get("/api/location", async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        if (!ip || ip === "::1" || ip === "127.0.0.1") {
             return res.json({ city: '开发环境', country: '本地网络' });
        }

        const response = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            res.json({ 
                city: data.city || 'Unknown City', 
                country: data.country || 'Unknown Country' 
            });
        } else {
            res.json({ city: 'Unknown City', country: 'Unknown Country' });
        }
    } catch (error) {
        console.error('获取地理位置失败:', error);
        res.status(500).json({ city: '错误', country: '获取失败' });
    }
});


app.listen(PORT, () => {
  console.log(`服务器正在运行于 http://localhost:${PORT}`);
});
