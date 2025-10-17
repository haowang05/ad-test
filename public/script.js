document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const agreementOverlay = document.getElementById('agreement-overlay');
    const agreeButton = document.getElementById('agreeButton');
    const adText = document.getElementById('ad-text');
    const genderEl = document.getElementById('gender');
    const ageEl = document.getElementById('age');
    const categoryEl = document.getElementById('category');
    const locationEl = document.getElementById('location');
    const loaderLine = document.querySelector('.loader-line-container');
    const retryButton = document.getElementById('retryButton');
    const snapshotImage = document.getElementById('snapshot');
    const countdownOverlay = document.getElementById('countdown-overlay');
    const countdownText = document.getElementById('countdown-text');

    // --- 状态变量 ---
    let modelsLoaded = false;
    let detectionInterval;
    let userDetection = null; // 用于存储检测到的用户信息
    let isProcessing = false; // 综合状态锁，防止在倒计时或处理中重复触发

    // --- 初始化和模型加载 ---
    async function loadModels() {
        const MODEL_URL = '/models';
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
                faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
            ]);
            modelsLoaded = true;
            console.log("AI 模型加载完毕");
        } catch (error) {
            console.error("模型加载失败:", error);
            agreementOverlay.innerHTML = "<p>Can not load models, please refresh the page.</p>";
        }
    }
    
    // --- 摄像头与人脸识别 ---
    async function startVideo() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
            video.srcObject = stream;
        } catch (err) {
            console.error("Can not access camera:", err);
            adText.textContent = "Can not access camera, please check permissions.";
        }
    }

    function startFaceDetection() {
        if (!video.srcObject || isProcessing) return;
        const displaySize = { width: video.clientWidth, height: video.clientHeight };
        faceapi.matchDimensions(canvas, displaySize);

        detectionInterval = setInterval(async () => {
            if (isProcessing || !video.srcObject) return;

            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks(true)
                .withAgeAndGender();
            
            if (detections.length > 0 && !isProcessing) {
                isProcessing = true; // 锁定
                clearInterval(detectionInterval);
                userDetection = detections[0]; // 存储检测结果
                startCountdown(); // 开始倒计时
            }
        }, 500); // 降低检测频率，优化性能
    }

    // --- 新增：倒计时功能 ---
    function startCountdown() {
        let count = 3;
        countdownOverlay.style.display = 'flex';
        countdownText.textContent = count;

        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownText.textContent = count;
            } else {
                clearInterval(countdownInterval);
                countdownOverlay.style.display = 'none';
                processUserData(userDetection); // 倒计时结束，处理数据
            }
        }, 1000);
    }

    // --- 数据处理与两步 API 调用 ---
    async function processUserData(detection) {
        // 1. 停止视频流并截取快照
        const snapshotCanvas = document.createElement('canvas');
        snapshotCanvas.width = video.videoWidth;
        snapshotCanvas.height = video.videoHeight;
        snapshotCanvas.getContext('2d').drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
        snapshotImage.src = snapshotCanvas.toDataURL('image/png');

        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        
        video.style.display = 'none';
        canvas.style.display = 'none';
        snapshotImage.style.display = 'block';
        retryButton.style.display = 'block';

        const gender = detection.gender === 'male' ? 'Male' : 'Female';
        const age = Math.round(detection.age);
        genderEl.textContent = gender;
        ageEl.textContent = `About ${age} `;

        // --- 开始两步请求 ---
        loaderLine.style.display = 'block';
        
        // 2. 获取位置信息
        locationEl.textContent = "Loading...";
        const locationData = await fetchLocation();
        const adPayload = { gender, age };
        if (locationData.city && locationData.city !== 'Unknown' && locationData.city !== 'Unknown City') {
            adPayload.location = locationData.city;
            locationEl.textContent = `${locationData.country}, ${locationData.city}`;
        } else {
            locationEl.textContent = '----';
        }

        // 3. 第一步：获取类别并立即更新UI
        categoryEl.textContent = "Loading...";
        const categoryData = await fetchCategory(adPayload);
        if(categoryData.category) {
            categoryEl.textContent = categoryData.category;
            adPayload.category = categoryData.category; // 将获取到的类别加入payload，用于下一步
        } else {
            categoryEl.textContent = "Error";
            loaderLine.style.display = 'none';
            return;
        }

        // 4. 第二步：获取广告语并更新UI
        adText.textContent = "Generating";
        const adData = await fetchAdSlogan(adPayload);
        adText.style.opacity = '0';
        setTimeout(() => {
            adText.textContent = adData.ad;
            adText.style.opacity = '1';
        }, 300);

        loaderLine.style.display = 'none';
    }
    
    // --- API 调用函数 (已拆分) ---
    async function fetchLocation() {
        try {
            const response = await fetch('/api/location');
            return await response.json();
        } catch (error) { return { country: 'Unknown', city: 'Unknown City' }; }
    }

    async function fetchCategory(userInfo) {
        try {
            const response = await fetch('/api/get-category', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userInfo),
            });
            if (!response.ok) throw new Error('Can not get category');
            return await response.json();
        } catch (error) {
            console.error("Can not get category:", error);
            return { category: "Error" };
        }
    }

    async function fetchAdSlogan(userInfo) {
        try {
            const response = await fetch('/api/get-ad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userInfo),
            });
            if (!response.ok) throw new Error('Can not get ad slogan');
            return await response.json();
        } catch (error) {
            console.error("Can not get ad slogan:", error);
            return { ad: "Error" };
        }
    }

    // --- 重置函数 ---
    function resetState() {
        isProcessing = false;
        userDetection = null;
        
        snapshotImage.style.display = 'none';
        retryButton.style.display = 'none';
        video.style.display = 'block';
        canvas.style.display = 'block';

        genderEl.textContent = '----';
        ageEl.textContent = '----';
        locationEl.textContent = '----';
        categoryEl.textContent = '----';
        adText.textContent = 'Advertisment generated by AI';
        loaderLine.style.display = 'none';
        
        startVideo();
    }

    // --- 事件监听 ---
    agreeButton.addEventListener('click', () => {
        if (!modelsLoaded) return;
        agreementOverlay.style.opacity = '0';
        setTimeout(() => agreementOverlay.style.display = 'none', 500);
        startVideo();
    });

    video.addEventListener('play', startFaceDetection);
    retryButton.addEventListener('click', resetState);

    loadModels();
});