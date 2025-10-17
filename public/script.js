document.addEventListener('DOMContentLoaded', () => {
    // --- 阶段与元素获取 ---
    const stages = {
        agree: document.getElementById('agree-stage'),
        main: document.getElementById('main-stage'),
    };
    const agreeButton = document.getElementById('agreeButton');
    const videoContainer = document.getElementById('video-container');
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const snapshotImage = document.getElementById('snapshot');
    const countdownOverlay = document.getElementById('countdown-overlay');
    const countdownText = document.getElementById('countdown-text');
    const retryButton = document.getElementById('retryButton');
    
    // --- 信息显示元素 ---
    const genderBox = document.getElementById('gender-box');
    const ageBox = document.getElementById('age-box');
    const locationBox = document.getElementById('location-box');
    const categoryBox = document.getElementById('category-box');
    const adBox = document.getElementById('ad-box');
    
    let modelsLoaded = false;
    let detectionInterval = null;
    let locationInfo = { city: '获取中', country: '地区...' };

    // --- 初始化 ---
    function initialize() {
        stages.agree.classList.add('active');
        stages.main.classList.remove('active');
        loadModels();
    }

    // --- 模型加载 ---
    async function loadModels() {
        try {
            updateInfoBox(locationBox, '正在加载AI模型...');
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
                faceapi.nets.ageGenderNet.loadFromUri('/models'),
            ]);
            modelsLoaded = true;
            updateInfoBox(locationBox, '模型加载成功');
            fetchLocation(); // 模型加载后获取地理位置
        } catch (error) {
            console.error("模型加载失败:", error);
            updateInfoBox(locationBox, '模型加载失败', true);
        }
    }

    // --- 地理位置获取 ---
    async function fetchLocation() {
        try {
            updateInfoBox(locationBox, '正在获取地理位置...');
            const response = await fetch('/api/location');
            if (!response.ok) throw new Error('网络响应错误');
            const data = await response.json();
            locationInfo = data;
            updateInfoBox(locationBox, `${data.country}, ${data.city}`);
        } catch (error) {
            console.error('获取地理位置失败:', error);
            updateInfoBox(locationBox, '位置获取失败', true);
            locationInfo = { city: '未知', country: '未知' };
        }
    }

    // --- 用户同意后启动 ---
    agreeButton.addEventListener('click', () => {
        stages.agree.classList.remove('active');
        stages.main.classList.add('active');
        startCameraAndDetection();
    });

    // --- 摄像头与识别逻辑 ---
    async function startCameraAndDetection() {
        if (!modelsLoaded) {
            alert('AI模型尚未加载完成，请稍候...');
            return;
        }
        resetUI();
        snapshotImage.style.display = 'none';
        video.style.display = 'block';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
            video.srcObject = stream;
        } catch (err) {
            console.error("无法访问摄像头:", err);
            alert('无法访问摄像头，请检查权限设置。');
        }

        detectionInterval = setInterval(async () => {
            const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
            if (detections) {
                clearInterval(detectionInterval);
                detectionInterval = null;
                startCountdown(detections);
            }
        }, 500);
    }

    // --- 倒计时逻辑 ---
    function startCountdown(detectionData) {
        let count = 3;
        countdownOverlay.style.display = 'flex';
        countdownText.textContent = `准备！${count}`;
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownText.textContent = count;
            } else {
                clearInterval(countdownInterval);
                countdownOverlay.style.display = 'none';
                processUserData(detectionData);
            }
        }, 1000);
    }

    // --- 处理数据并调用API ---
    async function processUserData(detection) {
        // 1. 截取快照并停止视频流
        const snapshotCanvas = document.createElement('canvas');
        snapshotCanvas.width = video.videoWidth;
        snapshotCanvas.height = video.videoHeight;
        snapshotCanvas.getContext('2d').drawImage(video, 0, 0);
        snapshotImage.src = snapshotCanvas.toDataURL('image/png');
        snapshotImage.style.display = 'block';
        video.style.display = 'none';
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        // 2. 更新基本信息
        const gender = detection.gender === 'male' ? '男性' : '女性';
        const age = Math.round(detection.age);
        updateInfoBox(genderBox, gender);
        updateInfoBox(ageBox, `约 ${age} 岁`);
        
        const userData = { gender, age, location: `${locationInfo.country}, ${locationInfo.city}` };

        try {
            // 3. 获取广告类别
            updateInfoBox(categoryBox, '正在分析类别...');
            const categoryResponse = await fetch('/api/get-category', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
            });
            if (!categoryResponse.ok) throw new Error('获取类别失败');
            const { category } = await categoryResponse.json();
            updateInfoBox(categoryBox, category);

            // 4. 获取广告内容
            updateInfoBox(adBox, '正在生成内容...');
            const adResponse = await fetch('/api/get-ad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...userData, category }),
            });
            if (!adResponse.ok) throw new Error('获取广告失败');
            const { ad } = await adResponse.json();
            updateInfoBox(adBox, ad);

        } catch (error) {
            console.error("API调用失败:", error);
            updateInfoBox(categoryBox, "分析失败", true);
            updateInfoBox(adBox, "生成失败", true);
        } finally {
            retryButton.style.display = 'block';
        }
    }
    
    // --- UI 更新与重置 ---
    function updateInfoBox(element, text, isError = false) {
        element.textContent = text;
        if (isError) element.classList.add('error');
        else element.classList.remove('error');
    }
    
    function resetUI() {
        const boxes = [genderBox, ageBox, locationBox, categoryBox, adBox];
        boxes.forEach(box => updateInfoBox(box, '---'));
        retryButton.style.display = 'none';
        fetchLocation();
    }

    // --- 重试按钮 ---
    retryButton.addEventListener('click', startCameraAndDetection);

    // --- 初始化页面 ---
    initialize();
});
