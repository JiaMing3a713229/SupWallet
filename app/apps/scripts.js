// scripts.js (完整版 - 整合 Firebase Authentication)

// --- 全局變量 ---
const version = 'v1.2.0_fb_auth'; // 版本號更新
// REMOVED: var current_account = ''; // 不再需要，由 Firebase Auth 管理
const initialLoad = 15;   // 初始載入記錄數量
let currentPage = 1;      // 當前頁碼 (用於記錄列表)
let isLoading = false;    // 是否正在載入 (用於記錄列表)
let hasMore = true;       // 是否還有更多數據 (用於記錄列表)

// ---> Firebase 初始化 <---
// TODO: 將以下 firebaseConfig 的值換成你自己的 Firebase 專案設定!
const firebaseConfig = {
    apiKey: "AIzaSyAwhETb85XjvGSP1PxnQfo93Dx1pTagFko",
    authDomain: "smart-m-f.firebaseapp.com",
    projectId: "smart-m-f",
    storageBucket: "smart-m-f.firebasestorage.app",
    messagingSenderId: "640257003644",
    appId: "1:640257003644:web:d23de3ca9168c5cf5179f9",
    measurementId: "G-VNVMHTTM5H"
};

// 初始化 Firebase (使用 v9 compat 語法)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(); // 獲取 Auth 服務的引用
console.log("Firebase Initialized");
// <--------------------->

// --- API Base URL ---
const API_BASE_URL = 'http://127.0.0.1:8080/api'; // 確認 URL 正確
const POST_API_BASE_URL = 'https://postflask-dot-web-firestore-453815.de.r.appspot.com/api'; // 確認 URL 正確

// ---> DOM 緩存 (移到前面) <---
const postsContainer = document.getElementById('postsContainer');
const postForm = document.getElementById('postForm');
const postModal = document.getElementById('postModal');
const closePostFormBtn = document.getElementById('closePostFormBtn');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginFormActual'); // ID 已修改
const loginError = document.getElementById('loginError');
const registerModal = document.getElementById('registerModal');
const registerForm = document.getElementById('registerForm');
const registerError = document.getElementById('registerError');
const showRegisterLink = document.getElementById('showRegisterLink');
const showLoginLink = document.getElementById('showLoginLink');
const closeRegisterBtn = document.getElementById('closeRegisterBtn');
const userDependentElements = document.querySelectorAll('.user-dependent'); // 標記需登入元素
const guestDependentElements = document.querySelectorAll('.guest-dependent'); // 標記訪客元素

const domCache = {
    pageTitle: document.getElementById('pageTitle'),
    accountForm: document.getElementById('accountForm'),
    assetForm: document.getElementById('assetForm'),
    navButtons: document.querySelectorAll('.nav-button'),
    pages: document.querySelectorAll('.page'),
    optionCards: document.querySelectorAll('.option-card'),
    assetsContainer: document.getElementById('assetsContainer'),
    showRecordsCard: document.getElementById('showRecordsCard'),
    showStocksCard: document.getElementById('showStocksCard'),
    recordsSection: document.getElementById('recordsSection'),
    stocksSection: document.getElementById('stocksSection'),
    stocksDataView: document.getElementById('stocksDataView'),
    assetsDataView: document.getElementById('assetsDataView'),
    showStocksBtn: document.getElementById('showStocksBtn'),
    showAssetsBtn: document.getElementById('showAssetsBtn'),
    showDailyReportBtn: document.getElementById('showDailyReportBtn'),
    showExpenseTrackerBtn: document.getElementById('showExpenseTrackerBtn'),
    expenseTrackerContainer: document.getElementById('expenseTrackerContainer'),
    expenseCategoryChart: null,
    expenseTrendsChart: null,
};
// <--------------------------->

// --- 圖表實例變數 ---
let assetChart = null;
let expenseChart = null;


// --- API 呼叫輔助函數 (包含 Firebase Auth Token) ---
/**
 * 包裝標準的 fetch 函數，自動為請求添加 Firebase Auth ID Token 到 Authorization header。
 * 也包含對未授權錯誤的基本處理。
 *
 * @param {string} url 要請求的 URL。
 * @param {object} options 可選的 fetch 選項 (method, body, headers 等)。
 * @returns {Promise<Response>} 返回一個解析為 Response 物件的 Promise。
 * @throws {Error} 如果使用者未登入或 fetch 失敗（特別是授權錯誤 401/403）則拋出錯誤。
 */
async function fetchWithAuth(url, options = {}) {
    const user = auth.currentUser; // 獲取當前 Firebase 使用者物件

    // 1. 檢查使用者是否登入
    if (!user) {
        console.error('錯誤：使用者未登入，無法發送需認證的請求至', url);
        // 強制登出並提示使用者
        handleLogout(); // 觸發登出流程 (會顯示登入框)
        // 拋出錯誤，中斷當前的 fetch 操作
        throw new Error('User not logged in');
    }

    try {
        // 2. 獲取當前有效的 Firebase ID Token (SDK 會處理刷新)
        // console.log(`WorkspaceWithAuth: 正在為請求 ${url} 獲取 ID token...`);
        const idToken = await user.getIdToken();

        // 3. 準備請求 Headers，自動加入 Authorization
        const headers = {
            // 預設 Content-Type 為 JSON，可以被 options.headers 覆蓋
            'Content-Type': 'application/json',
            // 先展開傳入的 options.headers (如果有的話)
            ...options.headers,
            // 添加或覆蓋 Authorization Header
            'Authorization': `Bearer ${idToken}`,
        };

        // 對於 FormData，不需要手動設定 Content-Type
        if (options.body instanceof FormData) {
            delete headers['Content-Type']; // 讓瀏覽器自動設定 FormData 的 Content-Type
        }

        // 4. 執行實際的 fetch 請求
        // console.log(`WorkspaceWithAuth: 正在發送 ${options.method || 'GET'} 請求至 ${url}`);
        const response = await fetch(url, { ...options, headers });

        // 5. 檢查後端返回的認證錯誤 (401/403)
        if (response.status === 401 || response.status === 403) {
            console.error(`WorkspaceWithAuth: 後端 API 認證失敗 (${response.status}) URL: ${url}`);
            // Token 可能已失效或權限不足，強制登出
            handleLogout();
            const errorData = await response.json().catch(() => ({})); // 嘗試獲取錯誤訊息
            throw new Error(errorData.error || `伺服器拒絕存取 (${response.status})`);
        }

        // 6. 返回 Response 物件給原始的呼叫者處理
        return response;

    } catch (error) {
        console.error(`WorkspaceWithAuth 請求 ${url} 時發生錯誤:`, error);

        // 如果錯誤是因為未登入或授權失敗，上面的邏輯已經處理或拋出了
        // 這裡可以處理其他類型的錯誤，例如網路問題
        if (error.message !== 'User not logged in' && !error.message.includes('Authorization failed') && !error.message.includes('伺服器拒絕存取')) {
             // 對於其他未知錯誤，可以彈出通用提示
             // alert(`請求時發生錯誤：${error.message}`); // 可選
        }

        // 將錯誤繼續向上拋出，讓原始呼叫者知道操作失敗
        throw error;
    }
}

// --- 註冊提交處理函數 ---
async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (!registerForm || !registerError) {
         console.error("Registration form elements not found!");
         return;
    }
    registerError.style.display = 'none';

    const username = registerForm.elements['username']?.value.trim();
    const email = registerForm.elements['email']?.value.trim();
    const password = registerForm.elements['password']?.value;
    const confirmPassword = registerForm.elements['confirm_password']?.value;

    // 前端驗證
    if (!username || !email || !password || !confirmPassword) {
        registerError.textContent = '所有欄位都必須填寫！'; registerError.style.display = 'block'; return;
    }
    if (password !== confirmPassword) {
        registerError.textContent = '兩次輸入的密碼不一致！'; registerError.style.display = 'block'; return;
    }
    if (password.length < 6) {
        registerError.textContent = '密碼長度至少需要 6 位！'; registerError.style.display = 'block'; return;
    }

    const submitButton = registerForm.querySelector('button[type="submit"]');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = '註冊中...'; }

    try {
        // 1. Firebase Auth 註冊
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        console.log('Firebase Auth 註冊成功, UID:', user.uid);

        // 2. 獲取 ID Token
        const idToken = await user.getIdToken();
        console.log('Obtained Firebase ID Token.');

        // 3. 呼叫後端 API 建立 Profile
        console.log(`Calling backend API to create profile for username: ${username}`);
        const profileResponse = await fetch(`${API_BASE_URL}/createUserProfile`, {
            method: 'POST',
            headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${idToken}` // 攜帶 Token
            },
            body: JSON.stringify({ username: username }) // 傳遞 username
        });

        // 4. 檢查後端回應
        const profileData = await profileResponse.json();
        if (!profileResponse.ok) {
            console.error('後端建立 Profile 失敗:', profileData);
            throw new Error(profileData.error || '無法在伺服器建立使用者資料。');
        }

        console.log('後端 Firestore Profile 建立成功:', profileData);
        alert('註冊成功！請重新整理頁面或進行登入。'); // 提示用戶
        registerModal.style.display = 'none'; // 關閉註冊框
        loginModal.style.display = 'flex';    // 顯示登入框
        registerForm.reset(); // 清空表單

    } catch (error) {
        console.error('註冊流程失敗:', error);
        let errorMessage = '註冊失敗，請稍後再試。';
        if (error.code) { // Firebase Auth 錯誤
            switch (error.code) {
                case 'auth/email-already-in-use': errorMessage = '此 Email 已被註冊。'; break;
                case 'auth/weak-password': errorMessage = '密碼強度不足 (至少6位數)。'; break;
                case 'auth/invalid-email': errorMessage = 'Email 格式無效。'; break;
                default: errorMessage = `註冊錯誤 (${error.code})。`;
            }
        } else { errorMessage = error.message; } // 後端或其他錯誤
        registerError.textContent = errorMessage;
        registerError.style.display = 'block';
    } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = '註冊'; }
    }
}

// --- 登入提交處理函數 ---
async function handleLoginSubmit(event) {
    event.preventDefault(); // 阻止表單預設提交
    if (!loginForm || !loginError) {
         console.error("Login form elements not found!");
         return;
    }
    loginError.style.display = 'none'; // 隱藏之前的錯誤

    // 從表單獲取使用者輸入的值
    // **重要：Firebase Auth 的 signInWithEmailAndPassword 需要 Email**
    // 我們假設 identifier 欄位就是用來輸入 Email 的
    const email = loginForm.elements['identifier']?.value.trim();
    const password = loginForm.elements['password']?.value;

    // 基本驗證
    if (!email || !password) {
        loginError.textContent = '請輸入 Email 和密碼。';
        loginError.style.display = 'block';
        return;
    }

    // 獲取提交按鈕並禁用
    const submitButton = loginForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '登入中...';
    }

    try {
        // --- 使用 Firebase Auth 進行登入 ---
        console.log(`Attempting Firebase Auth login for email: ${email}`);
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        // --- 登入成功 ---
        console.log('Firebase 登入成功:', userCredential.user.uid);

        // **登入成功後，不需要在這裡做太多事**
        // 核心的 UI 更新和應用程式初始化將由 onAuthStateChanged 監聽器處理
        // loginModal.style.display = 'none'; // onAuthStateChanged 會處理隱藏
        // loginForm.reset(); // 可以不清空，方便記憶？或者在 onAuthStateChanged 成功後清空

    } catch (error) {
        // --- 處理 Firebase Auth 登入錯誤 ---
        console.error('登入失敗:', error);
        let errorMessage = '登入失敗，請稍後再試。';
        if (error.code) {
            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential': // 較新 SDK 的整合錯誤碼
                    errorMessage = 'Email 或密碼錯誤。';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Email 格式無效。';
                    break;
                case 'auth/user-disabled':
                    errorMessage = '此帳號已被停用。';
                    break;
                case 'auth/too-many-requests':
                     errorMessage = '嘗試次數過多，請稍後再試。';
                     break;
                default:
                    errorMessage = `登入時發生錯誤 (${error.code})。`;
            }
        }
        loginError.textContent = errorMessage;
        loginError.style.display = 'block'; // 顯示錯誤訊息

    } finally {
        // --- 無論成功或失敗，恢復按鈕狀態 ---
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '登入';
        }
    }
}

function updateUIAfterLogout() {
    console.log("Updating UI elements to logged-out state...");

    // 1. 顯示/隱藏元素 (依賴 HTML Class)
    const guestDependentElements = document.querySelectorAll('.guest-dependent');
    const userDependentElements = document.querySelectorAll('.user-dependent');
    guestDependentElements.forEach(el => { el.style.display = ''; });
    userDependentElements.forEach(el => { el.style.display = 'none'; });

    // // 2. 重設 Header
    document.getElementById('logoutButton')?.remove();
    document.getElementById('currentUserDisplay')?.remove();
    // // 可以選擇性地在 header 加入一個固定的 "請登入" 提示 span，並用 guest-dependent class 控制
    const headerContainer = document.querySelector('.header-container');
     if (headerContainer && !document.getElementById('loginPromptHeader')) {
         // 確保在 header 中顯示 "請登入" 或類似提示 (如果HTML裡沒有固定的話)
         const loginPrompt = document.createElement('span');
         loginPrompt.id = 'loginPromptHeader';
         loginPrompt.className = 'header-username guest-dependent'; // 確保有 guest-dependent
         loginPrompt.textContent = '請登入';
         headerContainer.appendChild(loginPrompt);
     }


    // 3. 重設導航欄 Active 狀態
    domCache.navButtons?.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('href') === '#homePage') {
            btn.classList.add('active');
        }
    });

    console.log("UI updated to logged-out state.");
}

// --- 設定 Modal 切換邏輯 ---
function setupLoginAndRegisterModals() {
    console.log("Setting up login/register modals for registration...");

    // 綁定登入表單提交事件
    if (loginForm) {
        loginForm.removeEventListener('submit', handleLoginSubmit); // 先移除舊的
        loginForm.addEventListener('submit', handleLoginSubmit);   // 再添加新的
        console.log("Login form submit listener attached.");
    } else {
        console.error("Login form (#loginFormActual) not found!");
    }

    // 綁定註冊表單提交事件
    if (registerForm) {
        registerForm.removeEventListener('submit', handleRegisterSubmit); // 先移除避免重複
        registerForm.addEventListener('submit', handleRegisterSubmit);
        console.log("Register form submit listener attached.");
    } else {
        console.error("Register form (#registerForm) not found!");
    }

    // 從註冊框 -> 登入框
    if (showLoginLink) {
        showLoginLink.onclick = (e) => {
            e.preventDefault();
            if(registerModal) registerModal.style.display = 'none';
            if(loginModal) loginModal.style.display = 'flex';
            if(registerError) registerError.style.display = 'none';
        };
    } else {
         console.warn("showLoginLink not found.");
    }

    // 關閉註冊框按鈕
     if (closeRegisterBtn) {
         closeRegisterBtn.onclick = () => {
             if(registerModal) registerModal.style.display = 'none';
             if(registerError) registerError.style.display = 'none';
         };
    } else {
         console.warn("closeRegisterBtn not found.");
    }

    // 從登入框 -> 註冊框
     if (showRegisterLink) {
         showRegisterLink.onclick = (e) => {
             e.preventDefault();
             if(loginModal) loginModal.style.display = 'none';
             if(registerModal) registerModal.style.display = 'flex';
             if(loginError) loginError.style.display = 'none';
         };
     } else {
          console.warn("showRegisterLink not found.");
     }
}

/**
 * 通用函數：用提供的選項陣列填充指定的下拉選單。
 * @param {string} selectElementId - 下拉選單 <select> 元素的 ID。
 * @param {string[]} optionsArray - 選項文字的陣列。
 * @param {string} defaultOptionText - 保留的預設選項文字 (例如 "選擇類別")。
 */
function populateDropdown(selectElementId, optionsArray, defaultOptionText) {
    const selectElement = document.getElementById(selectElementId);
    if (!selectElement) {
        console.error(`錯誤：找不到 ID 為 "${selectElementId}" 的下拉選單元素。`);
        return;
    }

    // 保存預設選項（第一個 option）
    const defaultOption = selectElement.options[0];
    // 清空現有選項 (除了預設選項)
    selectElement.innerHTML = '';
    if (defaultOption && defaultOption.disabled) {
         // 將預設選項加回去
         selectElement.appendChild(defaultOption);
         defaultOption.textContent = defaultOptionText || '請選擇'; // 更新預設文字（可選）
    } else {
         // 如果沒有預設選項或預設選項不是 disabled，創建一個新的
         const newDefault = document.createElement('option');
         newDefault.value = "";
         newDefault.textContent = defaultOptionText || '請選擇';
         newDefault.disabled = true;
         newDefault.selected = true;
         selectElement.appendChild(newDefault);
    }


    // 檢查 optionsArray 是否為有效的陣列
    if (Array.isArray(optionsArray)) {
        // 遍歷選項陣列，創建新的 <option> 元素
        optionsArray.forEach(optionText => {
            // 避免添加空值或 null
            if (optionText) {
                const option = document.createElement('option');
                option.value = optionText;      // 值和文字相同
                option.textContent = optionText;// 顯示文字
                selectElement.appendChild(option); // 添加到下拉選單
            }
        });
        console.log(`下拉選單 #${selectElementId} 已成功填充 ${optionsArray.length} 個選項。`);
    } else {
        console.warn(`警告：用於填充 #${selectElementId} 的選項數據不是一個有效的陣列。`, optionsArray);
        // 即使選項數據無效，也確保至少有預設選項
    }
}

/**
 * 從後端 API (/api/options) 獲取選項數據，並填充相關的下拉選單。
 */

// --- 填充「資產」表單的「類別」下拉選單 (#category1) ---
let assetCategories = [];
fixed_assets_opt = []
transactionType_opt = []
async function loadAndPopulateOptions() {
    console.log("正在從後端獲取下拉選單選項...");
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/options`); // 使用 fetchWithAuth
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `無法獲取選項數據 (${response.status})`);
        }

        const options = await response.json(); // 解析 JSON 數據
        transactionType_opt = options.transactionsType.transactions; // 儲存 transactionType 選項
        console.log("成功獲取選項數據:", options);

        // --- 填充「記帳」表單的「類別」下拉選單 (#category) ---
        if (options.transactionsType && Array.isArray(options.transactionsType.transactions)) {
            populateDropdown('category', options.transactionsType.transactions, '選擇類別');
            populateDropdown('editRecordCategory', transactionType_opt, '選擇類別');
        } else {
            console.warn("後端回應中未找到有效的 'transactionsType.transactions' 數據。");
            // 保留 HTML 中的預設選項或顯示錯誤提示
             populateDropdown('category', [], '無法載入類別'); // 清空並顯示錯誤提示
             populateDropdown('editRecordCategory', [], '無法載入類別');
        }

        
        if (options.assetType && options.assetType.assets) {
            // 合併 current_assets 和 fixed_assets
            const current = options.assetType.assets.current_assets || [];
            const fixed = options.assetType.assets.fixed_assets || [];
            fixed_assets_opt = fixed; // 儲存 fixed_assets 的選項
             // 使用 Set 去除可能的重複項，然後轉換回陣列
            assetCategories = [...new Set([...current, ...fixed])];
        }
        if (assetCategories.length > 0) {
            populateDropdown('category1', assetCategories, '選擇資產類別');
        } else {
            console.warn("後端回應中未找到有效的 'assetType.assets' 數據。");
            populateDropdown('category1', [], '無法載入資產類別');
        }


        // --- 處理「支付方式」下拉選單 (#payment_method) ---
        // 注意：根據你的 SmartMF.get_options 函數，目前的後端數據似乎 *不包含* 支付方式。
        // 你有以下選擇：
        // 1. (目前做法) 維持 HTML 中的硬編碼選項。不需要在這裡做任何事。
        // 2. 修改後端：
        //    a. 在 Firestore 的 options 文件中加入 paymentMethods: ["現金", "信用卡", ...] 陣列。
        //    b. 修改 SmartMF.get_options 和 /api/options 端點，讓它們返回 paymentMethods。
        //    c. 然後在這裡取消註解以下程式碼：
        /*
        if (options.paymentMethods && Array.isArray(options.paymentMethods)) {
            populateDropdown('payment_method', options.paymentMethods, '選擇支付方式');
        } else {
            console.warn("後端回應中未找到有效的 'paymentMethods' 數據，將使用 HTML 預設值。");
            // 如果找不到數據，就不動 HTML 中的硬編碼選項
        }
        */
        console.log("支付方式下拉選單將使用 HTML 中的預設值。"); // 提醒開發者

    } catch (error) {
        console.error("加載或填充下拉選單選項失敗:", error);
        // 在這裡可以考慮是否要在 UI 上顯示一個通用的錯誤提示
        alert(`無法載入表單選項：${error.message}`);
        // 出錯時，確保下拉選單至少有預設值
        populateDropdown('category', [], '載入類別失敗');
        populateDropdown('category1', [], '載入資產類別失敗');
        populateDropdown('editRecordCategory', [], '載入類別失敗');
        // 支付方式保留 HTML 預設
    }
}

/**
 * 創建一個節流函數，確保原始函數在指定的限制時間內最多執行一次。
 * @param {Function} func 要進行節流的原始函數。
 * @param {number} limit 限制的毫秒數。
 * @returns {Function} 返回一個新的、經過節流處理的函數。
 */
function throttle(func, limit) {
    let inThrottle; // 標誌位，用於追蹤是否處於冷卻時間內
    // 返回一個新的函數，這個新函數將會取代原始的事件處理函數
    return function(...args) {
        // 保存當前的 this 上下文和參數
        const context = this;
        // 如果不在冷卻時間內 (inThrottle 為 false 或 undefined)
        if (!inThrottle) {
            // 立即執行原始函數，並傳遞上下文和參數
            func.apply(context, args);
            // 設置標誌位為 true，表示進入冷卻時間
            inThrottle = true;
            // 設定一個計時器，在 limit 毫秒後將標誌位重設為 false
            setTimeout(() => inThrottle = false, limit);
        }
        // 如果在冷卻時間內，則不執行任何操作
    }
}

/**
 * 處理頁面捲動事件，用於實現無限滾動加載帳本記錄。
 * 通常需要被 throttle 函數包裝後再綁定到 scroll 事件。
 */
function handleScroll() {
    const user = auth.currentUser; // 獲取當前登入用戶

    // 1. 檢查必要條件：需登入、不在載入中、還有更多數據
    if (!user || isLoading || !hasMore) {
        // 如果不滿足任一條件，則不執行後續操作
        // if(!user) console.log("handleScroll: User not logged in.");
        // if(isLoading) console.log("handleScroll: Already loading.");
        // if(!hasMore) console.log("handleScroll: No more data.");
        return;
    }

    // 2. 檢查當前是否處於需要無限滾動的頁面/狀態
    //    只在「查看」頁面(#managePage) 且「帳本」區塊(#recordsSection) 可見時觸發
    const managePageIsActive = window.location.hash.includes('managePage');
    const recordsSectionIsVisible = domCache.recordsSection?.style.display === 'block'; // 使用快取

    if (!managePageIsActive || !recordsSectionIsVisible) {
        // console.log("handleScroll: Not on the correct view for infinite scroll.");
        return; // 不在目標頁面或區塊，不執行
    }

    // 3. 計算是否接近頁面底部
    // window.innerHeight: 瀏覽器視窗的可見高度
    // window.scrollY: 頁面垂直捲動的距離
    // document.body.offsetHeight: 整個頁面的總高度
    // 150 (或更大/小的值) 是觸發提前量，在距離底部 150px 時就開始載入
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 150;
}


/**
 * 初始化應用程式的核心功能 (在確認使用者登入後執行)。
 * @param {firebase.User} user - 當前登入的 Firebase 使用者物件。
 */
async function initializeApp(user) { // 將 initializeApp 改為 async
    if (!user) {
        console.error("initializeApp called without a valid user.");
        return;
    }
    console.log(`Initializing app for user: ${user.uid}`);

    // --- 1. 並行執行不互相依賴的初始化 ---
    const initPromises = [
        initDate(), // 初始化日期欄位
        // 在initializeApp開始時就去獲取選項數據
        loadAndPopulateOptions() // <--- 在這裡呼叫載入並填充選項的函數
    ];

    // --- 2. 設定事件監聽器和路由 (可以非同步執行) ---
    setupEventListeners(user);
    setupManagePageCards();
    setupOptionCards();

    const hashChangeListener = () => handleHashChange(auth.currentUser);
    window.removeEventListener('hashchange', hashChangeListener);
    window.addEventListener('hashchange', hashChangeListener);
    console.log("Hash change listener attached.");

    const scrollListener = throttle(() => handleScroll(auth.currentUser), 200);
    window.removeEventListener('scroll', scrollListener);
    window.addEventListener('scroll', scrollListener);
    console.log("Scroll listener attached.");

    // Header/Footer scroll hiding listener
    let lastScroll = 0;
    const header = document.querySelector('header.header-container');
    const footer = document.querySelector('footer.nav-bar');
    const headerFooterScrollHandler = () => { /* ... (之前的邏輯) ... */ };
    window.removeEventListener('scroll', headerFooterScrollHandler);
    window.addEventListener('scroll', headerFooterScrollHandler);
    console.log("Header/Footer scroll hiding listener attached.");


    // --- 3. 等待選項載入完成 (如果需要確保選項填充完再處理 hash) ---
    try {
         await Promise.all(initPromises); // 等待 initDate 和 loadAndPopulateOptions 完成
         console.log("Initial data loaded and options populated.");
         // --- 4. 最後處理初始 Hash ---
         console.log("Triggering initial hash change handler after options load...");
         handleHashChange(user); // 確保選項填充完再處理初始頁面邏輯
    } catch(error) {
         console.error("Error during initialization or options loading:", error);
         // 即使選項載入失敗，仍然嘗試處理 hash
         handleHashChange(user);
    }


    console.log("App Initialization complete for logged in user.");
}

// --- 頁面加載後執行設定 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded. Setting up registration modals.");
    setupLoginAndRegisterModals(); // 設定註冊相關的互動

    // 初始狀態下顯示登入框 (或根據需要調整)
    if(loginModal) loginModal.style.display = 'flex';
    if(registerModal) registerModal.style.display = 'none';

    const saveRecordChangesBtn = document.getElementById('saveRecordChangesBtn');
    if (saveRecordChangesBtn) {
        saveRecordChangesBtn.removeEventListener('click', handleUpdateRecordSubmit); // 移除舊的
        saveRecordChangesBtn.addEventListener('click', handleUpdateRecordSubmit);   // 添加新的
        console.log("Listener attached to saveRecordChangesBtn.");
    } else {
        console.warn("saveRecordChangesBtn not found during listener setup.");

    }

    const saveAssetChangesBtn = document.getElementById('saveAssetChangesBtn');
    if (saveAssetChangesBtn) {
        saveAssetChangesBtn.removeEventListener('click', handleUpdateAssetSubmit); // 移除舊的
        saveAssetChangesBtn.addEventListener('click', handleUpdateAssetSubmit);   // 添加新的
        console.log("Listener attached to saveAssetChangesBtn.");
    } else {
        console.warn("saveAssetChangesBtn not found during listener setup.");
    }

});

auth.onAuthStateChanged(user => {
    console.log("Auth State Changed:", user ? `User logged in: ${user.uid}` : "User logged out");
    if (user) {
        // --- 使用者已登入 (signInWithEmailAndPassword 成功後會觸發這裡) ---
        user.getIdToken().then(idToken => {
            // console.log("Obtained ID Token:", idToken);
        }).catch(error => {
            console.error("獲取 ID Token 失敗:", error);
            handleLogout();
        });

        loginModal.style.display = 'none';      // 隱藏登入框
        registerModal.style.display = 'none';   // 隱藏註冊框
        if(loginForm) loginForm.reset();        // 清空登入表單 (可選)

        updateUIAfterLogin(user);               // 更新 UI 顯示已登入
        initializeApp(user);                    // <--- 初始化應用程式

    } else {
        // --- 使用者未登入或已登出 ---
        // ... (登出邏輯) ...
        // *** 核心：顯示登入介面 ***
        updateUIAfterLogout(); // 更新 UI 顯示未登入
        setupLoginAndRegisterModals(); // 設定互動
        console.log("User is logged out, showing login modal."); // <--- 加入 log 確認
        if (loginModal) {
            loginModal.style.display = 'flex'; // <--- 確保這裡會執行
        } else {
            console.error("Login Modal not found!");
        }
        
    }
});

function formatNumber(number) {
    // 確保 number 是數字，如果不是或 NaN，返回 '0' 或其他預設值
    const num = Number(number);
    if (isNaN(num)) {
        return '0'; // 或者返回空字串 '' 或 '-'
    }
    return new Intl.NumberFormat('zh-TW').format(num);
}

function initDate() {
    const today = new Date();
    const default_date = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const inputDate1 = document.getElementById('inputDate1');
    const inputDate2 = document.getElementById('inputDate2');
    if (inputDate1) inputDate1.value = default_date;
    if (inputDate2) inputDate2.value = default_date;
}

async function handleLogout() {
    console.log("Logout button clicked. Attempting sign out...");
    try {
        await auth.signOut(); // 使用 Firebase Auth SDK 登出
        console.log('Firebase 登出成功');
        // 清理工作和 UI 更新會由 onAuthStateChanged 監聽器自動處理
        // 登出後跳轉到首頁
        // window.location.hash = '#homePage';
    } catch (error) {
        console.error('登出失敗:', error);
        alert('登出時發生錯誤，請稍後再試。');
    }
}

function updateUIAfterLogin(user) {
    if (!user) {
        console.warn("updateUIAfterLogin called without a user object.");
        return; // 如果沒有 user 物件，直接返回
    }

    console.log(`Updating UI for logged-in user: ${user.uid}`);

    // --- 1. 根據 CSS class 顯示/隱藏元素 ---
    // 假設你的 HTML 中，需要登入才顯示的元素有 class="user-dependent"
    // 只給訪客看的元素有 class="guest-dependent"
    const userDependentElements = document.querySelectorAll('.user-dependent');
    const guestDependentElements = document.querySelectorAll('.guest-dependent');

    // 隱藏訪客元素
    guestDependentElements.forEach(el => {
        el.style.display = 'none';
    });

    // 顯示登入用戶元素 (恢復其預設顯示方式)
    // '' 會移除內聯的 display 樣式，讓 CSS 規則生效
    userDependentElements.forEach(el => {
        el.style.display = '';
    });

    // --- 2. 更新 Header 區域 ---
    const headerContainer = document.querySelector('.header-container');
    if (headerContainer) {
        // 決定要顯示的使用者名稱 (優先用 displayName，其次 email，最後 uid)
        const usernameToShow = user.displayName || user.email || user.uid;
        // --- 清理舊元素 ---
        // 移除可能存在的舊下拉選單或登入提示
        const oldDropdown = document.getElementById('accountList-title');
        if (oldDropdown) oldDropdown.remove();
        const oldLoginPrompt = document.getElementById('loginPromptHeader');
        if (oldLoginPrompt) oldLoginPrompt.remove();
        // 移除可能重複添加的舊用戶名和登出按鈕
        document.getElementById('currentUserDisplay')?.remove();
        document.getElementById('logoutButton')?.remove();
        // // --- 清理結束 ---


        // --- 添加使用者名稱顯示 ---
        // 創建一個 span 來顯示用戶名
        const userSpan = document.createElement('span');
        userSpan.id = 'currentUserDisplay';
        userSpan.className = 'header-username'; // 給它一個 class 以便 CSS 美化
        userSpan.textContent = "您好 " + usernameToShow;
        // 插入到 H1 標題後面
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle && pageTitle.parentNode === headerContainer) {
            // 確保 pageTitle 存在且父節點是 headerContainer
            pageTitle.parentNode.insertBefore(userSpan, pageTitle.nextSibling);
        } else {
             // 如果 pageTitle 不在 header 或找不到，直接加到 header 末尾 (作為備案)
             headerContainer.appendChild(userSpan);
        }
        // // --- 添加結束 ---


        // --- 添加登出按鈕 ---
        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = '登出';
        // 使用 Bootstrap 的 class 來美化按鈕，並用 ms-auto 將其推到右側
        logoutBtn.className = 'btn btn-sm btn-outline-secondary ms-auto';
        logoutBtn.id = 'logoutButton';
        logoutBtn.style.marginLeft = 'auto'; // 另一種推到右邊的方式
        logoutBtn.addEventListener('click', handleLogout); // 綁定登出函數

        // // 將登出按鈕添加到 header 的末尾
        headerContainer.appendChild(logoutBtn);
        // --- 添加結束 ---

    } else {
        console.warn("Header container (.header-container) not found. Cannot update header UI.");
    }

}

function switchHomeView(viewType) {
    // 現在只有 'dailyReport' 一種視圖
    if (viewType === 'dailyReport') {
        if(domCache.assetsContainer) domCache.assetsContainer.style.display = 'block';
        // REMOVED: domCache.expenseTrackerContainer.style.display = 'none';
        domCache.showDailyReportBtn?.classList.add('active');
        domCache.showExpenseTrackerBtn?.classList.remove('active'); // 雖然按鈕可能已移除，但以防萬一

        // 載入日報數據
        updateHomePage(); // updateHomePage 內部使用 auth.currentUser

    } else {
        // 理論上不應該有其他 viewType 了
        console.warn("Invalid viewType passed to switchHomeView:", viewType);
        // 預設顯示日報
        if(domCache.assetsContainer) domCache.assetsContainer.style.display = 'block';
        domCache.showDailyReportBtn?.classList.add('active');
        domCache.showExpenseTrackerBtn?.classList.remove('active');
        updateHomePage();
    }
}

/**
 * 處理 URL Hash 變更事件，用於 SPA 頁面切換和內容加載。
 * @param {firebase.User | null} user - 當前登入的 Firebase 使用者物件，如果未登入則為 null。
 */
function handleHashChange(user) {
    // 1. 獲取並清理 Hash
    let hash = window.location.hash.slice(1); // 移除 '#'
    if (!hash) {
        hash = 'homePage'; // 如果 hash 為空，預設為首頁
    }
    console.log(`Hash changed to: #${hash}, User state: ${user ? 'Logged In (' + user.uid + ')' : 'Logged Out'}`);

    // 2. 查找目標頁面元素
    const targetPage = document.getElementById(hash);

    // 檢查目標頁面是否存在
    if (!targetPage) {
        console.error(`Target page element not found for hash: #${hash}. Redirecting to #homePage.`);
        window.location.hash = '#homePage'; // 找不到頁面，跳回首頁
        return; // 停止執行此函數
    }

    // 3. 切換頁面顯示 (使用 active class)
    // 確保 domCache.pages 有效
    if (!domCache.pages || domCache.pages.length === 0) {
        console.warn("domCache.pages is empty. Querying pages again.");
        domCache.pages = document.querySelectorAll('.page');
    }
    domCache.pages.forEach(page => {
        page.classList.toggle('active', page.id === hash);
    });

    // 4. 更新底部導航按鈕的 active 狀態
    // 確保 domCache.navButtons 有效
    if (!domCache.navButtons || domCache.navButtons.length === 0) {
        console.warn("domCache.navButtons is empty. Querying nav buttons again.");
        domCache.navButtons = document.querySelectorAll('.nav-button');
    }
    domCache.navButtons.forEach(btn => {
        // 使用 btn.hash 屬性 (包含 '#') 或 getAttribute('href')
        btn.classList.toggle('active', btn.hash === `#${hash}`);
    });

    // 5. 更新頁面標題和 Header
    const pageTitleElement = domCache.pageTitle;
    if (pageTitleElement) {
        pageTitleElement.textContent = targetPage.dataset.title || 'NovaFin'; // 從 data-title 屬性獲取標題
        // 清理可能殘留的 header 元素 (按鈕/用戶名/提示)
        document.getElementById('logoutButton')?.remove();
        document.getElementById('currentUserDisplay')?.remove();
        document.getElementById('loginPromptHeader')?.remove();
        // 根據登入狀態更新 header
        if (user) {
            updateUIAfterLogin(user); // 顯示用戶名和登出按鈕
        } else {
            updateUIAfterLogout();    // 顯示 "請登入" 等
        }
    }
    document.title = `NovaFin - ${targetPage.dataset.title || 'App'}`; // 更新瀏覽器標題

    // --- 6. 根據登入狀態和當前 Hash 載入內容 ---
    if (user) {
        // --- 使用者已登入 ---
        loginModal.style.display = 'none'; // 確保登入/註冊框是隱藏的

        console.log(`Loading content for #${hash} for logged-in user.`);
        // 根據 hash 載入對應頁面的數據或初始化功能
        switch (hash) {
            case 'homePage':
                // 預設顯示日報視圖，並觸發數據加載
                switchHomeView('dailyReport');
                break;
            case 'managePage':
                // 預設顯示資產視圖 (現金/其他)，並觸發數據加載
                // 確保 #recordsSection 和 #stocksSection 初始狀態正確
                 if(domCache.recordsSection) domCache.recordsSection.style.display = 'none';
                 if(domCache.stocksSection) domCache.stocksSection.style.display = 'block';
                 // 確保選項卡樣式正確 (可選)
                 if(domCache.showStocksCard) domCache.showStocksCard.style.backgroundColor = 'var(--secondary)'; // 或 active class
                 if(domCache.showRecordsCard) domCache.showRecordsCard.style.backgroundColor = 'var(--background)'; // 或移除 active class
                switchDataView('assets');
                break;
            case 'sharePage':
                // 載入貼文列表
                loadPosts(); // loadPosts 內部使用 fetchWithAuth
                break;
            case 'chargePage':
                // 初始化表單和選項卡狀態
                domCache.accountForm?.reset();
                domCache.assetForm?.reset();
                initDate(); // 設定日期
                // 預設顯示記帳表單及按鈕
                if(domCache.accountForm) domCache.accountForm.style.display = 'block';
                if(domCache.assetForm) domCache.assetForm.style.display = 'none';
                const submitAccountBtn = document.getElementById('submitAccountBtn');
                const submitAssetBtn = document.getElementById('submitAssetBtn');
                if(submitAccountBtn) submitAccountBtn.style.display = 'block';
                if(submitAssetBtn) submitAssetBtn.style.display = 'none';
                setupOptionCards(); // 確保選項卡切換邏輯已綁定
                break;
            default:
                // 如果 hash 不匹配任何已知頁面，可以選擇跳回首頁
                console.warn(`Unhandled hash for logged-in user: #${hash}. Redirecting to homePage.`);
                if (window.location.hash !== '#homePage') window.location.hash = '#homePage';
                break;
        }
    } else {
        // --- 使用者未登入 ---
        console.log(`Handling #${hash} for logged-out user.`);
        // 對於需要登入的頁面，清空內容，確保登入 Modal 可見
        const protectedPages = ['managePage', 'sharePage', 'chargePage']; // 需要登入的頁面 ID
        if (protectedPages.includes(hash)) {
            console.log(`Access denied to protected page #${hash}. Clearing content.`);
            targetPage.innerHTML = '<p class="text-center p-4">請先登入以查看此頁面。</p>'; // 清空並顯示提示
            loginModal.style.display = 'flex'; // 確保登入框可見
        } else if (hash === 'homePage') {
            // 如果是首頁，可以顯示一個簡單的訪客歡迎介面
            // 但主要目的是讓登入 Modal 顯示 (由 onAuthStateChanged 處理)
             const homeContent = document.getElementById('homeContent');
             if (homeContent) {
                  homeContent.innerHTML = '<div class="container text-center mt-5"><h2 class="guest-dependent">歡迎使用 Gochy 記帳網</h2><p class="guest-dependent">請登入或註冊以開始使用。</p></div>';
             }
             loginModal.style.display = 'flex'; // 確保登入框可見
        }
        // 其他公開頁面 (如果有的話) 可以在這裡處理
    }
}

/**
 * 處理資產表單 (#assetForm) 的提交事件。
 * 用於新增一筆資產記錄 (股票、現金帳戶等)。
 * (取代了舊的 submitStockForm 函數)
 */
async function submitAssetData(event) {
    event.preventDefault(); // 阻止表單的預設提交行為

    const user = auth.currentUser; // 獲取當前登入的 Firebase 使用者
    if (!user) {
        // 如果使用者未登入，提示並顯示登入框
        alert('請先登入才能新增資產！');
        showLoginModal(); // 顯示登入模態框
        return;
    }

    const form = document.getElementById('assetForm');
    const submitButton = document.getElementById('submitAssetBtn'); // 資產表單的提交按鈕

    // 1. 使用 HTML5 表單驗證
    if (!form || !form.checkValidity()) {
        form?.reportValidity(); // 顯示瀏覽器內建的驗證提示
        return;
    }

    // 2. 禁用提交按鈕，防止重複提交
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
    }

    // 3. 從表單收集數據
    const assetValueInput = document.getElementById('assetValue').value; // 股數/數量欄位的值
    const initialAmountValue = document.getElementById('inventValue').value; // 投資金額/初始價值欄位的值

    const formData = {
        acquisition_date: document.getElementById('inputDate2').value,
        item: document.getElementById('assetName').value.trim(), // 資產名稱 (去除前後空白)
        asset_type: document.getElementById('category1').value, // 資產類型 (來自下拉選單)
        // owner 欄位已移除，後端會從驗證過的 Token 中獲取使用者 UID
        // 處理 quantity (股數/數量)
        quantity: assetValueInput > 0 ? parseInt(assetValueInput, 10) : -1, // 如果為空，依原邏輯設為 -1，否則轉為整數
        // 處理 initialAmount (投資金額/初始價值)
        acquisition_value: parseFloat(initialAmountValue) // 轉為浮點數
    };

    // --- 4. 前端驗證 ---
    if (!formData.item) {
        alert('請輸入資產名稱！');
        if (submitButton) {
             submitButton.disabled = false;
             submitButton.textContent = '提交資產';
        }
        return;
    }
    if (isNaN(formData.acquisition_value) || formData.acquisition_value < 0) {
         alert('請輸入有效的初始投資金額 (必須大於或等於 0)！');
         if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '提交資產';
         }
         return;
    }
    // 根據資產類型驗證 quantity
    const stockTypes = fixed_assets_opt; // 需要 quantity 的類型列表 (需與你的後端邏輯一致)
    console.log("資產類型:", fixed_assets_opt, "股數:", formData.quantity);
    if (stockTypes.includes(formData.asset_type)) {
         if (isNaN(formData.quantity) || formData.quantity <= 0) {
              alert('股票/證券類資產需要輸入有效的正整數股數！');
              if (submitButton) {
                   submitButton.disabled = false;
                   submitButton.textContent = '提交資產';
              }
              return;
         }
    } else {
         // 對於非股票/證券類型，將 quantity 設為 -1 (或 0，取決於後端)
         formData.quantity = -1;
    }
    // --- 驗證結束 ---

    console.log("正在提交資產資料:", formData);

    try {
        // 5. 使用 fetchWithAuth 呼叫受保護的後端 API
        //    後端 API 端點應為 /api/submitStock (POST)
        const response = await fetchWithAuth(`${API_BASE_URL}/submitStock`, { // 使用 fetchWithAuth
            method: 'POST',
            body: JSON.stringify(formData) // 發送收集到的表單數據
        });

        // 6. 檢查後端回應
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "提交失敗，無法解析伺服器錯誤回應" }));
            throw new Error(errorData.error || `提交失敗 (${response.status})`);
        }

        const result = await response.json(); // 獲取後端回應

        // --- 執行成功 ---
        form.reset(); // 清空表單欄位
        initDate(); // 將日期欄位重設為今天
        alert('資產提交成功！'); // 提示使用者成功
        console.log("資產資料提交成功:", result);

        // 7. **可選操作：成功後刷新相關資料**
        //    (根據需要取消註解或添加刷新邏輯)
        // if (window.location.hash.includes('managePage')) {
        //     console.log("嘗試刷新管理頁面資產列表...");
        //     const isShowingAssets = domCache.assetsDataView?.style.display !== 'none';
        //     if (isShowingAssets) {
        //         await renderAssetCardsForAccount();
        //     } else {
        //         await renderStockCardsForAccount();
        //     }
        // }
        // if (window.location.hash.includes('homePage')) {
        //      await updateHomePage();
        // }

    } catch (error) {
        // --- 處理錯誤 ---
        console.error('提交資產資料失敗:', error);
        alert(`提交資產資料失敗：${error.message}`);
        // fetchWithAuth 內部會處理 401/403 錯誤

    } finally {
        // --- 無論成功或失敗，恢復按鈕狀態 ---
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交資產';
        }
    }
}

async function handleSubmitRecord() {
    const user = auth.currentUser; // 獲取當前登入的 Firebase 使用者
    if (!user) {
        // 如果使用者未登入，提示並顯示登入框
        alert('請先登入！');
        showLoginModal(); // 顯示登入模態框
        return;
    }

    const form = document.getElementById('recordForm');
    const submitButton = document.getElementById('submitRecordBtn');
    const recordModalElement = document.getElementById('recordModal');
    // 獲取 Bootstrap Modal 實例 (如果存在)
    const modalInstance = bootstrap.Modal.getInstance(recordModalElement);

    // 1. 基本表單驗證
    if (!form || !form.checkValidity()) {
        form?.reportValidity(); // 顯示瀏覽器內建驗證提示
        return;
    }

    // 2. 禁用按鈕，防止重複提交
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
    }

    // 3. 從模態框表單收集數據
    const formData = {
        date: document.getElementById('recordDate').value,
        // 假設 'recordAmount' 是資產的新價值
        new_value: parseFloat(document.getElementById('recordAmount').value),
        // 獲取隱藏欄位中的資產 ID
        assetId: document.getElementById('recordAssetId').value
    };

    // 4. 再次驗證獲取的數據
    if (!formData.assetId || isNaN(formData.new_value)) {
        console.error("提交錯誤：無效的 Asset ID 或金額。", formData);
        alert("提交的資料無效，請檢查輸入。");
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交';
        }
        return;
    }

    console.log("正在提交資產編輯:", formData);

    try {
        // 5. 使用 fetchWithAuth 呼叫後端 API
        //    確保後端有對應的受保護端點，例如 POST /api/editAsset
        const response = await fetchWithAuth(`${API_BASE_URL}/editAsset`, { // 使用 fetchWithAuth
            method: 'POST', // 或 'PUT', 依後端設計
            body: JSON.stringify(formData) // 發送 assetId, date, new_value
        });

        // 6. 檢查後端回應
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "編輯失敗，無法解析伺服器錯誤回應" }));
            throw new Error(errorData.error || `伺服器錯誤 (${response.status})`);
        }

        // --- 執行成功 ---
        console.log("資產編輯成功:", await response.json());

        // 7. 關閉模態框
        if (modalInstance) {
            modalInstance.hide();
        } else {
            if (recordModalElement) recordModalElement.style.display = 'none'; // Fallback
        }

        alert('資產編輯成功！');

        // 8. 刷新相關數據顯示 (非常重要)
        console.log("正在刷新資產列表和首頁摘要...");
        // 重新渲染資產卡片列表 (包含現金和其他資產)
        await renderAssetCardsForAccount(); // (內部應使用 fetchWithAuth)
        // 如果編輯的也可能是股票，也要刷新股票列表
        await renderStockCardsForAccount(); // (內部應使用 fetchWithAuth)
        // 更新首頁的總資產等摘要資訊
        await updateHomePage(); // (內部應使用 fetchWithAuth)

    } catch (error) {
        // --- 處理錯誤 ---
        console.error('編輯資產失敗:', error);
        alert(`編輯資產失敗：${error.message}`);
        // fetchWithAuth 內部可能已處理 401/403 錯誤

    } finally {
        // --- 無論成功失敗，恢復按鈕狀態 ---
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交';
        }
    }
}

/**
 * 處理主要記帳表單 (#accountForm) 的提交事件。
 * 用於新增一筆支出或收入記錄。
 */
async function submitAccountData(event) {
    event.preventDefault(); // 阻止表單的預設提交行為

    const user = auth.currentUser; // 獲取當前登入的 Firebase 使用者
    if (!user) {
        // 如果使用者未登入，提示並顯示登入框
        alert('請先登入才能記帳！');
        showLoginModal(); // 顯示登入模態框
        return;
    }

    const form = document.getElementById('accountForm');
    const submitButton = document.getElementById('submitAccountBtn'); // 記帳表單的提交按鈕

    // 1. 使用 HTML5 表單驗證
    if (!form || !form.checkValidity()) {
        form?.reportValidity(); // 顯示瀏覽器內建的驗證提示
        return;
    }

    // 2. 禁用提交按鈕，防止重複提交
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
    }

    // 3. 從表單收集數據
    const formData = {
        date: document.getElementById('inputDate1').value,
        items: document.getElementById('items').value,
        category: document.getElementById('category').value,
        transactionType: document.getElementById('transactionType').value,
        amount: parseFloat(document.getElementById('amount').value),
        payment_method: document.getElementById('payment_method').value,
        // 對於可選欄位，如果為空，傳遞 null 或空字串
        merchant: document.getElementById('merchant').value || null,
        invoice_number: document.getElementById('invoice_number').value || null,
        notes: document.getElementById('notes').value || null,
    };

    // 4. 額外的前端驗證 (例如：金額必須是正數)
    if (isNaN(formData.amount) || formData.amount <= 0) {
         alert('請輸入有效的正數金額！');
         if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '提交記帳'; // 恢復按鈕文字
         }
         return; // 阻止提交
    }
    // 確保選擇了必要的下拉選項
    if (!formData.category || !formData.transactionType || !formData.payment_method) {
         alert('請確保已選擇類別、收支類型和支付方式！');
         if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '提交記帳';
         }
         return;
    }

    console.log("正在提交記帳資料:", formData);

    try {
        // 5. 使用 fetchWithAuth 呼叫受保護的後端 API
        //    後端 API 端點應為 /api/submitAccount (POST)
        const response = await fetchWithAuth(`${API_BASE_URL}/submitAccount`, { // 使用 fetchWithAuth
            method: 'POST',
            body: JSON.stringify(formData) // 發送收集到的表單數據
        });

        // 6. 檢查後端回應
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "提交失敗，無法解析伺服器錯誤回應" }));
            // 將後端錯誤訊息或其他訊息拋出
            throw new Error(errorData.error || `提交失敗 (${response.status})`);
        }

        const result = await response.json(); // 獲取後端回應

        // --- 執行成功 ---
        form.reset(); // 清空表單欄位
        initDate(); // 將日期欄位重設為今天
        alert('記帳成功！'); // 提示使用者成功
        console.log("記帳資料提交成功:", result);

        // 7. **可選操作：成功後刷新相關資料**
        //    (根據需要取消註解或添加刷新邏輯)
        // if (window.location.hash.includes('managePage')) {
        //     console.log("嘗試刷新管理頁面紀錄...");
        //     currentPage = 1; hasMore = true;
        //     if(domCache.tableBody) domCache.tableBody.innerHTML = '';
        //     await fetchRecords(currentPage);
        // } else if (window.location.hash.includes('homePage')) {
        //     console.log("嘗試刷新首頁資料...");
        //     await updateHomePage();
        // }

    } catch (error) {
        // --- 處理錯誤 ---
        console.error('提交記帳資料失敗:', error);
        alert(`提交記帳資料失敗：${error.message}`);
        // fetchWithAuth 內部會處理 401/403 錯誤

    } finally {
        // --- 無論成功或失敗，恢復按鈕狀態 ---
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交記帳';
        }
    }
}


/**
 * 處理新增貼文表單 (#postForm) 的提交事件。
 * 會將文字內容和圖片打包成 FormData 上傳。
 */
async function handlePostSubmit(event) {
    event.preventDefault(); // 阻止表單的預設提交

    const user = auth.currentUser; // 獲取當前登入的 Firebase 使用者
    if (!user) {
        alert('請先登入才能發布貼文！');
        closePostModal(); // 關閉可能意外打開的 Modal
        showLoginModal(); // 顯示登入框
        return;
    }

    const form = document.getElementById('postForm');
    const submitButton = form?.querySelector('button[type="submit"]'); // 獲取提交按鈕

    // 檢查表單是否存在
    if (!form) {
        console.error("Post form not found!");
        return;
    }

    // 禁用按鈕，防止重複提交
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '發布中...';
    }

    // 1. 使用 FormData 收集表單數據 (包含檔案)
    const formData = new FormData(form);

    // 2. (可選，取決於後端設計) 添加 userId 或 username 到 FormData
    //    雖然最佳實踐是後端從 Token 提取 UID，但有時後端也可能需要這個欄位
    // formData.append('userId', user.uid);
    // formData.append('username', user.displayName || user.email);

    // 3. 檢查是否有內容 (簡單驗證)
    const content = formData.get('content'); // 獲取 name="content" 的值
    if (!content || content.trim() === '') {
         alert("請輸入貼文內容！");
         if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '發布';
         }
         return;
    }


    console.log("正在提交貼文...");

    try {
        // 4. 獲取 Firebase ID Token
        const idToken = await user.getIdToken();

        // 5. 發送請求到後端貼文 API
        //    **注意：** 發送 FormData 時，不需要手動設定 'Content-Type' header，
        //    瀏覽器會自動設定為 'multipart/form-data' 並包含邊界(boundary)。
        //    我們只需要添加 'Authorization' header。
        const response = await fetch(`${POST_API_BASE_URL}/posts`, { // 指向你的貼文後端
            method: 'POST',
            headers: {
                // 不需要 'Content-Type': 'application/json' 或 'multipart/form-data'
                'Authorization': `Bearer ${idToken}` // 只需添加認證 Token
            },
            body: formData // 直接發送 FormData 物件
        });

        // 6. 處理後端回應
        const result = await response.json(); // 嘗試解析 JSON 回應
        if (!response.ok) {
            // 如果後端返回錯誤
            throw new Error(result.error || `貼文提交失敗 (${response.status})`);
        }

        // --- 執行成功 ---
        console.log("貼文提交成功:", result);
        alert('貼文發布成功！');

        // 7. 清理工作
        form.reset(); // 清空表單 (會觸發 reset 事件，進而清除圖片預覽)
        closePostModal(); // 關閉貼文模態框

        // 8. 刷新貼文列表
        await loadPosts(); // 重新載入貼文

    } catch (error) {
        // --- 處理錯誤 ---
        console.error('提交貼文失敗:', error);
        alert(`發布失敗：${error.message}`);
        // 如果是 401/403 錯誤，可能需要處理登出 (雖然 fetchWithAuth 這裡沒用到，但可加入類似邏輯)
        if (error.message.includes('Authorization failed') || error.message.includes('伺服器拒絕存取')) {
             handleLogout(); // 例如：如果授權失敗則登出
        }

    } finally {
        // --- 無論成功失敗，恢復按鈕狀態 ---
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '發布';
        }
    }
}



/**
 * 更新開銷追蹤器中的開銷明細列表。
 * 現在會渲染包含編輯和刪除按鈕的卡片。
 * @param {Array<object>} expenses - 要顯示的開銷記錄陣列 (或其他收支記錄)。
 */
function updateExpenseList(expenses) {
    const container = document.getElementById('expenseListContainer'); // 獲取列表容器
    if (!container) {
        console.error("updateExpenseList: Cannot find container #expenseListContainer.");
        return;
    }

    container.innerHTML = ''; // 清空舊列表

    // 檢查是否有記錄
    if (!expenses || expenses.length === 0) {
        container.innerHTML = '<p class="no-account-message">此期間沒有開銷記錄</p>';
        return;
    }

    // 按日期排序 (降序，最新的在前面)
    // 確保 date 屬性存在且格式可比較
    try {
        expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (e) {
        console.warn("無法按日期排序記錄:", e); // 如果日期格式有問題，不排序
    }


    const fragment = document.createDocumentFragment(); // 使用片段提高性能

    expenses.forEach(item => {
        // 確保記錄有 ID，否則無法編輯/刪除
        if (!item || typeof item.id === 'undefined') {
             console.warn("Skipping record without id:", item);
             return; // 跳過沒有 ID 的記錄
        }

        const card = document.createElement('div');
        // 根據 transactionType 添加 class (如果 expense 數據中有此欄位)
        // 假設 updateExpenseTracker 傳來的 expenses 陣列中包含 transactionType
        const typeClass = item.transactionType === '收入' ? 'income-card' : 'expense-card';
        card.className = `record-card ${typeClass}`; // 例如: "record-card expense-card"
        card.dataset.recordId = item.id; // 添加 data-* 屬性

        // 判斷金額顯示的 class
        const amountClass = item.transactionType === '收入' ? 'income-amount' : 'expense-amount';

        // --- 生成卡片內部 HTML (包含編輯/刪除按鈕) ---
        card.innerHTML = `
            <div class="record-header">
                <span>${item.date || '無日期'}</span>
                <span style="font-size: 0.7em; color: #aaa;">${item.category || ''}</span> </div>
            <div class="record-item">
                <span>${item.item || '無項目'}</span>
                <span class="${amountClass}">${formatNumber(item.amount || 0)}</span>
            </div>
            <div class="record-actions"> <button class="btn-custom acc-btn" onclick='openEditRecordModal(${JSON.stringify(item)})'>編輯</button>
                <button class="btn-custom acc-btn" style="background: var(--danger)" onclick="deleteRecord('${item.id}', event)">刪除</button>
            </div>
        `;
        // --- HTML 結束 ---

        // --- 為卡片本身添加點擊事件，用於展開/收起操作按鈕 ---
        card.addEventListener('click', (e) => {
            // 如果點擊的是按鈕，則不觸發卡片效果
            if (e.target.closest('.acc-btn')) {
                return;
            }
            // 切換 .active class 來控制 .record-actions 的顯示 (需 CSS 配合)
            card.classList.toggle('active');
        });
        // --- 事件監聽結束 ---

        fragment.appendChild(card); // 加入片段
    });

    container.appendChild(fragment); // 將所有卡片一次性渲染到頁面
}

/**
 * 計算兩個日期字串之間相差的天數 (包含起始和結束當天)。
 * @param {string} startDate - 開始日期字串 (格式應為 YYYY/MM/DD)。
 * @param {string} endDate - 結束日期字串 (格式應為 YYYY/MM/DD)。
 * @returns {number} 相差的天數，如果日期無效則返回 0 或 1 (取決於處理邏輯)。
 */
function getDaysDifference(startDate, endDate) {
    try {
        // 嘗試將 YYYY/MM/DD 轉換為 Date 物件
        // 替換 '/' 為 '-' 以提高 new Date() 的兼容性
        const start = new Date(startDate.replace(/\//g, '-'));
        const end = new Date(endDate.replace(/\//g, '-'));

        // 檢查日期是否有效
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            console.warn("getDaysDifference: 無效的日期輸入", startDate, endDate);
            return 0; // 或返回 1，視乎如何定義 0 天
        }

        // 計算時間差 (毫秒)
        const diffTime = Math.abs(end - start);
        // 轉換為天數 (向上取整，並 +1 表示包含首尾兩天)
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;

    } catch (error) {
        console.error("getDaysDifference 計算出錯:", error, startDate, endDate);
        return 0; // 出錯時返回 0
    }
}

/**
 * 更新開銷追蹤器中的摘要資訊區域。
 * @param {Array<object>} expenses - 已過濾的支出記錄陣列 (包含 amount 屬性)。
 * @param {string} startDate - 計算範圍的開始日期 (格式 YYYY/MM/DD)。
 * @param {string} endDate - 計算範圍的結束日期 (格式 YYYY/MM/DD)。
 */
function updateExpenseSummary(expenses, startDate, endDate) {
    console.log("Updating expense summary for the period...");

    // 1. 計算總開銷
    const totalExpense = expenses.reduce((sum, item) => {
        // 確保 amount 是數字再累加
        const amount = parseFloat(item.amount || 0);
        return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // 2. 計算期間天數
    //    確保 getDaysDifference 函數已定義
    const days = getDaysDifference(startDate, endDate);

    // 3. 計算平均每日開銷 (處理天數為 0 的情況)
    const avgDailyExpense = (days > 0) ? (totalExpense / days) : 0;

    // 4. 計算交易筆數
    const transactionCount = expenses.length;

    // 5. 更新 HTML 元素的文字內容 (使用 jQuery，保持與原碼一致)
    //    使用 try-catch 避免因 jQuery 未載入或元素不存在而出錯
    try {
        const totalEl = $('#totalExpense');
        const avgEl = $('#averageDailyExpense');
        const countEl = $('#transactionCount');

        if(totalEl.length) { // 檢查元素是否存在
             totalEl.text(`NT$ ${formatNumber(totalExpense)}`);
        } else { console.warn("#totalExpense element not found."); }

        if(avgEl.length) {
             avgEl.text(`NT$ ${formatNumber(avgDailyExpense.toFixed(0))}`); // 平均值取整數
        } else { console.warn("#averageDailyExpense element not found."); }

        if(countEl.length) {
             countEl.text(transactionCount);
        } else { console.warn("#transactionCount element not found."); }

        console.log(`Summary updated: Total=${totalExpense}, AvgDaily=${avgDailyExpense.toFixed(0)}, Count=${transactionCount}`);

    } catch (error) {
        console.error("更新開銷摘要 UI 時出錯 (jQuery 或元素問題):", error);
        // 如果 jQuery 出錯，可以嘗試用原生 JS 作為備案
        // document.getElementById('totalExpense').textContent = `NT$ ${formatNumber(totalExpense)}`;
        // ... etc.
    }
}

// scripts.js

/**
 * 輔助函數：將 JavaScript 的 Date 物件格式化為 "YYYY/MM/DD" 字串。
 * @param {Date} dateObject - 要格式化的 Date 物件。
 * @returns {string} 返回 "YYYY/MM/DD" 格式的字串，如果輸入無效則返回空字串。
 */
function formatDateToYyyyMmDd(dateObject) {
    // 檢查輸入是否為有效的 Date 物件
    if (!(dateObject instanceof Date) || isNaN(dateObject.getTime())) {
        console.warn("formatDateToYyyyMmDd: Input is not a valid Date object.");
        return ''; // 或者可以返回 null 或其他錯誤指示符
    }

    try {
        // 獲取年份
        const year = dateObject.getFullYear();
        // 獲取月份 (getMonth() 返回 0-11，所以需要 +1)
        // 使用 String() 轉換為字串，再用 padStart 補零確保兩位數
        const month = String(dateObject.getMonth() + 1).padStart(2, '0');
        // 獲取日期
        const day = String(dateObject.getDate()).padStart(2, '0');
        // 組合並返回 YYYY/MM/DD 格式的字串
        return `${year}/${month}/${day}`;

    } catch (error) {
        console.error("Error formatting date object:", error, dateObject);
        return ''; // 出錯時返回空字串
    }
}

/**
 * 根據提供的支出記錄，更新開銷追蹤器中的分類佔比圖 (Doughnut) 和每日趨勢圖 (Line)。
 * 同時會呼叫 renderCategoryTable 來更新分類表格。
 * @param {Array<object>} expenses - 已過濾的支出記錄陣列 (包含 category, amount, date 屬性)。
 */
function updateExpenseCharts(expenses) {
    console.log("Updating expense charts...");

    // --- 1. 處理數據：按類別匯總金額 ---
    const categories = {};
    expenses.forEach(item => {
        const category = item.category || '其他'; // 若無類別，歸類為 "其他"
        const amount = parseFloat(item.amount || 0);
        if (!isNaN(amount)) {
            categories[category] = (categories[category] || 0) + amount;
        }
    });
    console.log("Categories data for chart:", categories);

    // --- 2. 處理數據：按日期匯總金額 ---
    const dailyExpenses = {};
    expenses.forEach(item => {
        if (item.date) { // 確保有日期
             // 只取日期部分 YYYY/MM/DD，忽略時間（如果有的話）
            const datePart = item.date.split(' ')[0];
            const amount = parseFloat(item.amount || 0);
            if (!isNaN(amount) && isValidDate(datePart)) { // 確保日期有效
                 dailyExpenses[datePart] = (dailyExpenses[datePart] || 0) + amount;
            }
        }
    });
     // 按日期排序，以便趨勢圖 X 軸正確
     const sortedDates = Object.keys(dailyExpenses).sort((a, b) => new Date(a.replace(/\//g, '-')) - new Date(b.replace(/\//g, '-')));
     console.log("Daily expenses data for chart:", dailyExpenses);


    // --- 3. 銷毀舊的圖表實例 (防止重複渲染和記憶體洩漏) ---
    if (domCache.expenseCategoryChart instanceof Chart) { // 檢查是否為 Chart 實例
        domCache.expenseCategoryChart.destroy();
        domCache.expenseCategoryChart = null;
        console.log("Destroyed previous category chart instance.");
    }
    if (domCache.expenseTrendsChart instanceof Chart) { // 檢查是否為 Chart 實例
        domCache.expenseTrendsChart.destroy();
        domCache.expenseTrendsChart = null;
        console.log("Destroyed previous trends chart instance.");
    }

    // --- 4. 獲取 Canvas 元素和上下文 ---
    const categoryCanvas = document.getElementById('expenseCategoryChart');
    const trendsCanvas = document.getElementById('expenseTrendsChart');
    const categoryCtx = categoryCanvas?.getContext('2d');
    const trendsCtx = trendsCanvas?.getContext('2d');

    // --- 5. 渲染「消費占比」圓環圖 ---
    if (categoryCtx) {
        const categoryLabels = Object.keys(categories);
        const categoryAmounts = Object.values(categories);
        // 計算百分比供表格使用
        const totalAmount = categoryAmounts.reduce((sum, value) => sum + value, 0);
        const categoryPercentages = categoryAmounts.map(amount => totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : 0);


        // 確保有數據才渲染圖表
        if (categoryLabels.length > 0 && categoryAmounts.length > 0) {
            domCache.expenseCategoryChart = new Chart(categoryCtx, {
                type: 'doughnut', // 或 'pie'
                data: {
                    labels: categoryLabels,
                    datasets: [{
                        label: '消費金額', // tooltip 標籤
                        data: categoryAmounts,
                        // 可以定義更多顏色或使用 Chart.js 的預設顏色
                        backgroundColor: ['#7ed321', '#ff6b6b', '#4a90e2', '#f8e71c', '#50e3c2', '#ff9f1c', '#9b59b6', '#e91e63', '#00bcd4', '#8bc34a'],
                        borderColor: '#ffffff', // 邊框顏色
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // 允許圖表調整高度
                    plugins: {
                        legend: {
                            position: 'right', // 圖例位置
                            labels: { boxWidth: 12, padding: 15 }
                        },
                        title: {
                            display: true,
                            text: '消費占比',
                            padding: { top: 10, bottom: 10 }
                        },
                        tooltip: {
                             callbacks: {
                                 label: function(context) {
                                     let label = context.label || '';
                                     if (label) { label += ': '; }
                                     const value = context.raw || 0;
                                     const percentage = categoryPercentages[context.dataIndex] || 0; // 從預計算的百分比獲取
                                     label += `NT$ ${formatNumber(value)} (${percentage}%)`;
                                     return label;
                                 }
                             }
                        }
                    }
                }
            });
            console.log("Category chart rendered.");
             // 渲染分類表格
             renderCategoryTable(categoryLabels, categoryAmounts, categoryPercentages);
        } else {
             console.log("No category data to render chart.");
              renderCategoryTable([], [], []); // 清空表格
              // 可以在 Canvas 上顯示 "無數據"
               categoryCtx.clearRect(0, 0, categoryCanvas.width, categoryCanvas.height);
               categoryCtx.textAlign = 'center';
               categoryCtx.fillText('無消費分類數據', categoryCanvas.width / 2, categoryCanvas.height / 2);
        }


    } else {
        console.warn("updateExpenseCharts: Canvas context for 'expenseCategoryChart' not found.");
    }

    // --- 6. 渲染「每日開銷趨勢」折線圖 ---
    if (trendsCtx) {
        // 確保有數據才渲染圖表
         if (sortedDates.length > 0) {
            domCache.expenseTrendsChart = new Chart(trendsCtx, {
                type: 'line',
                data: {
                    labels: sortedDates, // X 軸標籤 (已排序的日期)
                    datasets: [{
                        label: '每日開銷', // 圖例標籤
                        data: sortedDates.map(date => dailyExpenses[date]), // Y 軸數據
                        borderColor: '#4a90e2', // 線條顏色
                        backgroundColor: 'rgba(74, 144, 226, 0.1)', // 填充顏色
                        tension: 0.1, // 線條平滑度 (0 為直線)
                        fill: true,   // 啟用區域填充
                        pointBackgroundColor: '#4a90e2', // 數據點顏色
                        pointRadius: 3, // 數據點半徑
                        pointHoverRadius: 5 // 滑鼠懸停時數據點半徑
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // 允許圖表調整高度
                    plugins: {
                        legend: { display: false }, // 通常趨勢圖不需要顯示圖例標籤
                        title: { display: true, text: '每日開銷趨勢', padding: { top: 10, bottom: 10 } },
                         tooltip: {
                              callbacks: {
                                   label: function(context) {
                                        let label = context.dataset.label || '';
                                        if (label) { label += ': '; }
                                        const value = context.raw || 0;
                                        label += `NT$ ${formatNumber(value)}`;
                                        return label;
                                   }
                              }
                         }
                    },
                    scales: {
                        y: {
                            beginAtZero: true, // Y 軸從 0 開始
                            ticks: {
                                 // 可以格式化 Y 軸刻度
                                 callback: function(value, index, values) {
                                     return 'NT$ ' + formatNumber(value);
                                 }
                            }
                        },
                        x: {
                             // 可以設定 X 軸刻度顯示方式，例如只顯示部分日期避免擁擠
                             // maxTicksLimit: 10
                        }
                    }
                }
            });
             console.log("Trends chart rendered.");
        } else {
             console.log("No daily expense data to render chart.");
              // 可以在 Canvas 上顯示 "無數據"
               trendsCtx.clearRect(0, 0, trendsCanvas.width, trendsCanvas.height);
               trendsCtx.textAlign = 'center';
               trendsCtx.fillText('無每日開銷數據', trendsCanvas.width / 2, trendsCanvas.height / 2);
        }

    } else {
        console.warn("updateExpenseCharts: Canvas context for 'expenseTrendsChart' not found.");
    }
}

/**
 * 將消費分類數據渲染到 HTML 表格中。
 * @param {string[]} labels - 包含所有消費類別名稱的陣列。
 * @param {number[]} amounts - 與 labels 對應的每個類別的總金額陣列。
 * @param {string[]} percentages - 與 labels 對應的每個類別的占比字串陣列 (例如 '15.5%')。
 */
function renderCategoryTable(labels, amounts, percentages) {
    const tbody = document.getElementById('categoryTableBody'); // 獲取表格主體元素
    if (!tbody) {
        console.error("renderCategoryTable: Table body element (#categoryTableBody) not found.");
        return; // 找不到容器，無法渲染
    }

    console.log("Rendering category table...");
    tbody.innerHTML = ''; // 清空現有的表格內容

    // 檢查是否有數據需要渲染
    if (!labels || labels.length === 0) {
        // 如果沒有數據，顯示提示行
        tbody.innerHTML = '<tr><td colspan="3" class="no-data" style="text-align: center; color: var(--text-secondary);">無分類數據</td></tr>';
        console.log("No category data to render in table.");
        return;
    }

    // 檢查傳入的陣列長度是否一致 (基本健壯性檢查)
    if (amounts.length !== labels.length || percentages.length !== labels.length) {
        console.error("renderCategoryTable: Input arrays (labels, amounts, percentages) have different lengths.");
        tbody.innerHTML = '<tr><td colspan="3" class="no-data text-danger">數據錯誤</td></tr>';
        return;
    }

    // 遍歷數據，為每個類別創建一個表格行 (<tr>)
    labels.forEach((category, index) => {
        const row = document.createElement('tr'); // 創建一個新的 <tr> 元素

        // 創建包含類別名稱、格式化後金額和百分比的單元格 (<td>)
        row.innerHTML = `
            <td>${category || '未知類別'}</td>
            <td>NT$ ${formatNumber(amounts[index] || 0)}</td>
            <td>${percentages[index] || '0.0'}%</td>
        `;
        // 注意：這裡假設 percentage 字符串已包含 '%' 符號

        tbody.appendChild(row); // 將創建的行添加到 tbody 中
    });

    console.log(`Category table rendered with ${labels.length} rows.`);
}
/**
 * 根據選定的日期範圍（或預設為當月）從後端獲取開銷記錄並更新 UI。
 */
async function updateExpenseTracker() {
    const user = auth.currentUser;
    if (!user) {
        // ... (未登入處理) ...
        return;
    }

    // 檢查 jQuery 是否可用
    if (typeof $ === 'undefined' || typeof $.fn.datepicker === 'undefined') {
        console.error("updateExpenseTracker: jQuery or Datepicker not loaded.");
        // ... (顯示錯誤) ...
        return;
    }

    let startDate = $('#startDate').val(); // 嘗試讀取開始日期
    let endDate = $('#endDate').val();   // 嘗試讀取結束日期
    let usingDefaultRange = false;       // 標記是否使用了預設日期

    // 檢查讀取的日期是否有效
    if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
        console.log("無效或空的日期輸入，將使用當月作為預設範圍。");
        usingDefaultRange = true;

        // --- 計算當月日期範圍 ---
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        // 將計算出的日期格式化為 YYYY/MM/DD
        startDate = formatDateToYyyyMmDd(firstDayOfMonth);
        endDate = formatDateToYyyyMmDd(lastDayOfMonth);

        // (可選) 將計算出的預設日期更新回日期選擇器輸入框中
        try {
             $('#startDate').datepicker('setDate', firstDayOfMonth);
             $('#endDate').datepicker('setDate', lastDayOfMonth);
        } catch(e) { console.error("更新日期選擇器為預設值時出錯:", e); }
        // --- 日期計算結束 ---
    }

    console.log(`Updating expense tracker for range: ${startDate} to ${endDate} ${usingDefaultRange ? '(Default)' : '(User Selected)'}`);

    // --- 後續邏輯 (顯示 Spinner, 清空舊數據) ---
    const spinner = $('#submitSpinner');
    if(spinner.length) spinner.removeClass('d-none');
    const listContainer = document.getElementById('expenseListContainer');
    if(listContainer) listContainer.innerHTML = '<p class="no-account-message">載入開銷明細中...</p>';
    // ... (清空圖表和表格) ...
    if (domCache.expenseCategoryChart) { domCache.expenseCategoryChart.destroy(); domCache.expenseCategoryChart = null;}
    if (domCache.expenseTrendsChart) { domCache.expenseTrendsChart.destroy(); domCache.expenseTrendsChart = null; }
    const categoryTableBody = document.getElementById('categoryTableBody');
    if(categoryTableBody) categoryTableBody.innerHTML = '<tr><td colspan="3" class="no-data">載入中...</td></tr>';
    // 重置摘要
    $('#totalExpense').text(`NT$ 0`);
    $('#averageDailyExpense').text(`NT$ 0`);
    $('#transactionCount').text(0);
    // --- 清理結束 ---

    try {
        // --- 使用最終確定的 startDate 和 endDate 進行 API 請求 ---
        const response = await fetchWithAuth(`${API_BASE_URL}/recordsByDateRange?start_date=${startDate}&end_date=${endDate}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `載入開銷數據失敗 (${response.status})`);
        }
        const data = await response.json();
        const expenses = data.records.filter(record => record.transactionType === '支出');

        // --- 更新 UI ---
        updateExpenseSummary(expenses, startDate, endDate);
        updateExpenseCharts(expenses);
        updateExpenseList(expenses);

    } catch (error) {
        console.error('載入或更新開銷追蹤數據失敗:', error);
        // ... (錯誤處理，顯示錯誤訊息) ...
         const container = domCache.expenseTrackerContainer || document.getElementById('expenseTrackerContainer');
         if(container) container.innerHTML = `<p class="no-account-message text-danger">載入開銷數據失敗：${error.message}</p>`;
    } finally {
        // --- 隱藏 Spinner ---
        if(spinner.length) spinner.addClass('d-none');
    }
}


/**
 * 輔助函數：檢查日期字串是否為 YYYY/MM/DD 格式
 * @param {string} dateString
 * @returns {boolean}
 */
function isValidDate(dateString) {
    if (!dateString) return false;
    const regex = /^\d{4}\/\d{2}\/\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    // 檢查 Date 物件是否有效，並驗證年月日是否匹配 (避免像 2023/02/30 被解析成 3 月)
    const [year, month, day] = dateString.split('/').map(Number);
    return !isNaN(date.getTime()) &&
           date.getFullYear() === year &&
           date.getMonth() + 1 === month &&
           date.getDate() === day;
}


/**
 * 初始化開銷追蹤介面的功能。
 * @param {string} uid 當前登入使用者的 Firebase UID (雖然此函數可能不直接使用，但表明是登入後初始化)。
 */
function initExpenseTracker(uid) {
    if (!uid) {
        console.error("initExpenseTracker called without user UID.");
        return; // 如果沒有 UID，不執行初始化
    }
    console.log("Initializing expense tracker UI components...");

    // 檢查 jQuery 和 Datepicker 是否已載入
    if (typeof $ === 'undefined' || typeof $.fn.datepicker === 'undefined') {
        console.error("錯誤：jQuery 或 Bootstrap Datepicker 未載入，無法初始化開銷追蹤器。");
        // 可以在這裡顯示錯誤訊息給使用者
        const trackerContainer = document.getElementById('expenseTrackerContainer');
        if (trackerContainer) {
            trackerContainer.innerHTML = '<p class="text-danger text-center">無法載入日期選擇器元件。</p>';
        }
        return;
    }

    // 使用 try-catch 包裹 jQuery 操作，增加健壯性
    try {
        // 1. 初始化日期選擇器
        const datepickerElements = $('.datepicker');
        if (datepickerElements.length > 0) {
            // 先銷毀可能存在的舊實例，避免重複初始化問題
            datepickerElements.datepicker('destroy');
            // 重新初始化
            datepickerElements.datepicker({
                format: 'yyyy/mm/dd',    // 日期格式
                autoclose: true,         // 選擇後自動關閉
                todayHighlight: true,    // 高亮顯示今天
                language: 'zh-TW',       // 可選：設定語言 (需要引入對應語言檔)
                orientation: "bottom auto" // 自動決定彈出方向
            });
            console.log("Datepickers initialized.");
        } else {
            console.warn("Datepicker elements (.datepicker) not found.");
        }

        // 2. 綁定快速選擇按鈕事件
        //    使用 .off('click').on('click', ...) 確保事件只被綁定一次
        $('#thisMonth').off('click').on('click', () => setDateRange('thisMonth'));
        $('#lastMonth').off('click').on('click', () => setDateRange('lastMonth'));
        $('#thisYear').off('click').on('click', () => setDateRange('thisYear'));
        $('#moreDateBtn').off('click').on('click', toggleDatePicker);
        console.log("Quick date range buttons listeners attached.");

        // 3. 設定預設日期範圍 (例如本月)
        setDateRange('thisMonth');

        // 4. 綁定日期範圍查詢表單提交事件
        const dateRangeForm = $('#dateRangeForm');
        if (dateRangeForm.length > 0) {
            dateRangeForm.off('submit'); // 移除舊的監聽器
            dateRangeForm.on('submit', (e) => {
                e.preventDefault(); // 阻止表單預設提交
                console.log("Date range form submitted, calling updateExpenseTracker...");
                // 不需要傳遞 account/uid，updateExpenseTracker 內部會從 auth.currentUser 獲取
                updateExpenseTracker();
            });
            console.log("Date range form submit listener attached.");
        } else {
            console.warn("Date range form (#dateRangeForm) not found.");
        }

    } catch (error) {
        console.error("初始化開銷追蹤器時發生錯誤:", error);
        // 向使用者顯示錯誤
        const trackerContainer = document.getElementById('expenseTrackerContainer');
        if (trackerContainer) {
            trackerContainer.innerHTML = '<p class="text-danger text-center">載入開銷追蹤元件時發生錯誤。</p>';
        }
    }
}

// --- 確保以下相關輔助函數已定義 ---

/**
 * 切換自訂日期選擇器的顯示/隱藏。
 */
function toggleDatePicker() {
    const datePickerContainer = document.getElementById('datePickerContainer');
    if (!datePickerContainer) return;
    const isHidden = datePickerContainer.style.display === 'none';
    datePickerContainer.style.display = isHidden ? 'flex' : 'none'; // 改為 flex 以便排版

    // 如果是顯示狀態，且日期為空，則預設填入本月
    if (isHidden) {
        const startDate = $('#startDate').val();
        const endDate = $('#endDate').val();
        if (!startDate || !endDate) {
            setDateRange('thisMonth');
        }
    }
}

/**
 * 根據指定的期間（'thisMonth', 'lastMonth', 'thisYear'）設定日期選擇器的值。
 * @param {string} period - 時間期間 ('thisMonth', 'lastMonth', 'thisYear')
 */
function setDateRange(period) {
    const today = new Date();
    let firstDay, lastDay;

    if (period === 'thisMonth') {
        firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (period === 'lastMonth') {
        firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (period === 'thisYear') {
        firstDay = new Date(today.getFullYear(), 0, 1);
        lastDay = new Date(today.getFullYear(), 11, 31);
    } else {
         console.warn("Invalid period specified for setDateRange:", period);
         return; // 如果期間無效則不操作
    }

    // 使用 jQuery datepicker 的 setDate 方法來設定日期
    try {
        $('#startDate').datepicker('setDate', firstDay);
        $('#endDate').datepicker('setDate', lastDay);
        console.log(`Date range set to ${period}:`,
            firstDay.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }), // Log 格式化後的日期
            lastDay.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
        );
    } catch(error) {
         console.error("Error setting date range using datepicker:", error);
    }

}



/**
 * 設定需要使用者登入後才能使用的靜態元素的事件監聽器。
 * @param {firebase.User} user - 當前登入的 Firebase 使用者物件。
 */
function setupEventListeners(user) {
    // 再次確認 user 物件存在
    if (!user) {
        console.error("setupEventListeners called without a valid user.");
        return;
    }
    console.log(`Setting up event listeners for logged-in user: ${user.uid}`);

    // --- Helper function to safely add listeners ---
    // 確保元素存在且只綁定一次
    const addSafeListener = (elementId, eventType, handler) => {
        const element = document.getElementById(elementId);
        if (element) {
            // 移除舊監聽器 (基於函數引用，如果函數是匿名則無效)
            // 對於 submit 按鈕，通常不需要移除再添加，因為 initializeApp 只調用一次
            // 但對於其他可能重複觸發的，最好先移除
            // element.removeEventListener(eventType, handler);
            element.addEventListener(eventType, handler);
            // console.log(`Listener ${eventType} added to #${elementId}`);
        } else {
            // 允許某些元素在特定頁面不存在
            // console.warn(`Element #${elementId} not found during listener setup.`);
        }
    };

    // --- 綁定各個表單提交和按鈕點擊事件 ---

    // 1. 編輯資產 Modal 提交按鈕 (#recordModal 內的提交)
    addSafeListener('submitRecordBtn', 'click', handleSubmitRecord);

    // 2. 記帳表單提交按鈕 (#chargePage 內的)
    addSafeListener('submitAccountBtn', 'click', submitAccountData);

    // 3. 資產表單提交按鈕 (#chargePage 內的)
    addSafeListener('submitAssetBtn', 'click', submitAssetData);

    // 4. 快速發文輸入框點擊 (打開貼文 Modal)
    addSafeListener('quickPostInput', 'click', openPostModal);

    // 5. 貼文 Modal 相關
    const postFormElement = document.getElementById('postForm');
    if (postFormElement) {
        postFormElement.removeEventListener('submit', handlePostSubmit); // 移除舊的
        postFormElement.addEventListener('submit', handlePostSubmit);   // 添加新的
        postFormElement.removeEventListener('reset', clearImagePreview);// 移除舊的
        postFormElement.addEventListener('reset', clearImagePreview);  // 添加新的
        console.log("Listeners added to #postForm");
    }
    addSafeListener('closePostFormBtn', 'click', closePostModal);
    const postModalElement = document.getElementById('postModal');
    if (postModalElement) {
         // 移除舊的匿名函數監聽器比較困難，這裡假設只綁定一次
         // 如果擔心重複，可以在 closePostModal 內部處理背景點擊
         postModalElement.addEventListener('click', (e) => { if (e.target === postModalElement) closePostModal(); });
         console.log("Background click listener added to #postModal");
    }

    // 6. 貼文圖片上傳預覽
    addSafeListener('postImage', 'change', handleImagePreview);

    // 7. 初始化開銷追蹤功能 (它內部會處理自己的事件)
    // 傳遞 uid 以便內部函數知道當前用戶 (如果需要的話)
    initExpenseTracker(user.uid);

    // --- 其他需要登入才能操作的靜態按鈕 ---
    // 例如：控制列中的按鈕 (如果它們的操作需要登入)
    // addSafeListener('showAssetsBtn', 'click', () => switchDataView('assets'));
    // addSafeListener('showStocksBtn', 'click', () => switchDataView('stocks'));
    // addSafeListener('showDailyReportBtn', 'click', () => switchHomeView('dailyReport'));
    // addSafeListener('showExpenseTrackerBtn', 'click', () => switchHomeView('expenseTracker'));
    // 注意：這些按鈕的 onclick 屬性已經在 HTML 中設定了，
    // 除非你想移除 HTML 中的 onclick 並完全用 JS 控制，否則不需要在這裡重複綁定。


    console.log("Static event listeners setup complete.");
}

// --- 確保以下被呼叫的函數都已定義 ---
// handleSubmitRecord, submitAccountData, submitAssetData, openPostModal,
// handlePostSubmit, closePostModal, handleImagePreview, clearImagePreview,
// initExpenseTracker

// (之前已提供的 handleRegisterSubmit, handleLoginSubmit, handleLogout)
// (之前已提供的 switchDataView, switchHomeView)

// 輔助函數範例 (如果之前沒提供)
function openPostModal() {
     const postModal = document.getElementById('postModal');
     if (postModal) postModal.style.display = 'flex';
}
function closePostModal() {
    const postModal = document.getElementById('postModal');
    const postForm = document.getElementById('postForm');
    const imagePreview = document.getElementById('imagePreview');
    if (postModal) postModal.style.display = 'none';
    if (postForm) postForm.reset(); // 重置表單內容
    if (imagePreview) {
         imagePreview.innerHTML = ''; // 清空預覽
         imagePreview.style.display = 'none';
    }
}
function handleImagePreview(e) {
    const imagePreview = document.getElementById('imagePreview');
    if (!imagePreview) return;
    imagePreview.innerHTML = ''; // 清空舊預覽
    const files = e.target.files;
    if (files && files.length > 0) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'image-preview-item';
                imgContainer.innerHTML = `<img src="${event.target.result}" alt="圖片預覽">`;
                imagePreview.appendChild(imgContainer);
            };
            reader.readAsDataURL(file);
        });
        imagePreview.style.display = 'flex';
    } else {
        imagePreview.style.display = 'none';
    }
}
function clearImagePreview() {
    const imagePreview = document.getElementById('imagePreview');
     if (imagePreview) {
          imagePreview.innerHTML = '';
          imagePreview.style.display = 'none';
     }
}

/**
 * 獲取並渲染當前登入使用者的股票/證券卡片列表。
 * 會呼叫後端 /api/stocks 端點。
 */
async function renderStockCardsForAccount() {
    const user = auth.currentUser; // 獲取當前登入用戶
    if (!user) {
        console.warn("renderStockCardsForAccount: User not logged in.");
        // 如果需要，可以在對應的容器顯示登入提示
        const container = document.querySelector('#stocksDataView .stock-cards-area');
        if (container) {
            container.innerHTML = '<p class="no-account-message">請先登入以查看證券資料</p>';
        }
        // 隱藏相關的 header 和清空 summary
        // document.querySelector('.stock-list-header')?. style.display = 'none';
        // const summaryElement = document.getElementById('controlBarSummary');
        // if (summaryElement) summaryElement.textContent = '總金額: -';
        
        return;
    }

    // 獲取目標容器、列表頭和摘要元素
    const container = document.querySelector('#stocksDataView .stock-cards-area');
    const header = document.querySelector('.stock-list-header');
    const summaryElement = document.getElementById('controlBarSummary');

    // 檢查必要的 HTML 元素是否存在
    if (!container || !header || !summaryElement) {
        console.error("renderStockCardsForAccount: Required DOM elements not found (#stocksDataView .stock-cards-area, .stock-list-header, or #controlBarSummary).");
        return;
    }

    // 顯示載入狀態
    container.innerHTML = '<p class="no-account-message">載入證券資料中...</p>';
    header.style.display = 'none'; // 載入時先隱藏列表頭
    summaryElement.textContent = '總金額: 載入中...';

    try {
        // 使用 fetchWithAuth 呼叫後端 API
        console.log("Fetching stock data from /api/stocks...");
        const response = await fetchWithAuth(`${API_BASE_URL}/stocks`); // 不需要傳 uid，後端從 token 獲取

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `載入股票數據失敗 (${response.status})`);
        }

        const stockData = await response.json(); // 解析返回的股票數據陣列
        console.log("Fetched stock data:", stockData);

        // 使用 renderStockCards 函數渲染卡片，並獲取總金額
        // *** 確保 renderStockCards 函數已定義 ***
        const totalStocksValue = renderStockCards(stockData, container); // renderStockCards 應返回總值

        // 更新摘要總金額
        summaryElement.textContent = `總金額: NT$ ${formatNumber(totalStocksValue?.toFixed(0) || 0)}`;

        // 如果有數據，則顯示列表頭；否則保持隱藏
        header.style.display = (stockData && stockData.length > 0) ? 'grid' : 'none';

    } catch (error) {
        console.error('載入或渲染股票數據失敗:', error);
        // 在容器中顯示錯誤訊息
        container.innerHTML = `<p class="no-account-message text-danger">載入失敗：${error.message}</p>`;
        // 更新摘要為錯誤狀態
        summaryElement.textContent = '總金額: 載入錯誤';
        // 確保列表頭是隱藏的
        header.style.display = 'none';
        // 如果是授權錯誤，fetchWithAuth 內部會處理登出
    }
}

/**
 * 根據提供的股票數據陣列，產生 HTML 卡片並渲染到指定容器。
 * @param {Array<object>} stockDatas - 包含股票資料的物件陣列。
 * @param {HTMLElement} container - 要渲染卡片的目標 HTML 容器元素。
 * @returns {number} 計算出的股票總價值。
 */
function renderStockCards(stockDatas, container) {
    container.innerHTML = ''; // 清空舊內容
    let totalValue = 0;

    if (!stockDatas || stockDatas.length === 0) {
        container.innerHTML = '<p class="no-account-message" style="grid-column: 1 / -1;">無持股資料</p>';
        return 0; // 沒有資料，總價值為 0
    }

    const fragment = document.createDocumentFragment();

    stockDatas.forEach(stockData => {
        // 假設 quantity > 0 才顯示
        if (stockData.quantity > 0) {
            const currentValue = parseFloat(stockData.current_amount || 0);
            const acquisitionValue = parseFloat(stockData.acquisition_value || 0);
            const quantity = parseFloat(stockData.quantity || 0);
            const change = currentValue - acquisitionValue;
            const changePercent = acquisitionValue !== 0 ? (change / acquisitionValue) * 100 : 0;
            const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
            const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '';

            totalValue += currentValue; // 累加總價值

            const card = document.createElement('div');
            card.className = 'stock-card'; // 主 class
            // 使用單行佈局 (確保 CSS 中 .single-row 的 grid-template-columns 正確)
            card.innerHTML = `
                <div class="stock-card-content single-row">
                    <span class="sc-item-name">${stockData.item || 'N/A'}</span>
                    <span class="sc-quantity">${formatNumber(quantity)}</span>
                    <span class="sc-current-value ${changeClass}">$${formatNumber(parseInt(currentValue))}</span>
                    <span class="sc-profit-loss ${changeClass}">
                        <span class="arrow">${arrow}</span>${formatNumber(Math.abs(change).toFixed(0))}(${changePercent.toFixed(1)}%)
                    </span>
                </div>
                <div class="stock-actions">
                    <button class="btn-buy" onclick="buyStock('${stockData.item}', event)">買入</button>
                    <button class="btn-sell" onclick="sellStock('${stockData.item}', ${quantity}, event)">賣出</button>
                </div>
            `;

            // 添加卡片點擊展開/收起操作按鈕的事件監聽器
            card.addEventListener('click', (e) => {
                // 避免點擊按鈕時觸發卡片效果
                if (e.target.closest('.btn-buy') || e.target.closest('.btn-sell')) {
                    return;
                }
                card.classList.toggle('active'); // 切換 active class
            });
            fragment.appendChild(card);
        }
    });

    container.appendChild(fragment); // 將所有卡片一次性加入 DOM
    console.log("Stock cards rendered. Total value:", totalValue);
    return totalValue; // 返回計算出的總價值
}

/**
 * 處理主要記帳表單 (#accountForm) 的提交事件。
 * 用於新增一筆支出或收入記錄。
 * (取代了舊的 submitFinForm 函數)
 */
async function submitFinForm(event) {
    event.preventDefault(); // 阻止表單的預設提交行為

    const user = auth.currentUser; // 獲取當前登入的 Firebase 使用者
    if (!user) {
        // 如果使用者未登入，提示並顯示登入框
        alert('請先登入才能記帳！');
        showLoginModal(); // 顯示登入模態框
        return;
    }

    const form = document.getElementById('accountForm');
    const submitButton = document.getElementById('submitAccountBtn'); // 記帳表單的提交按鈕

    // 1. 使用 HTML5 表單驗證
    if (!form || !form.checkValidity()) {
        form?.reportValidity(); // 顯示瀏覽器內建的驗證提示
        return;
    }

    // 2. 禁用提交按鈕，防止重複提交
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
    }

    // 3. 從表單收集數據
    const formData = {
        date: document.getElementById('inputDate1').value,
        items: document.getElementById('items').value,
        category: document.getElementById('category').value,
        transactionType: document.getElementById('transactionType').value,
        amount: parseFloat(document.getElementById('amount').value),
        payment_method: document.getElementById('payment_method').value,
        // 對於可選欄位，如果為空，傳遞 null 或空字串
        merchant: document.getElementById('merchant').value || null,
        invoice_number: document.getElementById('invoice_number').value || null,
        notes: document.getElementById('notes').value || null,
    };

    // 4. 額外的前端驗證 (例如：金額必須是正數)
    if (isNaN(formData.amount) || formData.amount <= 0) {
         alert('請輸入有效的正數金額！');
         if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '提交記帳'; // 恢復按鈕文字
         }
         return; // 阻止提交
    }
    // 確保選擇了必要的下拉選項
    if (!formData.category || !formData.transactionType || !formData.payment_method) {
         alert('請確保已選擇類別、收支類型和支付方式！');
         if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '提交記帳';
         }
         return;
    }

    console.log("正在提交記帳資料:", formData);

    try {
        // 5. 使用 fetchWithAuth 呼叫受保護的後端 API
        //    後端 API 端點應為 /api/submitAccount (POST)
        const response = await fetchWithAuth(`${API_BASE_URL}/submitAccount`, { // 使用 fetchWithAuth
            method: 'POST',
            body: JSON.stringify(formData) // 發送收集到的表單數據
        });

        // 6. 檢查後端回應
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "提交失敗，無法解析伺服器錯誤回應" }));
            // 將後端錯誤訊息或其他訊息拋出
            throw new Error(errorData.error || `提交失敗 (${response.status})`);
        }

        const result = await response.json(); // 獲取後端回應

        // --- 執行成功 ---
        form.reset(); // 清空表單欄位
        initDate(); // 將日期欄位重設為今天
        alert('記帳成功！'); // 提示使用者成功
        console.log("記帳資料提交成功:", result);

        // 7. **可選操作：成功後刷新相關資料**
        //    (根據需要取消註解或添加刷新邏輯)
        // if (window.location.hash.includes('managePage')) {
        //     console.log("嘗試刷新管理頁面紀錄...");
        //     currentPage = 1; hasMore = true;
        //     if(domCache.tableBody) domCache.tableBody.innerHTML = '';
        //     await fetchRecords(currentPage);
        // } else if (window.location.hash.includes('homePage')) {
        //     console.log("嘗試刷新首頁資料...");
        //     await updateHomePage();
        // }

    } catch (error) {
        // --- 處理錯誤 ---
        console.error('提交記帳資料失敗:', error);
        alert(`提交記帳資料失敗：${error.message}`);
        // fetchWithAuth 內部會處理 401/403 錯誤

    } finally {
        // --- 無論成功或失敗，恢復按鈕狀態 ---
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交記帳';
        }
    }
}

/**
 * 獲取並渲染當前登入使用者的現金/其他資產卡片列表。
 * 會呼叫後端 /api/assets 端點。
 */
async function renderAssetCardsForAccount() {
    const user = auth.currentUser; // 獲取當前登入用戶
    if (!user) {
        console.warn("renderAssetCardsForAccount: User not logged in.");
        // 清空或顯示登入提示
        const container = domCache.assetsDataView; // 使用快取
        if (container) {
            container.innerHTML = '<p class="no-account-message">請先登入以查看資產資料</p>';
        }
        const summaryElement = document.getElementById('controlBarSummary');
        if (summaryElement) summaryElement.textContent = '總金額: -';
        return;
    }

    // 獲取目標容器和摘要元素
    const container = domCache.assetsDataView; // 使用快取
    const summaryElement = document.getElementById('controlBarSummary');

    // 檢查必要的 HTML 元素是否存在
    if (!container || !summaryElement) {
        console.error("renderAssetCardsForAccount: Required DOM elements not found (#assetsDataView or #controlBarSummary).");
        return;
    }

    // 顯示載入狀態
    container.innerHTML = '<p class="no-account-message">載入資產資料中...</p>';
    summaryElement.textContent = '總金額: 載入中...';

    try {
        // 使用 fetchWithAuth 呼叫後端 API
        console.log("Fetching non-stock asset data from /api/assets...");
        const response = await fetchWithAuth(`${API_BASE_URL}/assets`); // 不需要傳 uid

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `載入資產數據失敗 (${response.status})`);
        }

        const assetData = await response.json(); // 解析返回的資產數據陣列
        console.log("Fetched non-stock asset data:", assetData);

        // 使用 renderAssetCards 函數渲染卡片，並獲取總金額
        // *** 確保 renderAssetCards 函數已定義 ***
        const totalAssetsValue = renderAssetCards(assetData, container); // renderAssetCards 應返回總值

        // 更新摘要總金額
        summaryElement.textContent = `總金額: NT$ ${formatNumber(totalAssetsValue?.toFixed(0) || 0)}`;

    } catch (error) {
        console.error('載入或渲染資產數據失敗:', error);
        // 在容器中顯示錯誤訊息
        container.innerHTML = `<p class="no-account-message text-danger">載入失敗：${error.message}</p>`;
        // 更新摘要為錯誤狀態
        summaryElement.textContent = '總金額: 載入錯誤';
        // 如果是授權錯誤，fetchWithAuth 內部會處理登出
    }
}

/**
 * 將輸入的日期字串格式化為 'YYYY/MM/DD' 的本地化顯示格式 (台灣)。
 * @param {string | null | undefined} dateString - 輸入的日期字串 (例如 "2024/01/15" 或 ISO 格式)。
 * @returns {string} 格式化後的日期字串 (例如 "2024/01/15")，如果輸入無效則返回 "日期無效" 或空字串。
 */
function formatDateForDisplay(dateString) {
    // 檢查輸入是否為有效的字串
    if (!dateString || typeof dateString !== 'string') {
      // console.warn("formatDateForDisplay: 無效的輸入日期字串:", dateString);
      return '日期未知'; // 或者返回空字串 ''
    }
  
    try {
      // 嘗試將輸入字串轉換為 Date 物件
      // new Date() 對 'YYYY/MM/DD' 格式的兼容性較好
      const date = new Date(dateString);
  
      // 檢查轉換後的 Date 物件是否有效
      if (isNaN(date.getTime())) {
          // console.warn("formatDateForDisplay: 無法將字串解析為有效日期:", dateString);
          return '日期格式錯誤'; // 輸入字串無法解析
      }
  
      // 使用 toLocaleDateString 進行本地化格式化 (針對台灣 'zh-TW')
      // options 確保輸出是 YYYY/MM/DD 格式
      return date.toLocaleDateString('zh-TW', {
          year: 'numeric',  // 顯示四位數年份
          month: '2-digit', // 顯示兩位數月份 (例如 01, 12)
          day: '2-digit'    // 顯示兩位數日期 (例如 01, 31)
      });
  
    } catch (error) {
      // 捕獲可能的意外錯誤
      console.error("formatDateForDisplay 執行時出錯:", error, "輸入:", dateString);
      return '日期處理錯誤';
    }
  }

/**
 * 根據提供的資產數據陣列，產生 HTML 卡片並渲染到指定容器。
 * @param {Array<object>} assetDatas - 包含資產資料的物件陣列。
 * @param {HTMLElement} container - 要渲染卡片的目標 HTML 容器元素。
 * @returns {number} 計算出的資產總價值。
 */
function renderAssetCards(assetDatas, container) {
    container.innerHTML = ''; // 清空舊內容
    let totalValue = 0;

    if (!assetDatas || assetDatas.length === 0) {
        container.innerHTML = '<p class="no-account-message">無現金/其他資產資料</p>';
        return 0; // 沒有資料，總價值為 0
    }

    const fragment = document.createDocumentFragment();

    assetDatas.forEach(assetData => {
        // 根據你的邏輯決定是否顯示 (例如 acquisition_value > 0)
        if (assetData.current_amount >= 0) { // 允許 0 元資產? 或 > 0
            totalValue += parseFloat(assetData.current_amount || 0); // 累加總價值

            const card = document.createElement('div');
            card.className = 'assetItem-card'; // 使用你定義的 class
            const assetTypeIcon = getAssetTypeIcon(assetData.asset_type);
            // 確保 acquisition_date 是有效日期格式或進行處理
            const formattedDate = assetData.acquisition_date ? formatDateForDisplay(assetData.acquisition_date) : '日期未知';

            // 假設 current_amount 是主要顯示的金額
            const displayAmount = assetData.current_amount ?? assetData.acquisition_value ?? 0;

            card.innerHTML = `
                <div class="assetItem-card-inner">
                    <div class="assetItem-header">
                        <div class="assetItem-header-left">
                            <span class="assetItem-type-icon">${assetTypeIcon}</span>
                            <span class="assetItem-item">${assetData.item || 'N/A'}</span>
                        </div>
                        <span class="assetItem-price">NT$ ${formatNumber(parseInt(displayAmount))}</span>
                    </div>
                    <div class="assetItem-details">
                        <div class="assetItem-info">
                            <span class="assetItem-date">取得日期: ${formattedDate}</span>
                            <span class="assetItem-type">類型: ${assetData.asset_type || '未知'}</span>
                        </div>
                        <div class="assetItem-actions">
                            <button class="btn-record" onclick='openRecordModal(${JSON.stringify(assetData)})'>
                                <span class="btn-icon">📝</span>
                                <span class="btn-text">編輯</span>
                            </button>
                            </div>
                    </div>
                </div>
            `;
            fragment.appendChild(card);
        }
    });

    container.appendChild(fragment);
    console.log("Asset cards rendered. Total value:", totalValue);
    return totalValue;
}

// 切換資料顯示的函數
function switchDataView(viewType) {
    // console.log(`切換資料顯示為: ${viewType}`);
    domCache.stocksDataView.style.display = viewType === 'stocks' ? 'block' : 'none';
    domCache.assetsDataView.style.display = viewType === 'assets' ? 'block' : 'none';
    domCache.showStocksBtn.classList.toggle('active', viewType === 'stocks');
    domCache.showAssetsBtn.classList.toggle('active', viewType === 'assets');
    const stocksViewContainer = document.getElementById('stocksDataView').querySelector('.stock-cards-area'); // Target the inner area
    const assetsViewContainer = document.getElementById('assetsDataView'); // Target the asset container (assuming it doesn't have the header)
    const user = auth.currentUser; // 獲取當前用戶
    if (user) {
        if (viewType === 'stocks') {
            stocksViewContainer.innerHTML = ''; // Clear only the card area
            renderStockCardsForAccount(user);
        } else if (viewType === 'assets') {
            assetsViewContainer.innerHTML = ''; // Clear asset area
            renderAssetCardsForAccount(user);
        }
    } else {
        // Display 'no account' message in the correct container
        if (viewType === 'stocks') {
            if (stocksViewContainer) { // Check if the container exists
                 stocksViewContainer.innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
            }
             document.querySelector('.stock-list-header').style.display = 'none'; // Hide header if no account
        } else {
            if (assetsViewContainer) { // Check if the container exists
                 assetsViewContainer.innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
            }
        }
    }
}

/**
 * 處理編輯記錄 Modal 中 "儲存變更" 按鈕的點擊事件。
 */
async function handleUpdateRecordSubmit() {
    const user = auth.currentUser;
    if (!user) {
        alert('請先登入才能儲存變更！');
        // 可以選擇關閉 modal 並顯示登入框
        const modalElement = document.getElementById('editRecordModal');
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if(modalInstance) modalInstance.hide();
        showLoginModal();
        return;
    }

    const form = document.getElementById('editRecordForm');
    const saveButton = document.getElementById('saveRecordChangesBtn');

    // 獲取正在編輯的記錄 ID
    const recordId = document.getElementById('editRecordId').value;
    if (!recordId) {
        alert("錯誤：找不到要編輯的記錄 ID。");
        return;
    }

    // 基本表單驗證 (如果需要，但欄位通常都有 required)
    // if (!form || !form.checkValidity()) {
    //     form?.reportValidity();
    //     return;
    // }

    // 禁用按鈕
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';
    }

    // 從編輯 Modal 的表單中收集更新後的數據
    const updatedRecordData = {
        date: document.getElementById('editRecordDate').value,
        item: document.getElementById('editRecordItem').value,
        amount: parseFloat(document.getElementById('editRecordAmount').value),
        category: document.getElementById('editRecordCategory').value,
        transactionType: document.getElementById('editRecordTransactionType').value,
        payment_method: document.getElementById('editRecordPaymentMethod').value,
        merchant: document.getElementById('editRecordMerchant').value || null,
        invoice_number: document.getElementById('editRecordInvoiceNumber').value || null,
        notes: document.getElementById('editRecordNotes').value || null,
    };

    // 驗證金額
    if (isNaN(updatedRecordData.amount) || updatedRecordData.amount <= 0) {
         alert("請輸入有效的正數金額！");
         if (saveButton) { saveButton.disabled = false; saveButton.textContent = '儲存變更'; }
         return;
    }

    console.log(`準備更新記錄 ID: ${recordId}，新數據:`, updatedRecordData);

    try {
        // 使用 fetchWithAuth 呼叫後端 API (PUT /api/record/{record_id})
        const response = await fetchWithAuth(`${API_BASE_URL}/record/${recordId}`, {
            method: 'PUT',
            body: JSON.stringify(updatedRecordData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "更新失敗" }));
            throw new Error(errorData.error || `更新記錄失敗 (${response.status})`);
        }

        // --- 更新成功 ---
        console.log("記錄更新成功:", await response.json());

        // 關閉 Modal
        const modalElement = document.getElementById('editRecordModal');
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
         if(modalInstance) {
             modalInstance.hide();
         } else if(modalElement) {
              modalElement.style.display = 'none'; // Fallback
         }

        alert('記錄更新成功！');

        // --- 刷新帳本列表 ---
        console.log("正在刷新帳本記錄...");
        currentPage = 1; // 重設頁碼到第一頁
        hasMore = true;
        // if (domCache.tableBody) domCache.tableBody.innerHTML = ''; // 清空
        // --- 刷新結束 ---

    } catch (error) {
        // --- 處理錯誤 ---
        console.error('更新記錄失敗:', error);
        alert(`更新記錄失敗：${error.message}`);
    } finally {
        // --- 無論成功失敗，恢復按鈕狀態 ---
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = '儲存變更';
        }
    }
}

/**
 * 打開編輯記錄的模態框，並將傳入的記錄數據填充到表單中。
 * @param {object} record - 包含要編輯記錄完整數據的物件。
 */
function openEditRecordModal(record) {
    if (!record || typeof record.id === 'undefined') {
        console.error("無效的記錄數據傳遞給 openEditRecordModal:", record);
        alert("無法載入編輯資料。");
        return;
    }
    console.log("Opening edit modal for record:", record);

    const modalElement = document.getElementById('editRecordModal');
    if (!modalElement) {
        console.error("Edit record modal element (#editRecordModal) not found!");
        return;
    }

    try {
        // --- 填充表單欄位 ---
        document.getElementById('editRecordId').value = record.id; // 設置隱藏的 ID
        document.getElementById('editRecordItem').value = record.item || '';
        document.getElementById('editRecordAmount').value = record.amount || 0;
        document.getElementById('editRecordCategory').value = record.category || '';
        document.getElementById('editRecordTransactionType').value = record.transactionType || '支出';
        document.getElementById('editRecordPaymentMethod').value = record.payment_method || '';
        document.getElementById('editRecordMerchant').value = record.merchant || '';
        document.getElementById('editRecordInvoiceNumber').value = record.invoice_number || '';
        document.getElementById('editRecordNotes').value = record.notes || '';

        // --- 處理日期欄位 ---
        const dateInput = document.getElementById('editRecordDate');
        if (dateInput) {
             // 嘗試將日期格式化回 YYYY/MM/DD 以便 Datepicker 識別
             let formattedDate = '';
             if (record.date) {
                  // 假設 record.date 已經是 YYYY/MM/DD 格式或可被 new Date() 解析
                  try {
                       formattedDate = formatDateForDisplay(record.date); // 使用我們之前的格式化函數
                  } catch {
                       formattedDate = record.date; // 如果格式化失敗，使用原始值
                  }
             }
             dateInput.value = formattedDate;

             // 重新初始化 Datepicker (如果需要的話)
             // 如果 datepicker 已在全局初始化，可能只需要更新日期
             try {
                  $(dateInput).datepicker('destroy'); // 先銷毀
                  $(dateInput).datepicker({
                       format: 'yyyy/mm/dd',
                       autoclose: true,
                       todayHighlight: true,
                       language: 'zh-TW'
                  });
                   $(dateInput).datepicker('update', formattedDate); // 設定日期
             } catch (e) { console.error("Error re-initializing datepicker for edit modal:", e); }
        }

        // --- 顯示 Modal ---
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

    } catch (error) {
        console.error("填充編輯 Modal 時出錯:", error);
        alert("載入編輯視窗時發生錯誤。");
    }
}


/**
 * 在指定的卡片中顯示帳本的總收入、總支出和比例摘要。
 * @param {object} totals - 包含總計數據的物件，預期有 totalIncome, totalExpense, owner 屬性。
 */
function displaySummary(totals) {
    const summaryCard = document.getElementById('summaryCard'); // 獲取顯示摘要的容器元素
    if (!summaryCard) {
        console.error("displaySummary: Summary card element (#summaryCard) not found.");
        return; // 找不到容器，無法顯示
    }

    console.log("Displaying summary:", totals);

    // 從傳入的物件中獲取數據，提供預設值以防萬一
    const totalIncome = totals.totalIncome || 0;
    const totalExpense = totals.totalExpense || 0;
    // owner 是由 fetchRecords 從 auth.currentUser 添加進來的
    const ownerDisplay = totals.owner ? `${totals.owner} 的帳本摘要` : '帳本摘要'; // 顯示的標題或用戶名

    // 計算淨收入/結餘
    const profit = totalIncome - totalExpense;

    // --- 計算收支比例條的百分比 ---
    let incomePercentage = 0;
    let expensePercentage = 0;
    const totalSum = totalIncome + totalExpense; // 計算總流量

    if (totalSum > 0) {
        // 如果總流量大於 0，按比例計算
        incomePercentage = (totalIncome / totalSum) * 100;
        expensePercentage = (totalExpense / totalSum) * 100;
    } else {
        // 如果總流量為 0 (沒有收入也沒有支出)
        incomePercentage = 0;
        expensePercentage = 0;
        // 或者可以根據淨收入決定，例如 profit > 0 給 income 100%? 但按流量分比較直觀
    }
    // --- 比例計算結束 ---

    // 生成摘要卡片的內部 HTML
    summaryCard.innerHTML = `
        <div class="summary-card"> <div class="summary-header">
                <div class="summary-item income">總收入: ${formatNumber(totalIncome)}</div>
                <div class="summary-item expense">總支出: ${formatNumber(totalExpense)}</div>
            </div>
            <div class="summary-total" style="font-weight: bold;">淨結餘: ${formatNumber(profit)}</div>
                <div class="ratio-expense" style="width: ${expensePercentage.toFixed(1)}%;" title="支出占比 ${expensePercentage.toFixed(1)}%"></div>
            </div>
             <div class="summary-total" style="font-size: 0.8em; color: #888;">
                 收: ${incomePercentage.toFixed(1)}% / 支: ${expensePercentage.toFixed(1)}%
             </div>
        </div>
    `;

    // 確保卡片是可見的
    summaryCard.style.display = 'block';
}


/**
 * 設定管理頁面 (#managePage) 上方 "資產" 和 "帳本" 卡片的點擊切換事件。
 */
function setupManagePageCards() {
    // 選擇包含兩個選項卡的容器
    const optionContainer = document.querySelector('#managePage .option-container');

    // 檢查容器是否存在
    if (!optionContainer) {
        console.error('錯誤：在管理頁面找不到 .option-container 元素。');
        return;
    }

    console.log("Setting up manage page card listeners...");

    // 使用事件委派，將監聽器綁定在父容器上
    optionContainer.addEventListener('click', (e) => {
        // 向上查找被點擊的元素是否是 .option-card 或其子元素
        const card = e.target.closest('.option-card');
        // 如果點擊的不是卡片，或者卡片不存在，則不執行任何操作
        if (!card) return;

        // 從卡片的 data-section 屬性獲取要顯示的區塊 ID
        const sectionId = card.dataset.section;
        if (!sectionId) {
            console.error('錯誤：被點擊的卡片缺少 data-section 屬性。');
            return;
        }

        console.log(`Manage page card clicked. Target section: ${sectionId}`);

        // --- 1. 切換顯示/隱藏內容區塊 ---
        if (domCache.recordsSection) {
            domCache.recordsSection.style.display = sectionId === 'recordsSection' ? 'block' : 'none';
        } else { console.error("DOM Cache missing recordsSection"); }

        if (domCache.stocksSection) {
            domCache.stocksSection.style.display = sectionId === 'stocksSection' ? 'block' : 'none';
        } else { console.error("DOM Cache missing stocksSection"); }


        // --- 2. 更新卡片背景樣式 ---
        if (domCache.showRecordsCard && domCache.showStocksCard) {
            // 將所有卡片恢復預設樣式 (例如淺灰色)
            // 注意：直接修改 style 可能會覆蓋 CSS 規則，更好的方式是添加/移除 active class
            domCache.showRecordsCard.style.backgroundColor = 'var(--background)'; // 或你的預設背景色
            domCache.showRecordsCard.style.color = 'var(--text-primary)'; // 預設文字顏色
            domCache.showStocksCard.style.backgroundColor = 'var(--background)';
            domCache.showStocksCard.style.color = 'var(--text-primary)';


            // 為被點擊的卡片設定高亮樣式
            if (sectionId === 'recordsSection') {
                card.style.backgroundColor = 'var(--primary)'; // 帳本用主色
                card.style.color = 'white';
                switchLedgerView('list'); // <--- 預設顯示列表
                // 重置並載入第一頁明細數據
                if (domCache.tableBody) domCache.tableBody.innerHTML = '<p class="no-account-message">載入記錄中...</p>';
                const loadingEl = document.getElementById('loading');
                if(loadingEl) loadingEl.style.display = 'none';
                domCache.tableBody?.querySelector('.load-complete-card')?.remove();
            } else if (sectionId === 'stocksSection') {
                card.style.backgroundColor = 'var(--secondary)'; // 資產用次色
                card.style.color = 'white';
            }
        } else { console.error("DOM Cache missing showRecordsCard or showStocksCard"); }

        // ---> 新增：為帳本內的切換按鈕綁定事件 <---
        const ledgerListBtn = document.getElementById('showLedgerListBtn');
        const ledgerTrackerBtn = document.getElementById('showLedgerTrackerBtn');

        if (ledgerListBtn) {
            ledgerListBtn.addEventListener('click', () => switchLedgerView('list'));
            console.log("Listener added to showLedgerListBtn");
        } else { console.warn("showLedgerListBtn not found for listener setup.");}

        if (ledgerTrackerBtn) {
            ledgerTrackerBtn.addEventListener('click', () => switchLedgerView('tracker'));
            console.log("Listener added to showLedgerTrackerBtn");
        } else { console.warn("showLedgerTrackerBtn not found for listener setup.");}


        // --- 3. 載入對應區塊的初始資料 ---
        const user = auth.currentUser; // 獲取當前用戶
        if (!user) {
            console.warn("User not logged in, cannot load data for manage page.");
            // 可以選擇顯示提示訊息
            if(sectionId === 'stocksSection' && domCache.assetsDataView) domCache.assetsDataView.innerHTML = '<p class="no-account-message">請先登入</p>';
            if(sectionId === 'stocksSection' && document.querySelector('#stocksDataView .stock-cards-area')) document.querySelector('#stocksDataView .stock-cards-area').innerHTML = ''; // 清空資產區域

            return; // 未登入，停止執行
        }

        if (sectionId === 'recordsSection') {
            // 切換到帳本視圖
            console.log("Loading initial records data...");
            currentPage = 1; // 重設頁碼
            hasMore = true;    // 重設是否有更多數據標誌
            isLoading = false; // 重設載入狀態
            updateExpenseTracker(); // 載入預設/當前日期範圍的數據
        } else if (sectionId === 'stocksSection') {
            // 切換到資產視圖
            console.log("Switching to assets view (defaulting to 'assets')...");
            // 預設顯示「現金/其他資產」分頁
            switchDataView('assets'); // switchDataView 內部會呼叫 renderAssetCardsForAccount (它內部使用 fetchWithAuth)
        }
    });
     console.log("Manage page card click listener attached to container.");
     if(domCache.recordsSection) domCache.recordsSection.style.display = 'none';
     if(domCache.stocksSection) domCache.stocksSection.style.display = 'block';
     domCache.showRecordsCard?.classList.remove('active-option');
     domCache.showStocksCard?.classList.add('active-option');
}

/**
 * 設定紀錄頁面 (#chargePage) 上方 "記帳" 和 "資產" 選項卡的點擊切換事件。
 * 控制對應表單和浮動提交按鈕的顯示/隱藏。
 */
function setupOptionCards() {
    // 選擇包含兩個選項卡的容器
    const optionContainer = document.querySelector('#chargePage .option-container');

    // 檢查容器是否存在
    if (!optionContainer) {
        console.error('錯誤：在紀錄頁面找不到 .option-container 元素。');
        return;
    }

    // 獲取表單和按鈕元素 (可以從 domCache 或直接獲取)
    const accountForm = domCache.accountForm || document.getElementById('accountForm');
    const assetForm = domCache.assetForm || document.getElementById('assetForm');
    const submitAccountBtn = document.getElementById('submitAccountBtn');
    const submitAssetBtn = document.getElementById('submitAssetBtn');

    // 再次檢查所有需要的元素是否存在
    if (!accountForm || !assetForm || !submitAccountBtn || !submitAssetBtn) {
        console.error("錯誤：紀錄頁面的表單或提交按鈕元素未找到！");
        return;
    }

    console.log("Setting up charge page option card listeners...");

    // 使用事件委派綁定點擊事件到父容器
    optionContainer.addEventListener('click', e => {
        const card = e.target.closest('.option-card');
        if (!card) return; // 點擊的不是卡片

        const formId = card.dataset.form; // 獲取 data-form 的值 ('accountForm' 或 'assetForm')
        if (!formId) {
             console.warn("Clicked option card is missing data-form attribute.");
             return;
        }

        console.log(`Charge page option card clicked. Target form: ${formId}`);

        // --- 切換表單和按鈕的顯示 ---
        if (formId === 'accountForm') {
            accountForm.style.display = 'block';
            assetForm.style.display = 'none';
            submitAccountBtn.style.display = 'block'; // 顯示記帳提交按鈕
            submitAssetBtn.style.display = 'none';  // 隱藏資產提交按鈕
        } else if (formId === 'assetForm') {
            assetForm.style.display = 'block';
            accountForm.style.display = 'none';
            submitAccountBtn.style.display = 'none';  // 隱藏記帳提交按鈕
            submitAssetBtn.style.display = 'block'; // 顯示資產提交按鈕
        }

        // --- (可選) 更新卡片視覺樣式 ---
        // 清除所有卡片的 'active' class (假設你有 active class 的樣式)
        optionContainer.querySelectorAll('.option-card').forEach(c => c.classList.remove('active-option'));
        // 給被點擊的卡片添加 'active' class
        card.classList.add('active-option');
        // 你需要在 styles.css 中定義 .option-card.active-option 的樣式
    });

    // --- 設定初始狀態 ---
    // 確保頁面加載時，按鈕的可見性與當前顯示的表單一致
    // (這段邏輯在之前的回答中已有，此處是確認版本)
    console.log("Setting initial button visibility for charge page...");
    if (accountForm.style.display !== 'none') {
        submitAccountBtn.style.display = 'block';
        submitAssetBtn.style.display = 'none';
         // 初始時也設定 active 樣式
         optionContainer.querySelector('.option-card[data-form="accountForm"]')?.classList.add('active-option');
         optionContainer.querySelector('.option-card[data-form="assetForm"]')?.classList.remove('active-option');
    } else if (assetForm.style.display !== 'none') {
        submitAssetBtn.style.display = 'block';
        submitAccountBtn.style.display = 'none';
         optionContainer.querySelector('.option-card[data-form="assetForm"]')?.classList.add('active-option');
         optionContainer.querySelector('.option-card[data-form="accountForm"]')?.classList.remove('active-option');
    } else {
        // 如果兩個都隱藏，預設顯示記帳表單和按鈕
        console.log("Defaulting to account form view.");
        accountForm.style.display = 'block';
        assetForm.style.display = 'none';
        submitAccountBtn.style.display = 'block';
        submitAssetBtn.style.display = 'none';
         optionContainer.querySelector('.option-card[data-form="accountForm"]')?.classList.add('active-option');
         optionContainer.querySelector('.option-card[data-form="assetForm"]')?.classList.remove('active-option');
    }
     console.log("Charge page option cards setup complete.");
}

/**
 * 根據傳入的資產類型字串，返回對應的 Material Symbol HTML 標籤。
 * @param {string} type - 資產類型的名稱。
 * @returns {string} 包含 Material Symbols class 和圖示名稱的 <span> 標籤 HTML 字串。
 */
function getAssetTypeIcon(type) {
    // 定義資產類型到 Material Symbols 圖示名稱 的映射
    // 你可以到 Google Fonts Icons 網站 (https://fonts.google.com/icons) 查找圖示名稱
    const iconNames = {
        '活存': 'account_balance_wallet', // 或 'savings'
        '定存': 'account_balance',      // 或 'savings'
        '現金': 'payments',             // 或 'money'
        '虛擬貨幣': 'currency_bitcoin',   // 比特幣
        '股票': 'show_chart',           // 折線圖 (代表股價) 或 ssid_chart
        '金融股': 'domain',              // 大樓 (代表公司/機構)
        'ETF': 'pie_chart',             // 圓餅圖 (代表分散投資)
        '美債': 'attach_money',        // 美元符號 或 account_balance
        '債券': 'receipt_long',         // 長收據 (代表債券)
        '交割款': 'sync_alt',           // 左右箭頭 (代表轉移)
        '信用卡': 'credit_card',        // 信用卡
        '借貸': 'handshake',           // 握手 (代表借貸協議)
        // --- 你可以根據需要添加更多資產類型和對應圖示名稱 ---
    };

    // 查找對應的圖示名稱，如果找不到，使用預設的 'help' (問號) 圖標
    const iconName = iconNames[type] || 'help'; // 預設圖標名稱

    // 返回包含 class 和圖示名稱的 <span> 標籤
    // 使用 'material-symbols-outlined' class 來指定使用 Outlined 樣式
    return `<span class="material-symbols-outlined">${iconName}</span>`;
}
/**
 * 更新首頁 (#homePage) 的內容，顯示總資產、當日開銷、圖表和 AI 建議。
 */
async function updateHomePage() {
    const user = auth.currentUser; // 獲取當前登入用戶
    const assetsContainer = domCache.assetsContainer || document.getElementById('assetsContainer'); // 獲取主容器

    if (!assetsContainer) {
        console.error("updateHomePage: Cannot find assets container (#assetsContainer).");
        return;
    }

    // 如果未登入，顯示提示訊息並返回
    if (!user) {
        console.log("updateHomePage: User not logged in.");
        assetsContainer.innerHTML = '<p class="no-account-message">請先登入以查看錢包資訊</p>';
         // 確保圖表也被清理
         if (assetChart) { assetChart.destroy(); assetChart = null; }
         if (expenseChart) { expenseChart.destroy(); expenseChart = null; }
        return;
    }

    console.log("Updating home page data...");
    // 顯示載入中狀態 (覆蓋整個容器)
    assetsContainer.innerHTML = '<p class="no-account-message" style="padding: 20px;">載入錢包資訊中...</p>';
     // 清理可能殘留的舊圖表實例
     if (assetChart) { assetChart.destroy(); assetChart = null; }
     if (expenseChart) { expenseChart.destroy(); expenseChart = null; }

    try {
        // 使用 fetchWithAuth 呼叫後端 API 獲取摘要數據
        const response = await fetchWithAuth(`${API_BASE_URL}/getSummaryData`); // GET 請求

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `載入首頁數據失敗 (${response.status})`);
        }

        const summaryData = await response.json(); // 解析後端返回的數據
        console.log("Fetched home page summary data:", summaryData);

        // --- 成功獲取數據，重新渲染容器內容 ---
        const totalAssets = summaryData.total_asset_amount || 0;
        // 後端返回的 daily expenses 列表 和 daily total cost
        const dailyExpenses = summaryData.expenses || [];
        const todayTotalExpense = summaryData.total_cost || 0;
        const assetDistribution = summaryData.asset_distribution || {};
        const expenseDistribution = summaryData.expense_distribution || {};

        // 重建容器內部結構 (因為之前可能被 loading 或 error message 覆蓋)
        assetsContainer.innerHTML = `
            <div class="total-assets" id="totalAssets">
                <span class="label">總資產</span>
                <span class="value">NT$ ${formatNumber(totalAssets)}</span>
            </div>
            <div id="dailyExpensesContainer" class="record-card-container" style="margin-top: 10px;">
                </div>
            <div id="aiAssistantBoard" class="ai-assistant-container">
                <h5 class="mb-3">Gochy AI</h5>
                <p class="help-text">您的財務小幫手</p>
                <div id="aiMessages" class="ai-messages">
                    <p class="message-placeholder">AI 載入中...</p>
                </div>
            </div>
            <div id="expenseChartContainer" style="max-width: 400px; margin: 20px auto;">
                <canvas id="expenseChart"></canvas>
            </div>
            <div id="assetChartContainer" style="max-width: 400px; margin: 10px auto;">
                <canvas id="assetChart"></canvas>
            </div>
            <div class="footer-info" style="text-align: center; margin-top: 20px; padding-bottom: 20px;">
                 <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">
                     version: ${version} | copy right: JiaMing
                 </p>
             </div>
        `;

        // 呼叫各個渲染函數來填充內容
        renderDailyExpenses(dailyExpenses, todayTotalExpense);
        // 確保 renderDistributionOnChart 能處理空數據
        renderDistributionOnChart('assetChart', 'assetChartContainer', assetDistribution, '總資產分佈', assetChart);
        renderDistributionOnChart('expenseChart', 'expenseChartContainer', expenseDistribution, '當月開銷分佈', expenseChart);

        // 獨立呼叫 AI 建議函數 (它內部會再次 fetch)
        await initAIAssistant(dailyExpenses);

    } catch (error) {
        console.error('更新首頁失敗:', error);
        // 在容器中顯示錯誤訊息
        assetsContainer.innerHTML = `<p class="no-account-message text-danger">載入首頁資料失敗：${error.message}</p>`;
         // 清理圖表實例
         if (assetChart) { assetChart.destroy(); assetChart = null; }
         if (expenseChart) { expenseChart.destroy(); expenseChart = null; }
    }
}

/**
 * 渲染首頁上的「當天開銷」列表和總額。
 * @param {Array<object>} expenses - 只包含當天收支記錄的物件陣列。
 * 每個物件應包含 date, item, amount, transactionType 等屬性。
 * @param {number} todayTotalExpense - 當天的總支出金額。
 */
function renderDailyExpenses(expenses, todayTotalExpense) {
    const container = document.getElementById('dailyExpensesContainer'); // 獲取容器元素
    if (!container) {
        console.error("renderDailyExpenses: Cannot find container #dailyExpensesContainer.");
        return; // 找不到容器，無法渲染
    }

    console.log("Rendering daily expenses...");

    // 1. 設定標題並清空舊內容 (除了標題)
    container.innerHTML = '<h3 style="text-align: center; font-size: 1.2rem; margin-bottom: 10px;">當天收支</h3>'; // 修改標題以反映可能包含收入

    // 2. 檢查是否有當天記錄
    if (!expenses || expenses.length === 0) {
        container.innerHTML += '<p style="text-align: center; color: var(--text-secondary);">今日無收支記錄</p>';
        console.log("No daily expenses to render.");
        return;
    }

    // 3. 創建文檔片段以提高性能
    const fragment = document.createDocumentFragment();

    // 4. 添加顯示「當天總支出」的卡片
    const totalCard = document.createElement('div');
    totalCard.className = 'record-card total-card'; // 可以為 total-card 添加特定樣式
    totalCard.innerHTML = `
        <div class="record-item" style="font-weight: bold;"> <span>當天總支出</span>
            <span class="expense-amount">NT$ ${formatNumber(todayTotalExpense || 0)}</span> </div>
    `;
    fragment.appendChild(totalCard);

    // 5. 遍歷當天的每筆記錄，創建卡片
    expenses.forEach(expense => {
        const card = document.createElement('div');
        // 根據 transactionType 設置不同的 class
        const typeClass = expense.transactionType === '收入' ? 'income-card' : 'expense-card';
        card.className = `record-card ${typeClass}`;

        // 根據 transactionType 設置金額的 class
        const amountClass = expense.transactionType === '收入' ? 'income-amount' : 'expense-amount';

        // 生成卡片內部 HTML (只顯示必要信息)
        card.innerHTML = `
            <div class="record-header">
                 <span>${expense.category || ''}</span> <span style="font-size: 0.8em;">${expense.payment_method || ''}</span> </div>
            <div class="record-item">
                <span>${expense.item || '無項目'}</span>
                <span class="${amountClass}">NT$ ${formatNumber(expense.amount || 0)}</span>
            </div>
             `;
        fragment.appendChild(card);
    });

    // 6. 將包含所有卡片的片段一次性添加到容器中
    container.appendChild(fragment);
    console.log(`Rendered ${expenses.length} daily expense items.`);
}

// (確保 domCache 中 expenseCategoryChart 和 expenseTrendsChart 也被設為 null 初始值)
// domCache.expenseCategoryChart = null;
// domCache.expenseTrendsChart = null;

/**
 * 將分佈數據渲染到指定的 Canvas 上，顯示為圓餅圖或甜甜圈圖。
 * @param {string} canvasId - 要繪製圖表的 <canvas> 元素的 ID。
 * @param {string} containerId - 包裹 <canvas> 的容器元素的 ID (用於動態創建 canvas，雖然目前可能不需要)。
 * @param {object} distributionData - 包含分佈數據的物件，鍵是標籤(例如類別)，值是數值。
 * @param {string} chartTitle - 顯示在圖表上方的標題文字。
 * @param {string} chartInstanceRefName - 用於存儲此圖表實例的全域變數名稱 (字串，例如 'assetChart' 或 'expenseChart')。
 */
function renderDistributionOnChart(canvasId, containerId, distributionData, chartTitle, chartInstanceRefName) {
    console.log(`Rendering distribution chart for: ${chartTitle} on #${canvasId}`);

    const canvasElement = document.getElementById(canvasId);
    const container = document.getElementById(containerId);

    // 檢查 Canvas 是否存在
    if (!canvasElement) {
        console.error(`renderDistributionOnChart: Canvas element with ID "${canvasId}" not found.`);
        // 可以在 container 顯示錯誤，如果 container 存在的話
        if(container) container.innerHTML = `<p class="text-danger text-center small">圖表畫布 (#${canvasId}) 遺失</p>`;
        return;
    }

    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
        console.error(`renderDistributionOnChart: Failed to get 2D context for canvas "${canvasId}".`);
         canvasElement.outerHTML = `<p class="text-danger text-center small">無法渲染圖表</p>`; // 替換 canvas
        return;
    }

    // --- 1. 銷毀可能存在的舊圖表實例 ---
    // 使用 window[chartInstanceRefName] 或一個映射來訪問全域變數
    let oldChartInstance = null;
    if (chartInstanceRefName === 'assetChart') {
        oldChartInstance = assetChart;
    } else if (chartInstanceRefName === 'expenseChart') {
        oldChartInstance = expenseChart;
    } // 可以為其他圖表添加 else if

    if (oldChartInstance instanceof Chart) { // 確保是 Chart.js 實例
        console.log(`Destroying previous chart instance: ${chartInstanceRefName}`);
        oldChartInstance.destroy();
         // 將全域變數設回 null
         if (chartInstanceRefName === 'assetChart') assetChart = null;
         else if (chartInstanceRefName === 'expenseChart') expenseChart = null;
    }
    // --- 銷毀結束 ---


    // --- 2. 處理和過濾數據 ---
    const labels = [];
    const values = [];
    if (distributionData && typeof distributionData === 'object') {
        for (const key in distributionData) {
            // 只包含值大於 0 的項目
            if (distributionData.hasOwnProperty(key) && distributionData[key] > 0) {
                labels.push(key);
                values.push(distributionData[key]);
            }
        }
    }
    console.log("Chart Data:", { labels, values });
    // --- 數據處理結束 ---


    // --- 3. 檢查是否有數據可供顯示 ---
    if (labels.length === 0 || values.length === 0) {
        console.log(`No data available to render chart: ${chartTitle}`);
        // 清空畫布並顯示提示文字
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height); // 清空畫布
        ctx.save(); // 保存當前狀態
        ctx.fillStyle = 'grey'; // 設定文字顏色
        ctx.textAlign = 'center'; // 文字水平居中
        ctx.textBaseline = 'middle'; // 文字垂直居中
        ctx.font = '14px Arial'; // 設定字體
        ctx.fillText('無數據可供顯示', canvasElement.width / 2, canvasElement.height / 2); // 在畫布中心繪製文字
        ctx.restore(); // 恢復狀態
         // 將對應的全域變數設為 null (因為沒有創建圖表)
         if (chartInstanceRefName === 'assetChart') assetChart = null;
         else if (chartInstanceRefName === 'expenseChart') expenseChart = null;
        return; // 結束函數
    }
    // --- 檢查結束 ---


    // --- 4. 設定圖表顏色 ---
    // 可以定義更豐富的顏色池或使用 Chart.js 的內建顏色
    const backgroundColors = [
        '#4a90e2', '#50e3c2', '#7ed321', '#f8e71c', '#ff9f1c',
        '#ff6b6b', '#9b59b6', '#34495e', '#e91e63', '#00bcd4',
        '#8bc34a', '#ffc107', '#607d8b', '#9c27b0', '#2196f3'
    ].slice(0, labels.length); // 根據標籤數量選擇顏色

    // --- 5. 創建新的 Chart.js 實例 ---
    const newChart = new Chart(ctx, {
        type: 'pie', // 或 'doughnut'
        data: {
            labels: labels,
            datasets: [{
                label: chartTitle, // Tooltip 中顯示的數據集標籤
                data: values,
                backgroundColor: backgroundColors,
                borderColor: '#ffffff', // 邊框顏色
                borderWidth: 1        // 邊框寬度
            }]
        },
        options: {
            responsive: true,      // 圖表是否響應容器大小變化
            maintainAspectRatio: false, // 允許圖表高度自適應 (通常設為 false 配合容器高度)
            plugins: {
                legend: {
                    position: 'top', // 圖例位置 (top, bottom, left, right)
                    labels: {
                        boxWidth: 12, // 圖例顏色框大小
                        padding: 10   // 圖例項之間的間距
                    }
                },
                title: {
                    display: true, // 是否顯示標題
                    text: chartTitle, // 圖表標題文字
                    padding: { top: 10, bottom: 15 }, // 標題上下邊距
                    font: { size: 14 } // 標題字體大小
                },
                tooltip: { // 提示框設定
                    enabled: true,
                    callbacks: {
                        // 自訂提示框標籤顯示格式
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            // 計算總和以顯示百分比
                            const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: NT$ ${formatNumber(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    // --- 6. 將新的圖表實例儲存到對應的全域變數 ---
    if (chartInstanceRefName === 'assetChart') {
        assetChart = newChart;
    } else if (chartInstanceRefName === 'expenseChart') {
        expenseChart = newChart;
    } // 可以為其他圖表添加 else if
    console.log(`Chart '${chartInstanceRefName}' rendered successfully.`);

}

/**
 * 初始化 AI 助手功能，從後端獲取並顯示財務建議。
 */
async function initAIAssistant(inputData) {
    const aiMessagesContainer = document.getElementById('aiMessages'); // 獲取顯示訊息的容器
    const aiAssistantBoard = document.getElementById('aiAssistantBoard'); // AI 助手區塊

    // 確保容器存在
    if (!aiMessagesContainer || !aiAssistantBoard) {
        console.warn("initAIAssistant: AI Assistant container elements not found.");
        return;
    }

    const user = auth.currentUser; // 檢查使用者是否登入
    if (!user) {
        aiMessagesContainer.innerHTML = '<p class="message-placeholder">請先登入以獲取 AI 建議。</p>';
        // 隱藏整個 AI 區塊或只顯示提示
        aiAssistantBoard.style.display = 'block'; // 確保區塊可見以顯示提示
        return;
    }

    console.log("Initializing AI Assistant and fetching suggestion...");
    // 顯示載入中提示
    aiMessagesContainer.innerHTML = '<p class="message-placeholder">AI 建議載入中...</p>';
    aiAssistantBoard.style.display = 'block'; // 確保區塊可見

    try {
        // 使用 fetchWithAuth 呼叫後端 AI 建議 API
        // 假設後端端點是 /api/aiSuggestion，方法是 POST
        // 前端不再需要傳遞具體的開銷數據，後端會根據 uid 自行獲取
        const response = await fetchWithAuth(`${API_BASE_URL}/aiSuggestion`, {
            method: 'POST', // 或者 GET，取決於你的後端設計
            // 如果後端 POST 不需要 body，可以傳遞空物件
            body: JSON.stringify(inputData)
            // 如果後端 GET，則移除 body 和 method (預設為 GET)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // 如果後端返回 404 或其他非成功狀態碼
            if (response.status === 404) {
                 throw new Error("AI 建議功能未找到或未啟用。");
            }
            throw new Error(errorData.error || `載入 AI 建議失敗 (${response.status})`);
        }

        const data = await response.json(); // 解析後端返回的 JSON
        console.log("AI Suggestion received:", data);

        // 顯示建議，如果後端沒有返回有效的建議，則顯示預設訊息
        if (data && data.suggestion) {
            // 將建議文字顯示出來，可以考慮處理換行符 \n (如果有的話)
             aiMessagesContainer.innerHTML = `<p class="ai-message">${data.suggestion.replace(/\n/g, '<br>')}</p>`;
        } else {
            aiMessagesContainer.innerHTML = '<p class="message-placeholder">AI 目前沒有特別的建議。</p>';
        }

    } catch (error) {
        console.error('載入 AI 建議失敗:', error);
        // 在介面上顯示錯誤訊息
        aiMessagesContainer.innerHTML = `<p class="message-placeholder text-danger">AI 建議載入失敗：${error.message}</p>`;
        // fetchWithAuth 內部可能已處理 401/403 錯誤並登出
    }
}

/**
 * 切換帳本頁面中的視圖（明細列表 vs. 開銷追蹤）。
 * @param {'list' | 'tracker'} viewToShow - 要顯示的視圖 ('list' 或 'tracker')。
 */
function switchLedgerView(viewToShow) {
    console.log(`Switching ledger view to: ${viewToShow}`);

    const listView = document.getElementById('ledgerListView');
    const trackerView = document.getElementById('ledgerExpenseTrackerView');
    const listBtn = document.getElementById('showLedgerListBtn');
    const trackerBtn = document.getElementById('showLedgerTrackerBtn');

    if (!listView || !trackerView || !listBtn || !trackerBtn) {
        console.error("找不到帳本視圖容器或切換按鈕。");
        return;
    }

    // 切換視圖容器的 active class
    listView.classList.toggle('active', viewToShow === 'list');
    trackerView.classList.toggle('active', viewToShow === 'tracker');

    // 切換按鈕的 active class
    listBtn.classList.toggle('active', viewToShow === 'list');
    trackerBtn.classList.toggle('active', viewToShow === 'tracker');

    // 可選：如果切換到列表視圖且列表為空，觸發一次加載
    if (viewToShow === 'list' && domCache.tableBody && domCache.tableBody.innerHTML.trim() === '') {
        console.log("List view is empty, fetching initial records...");
        updateExpenseList(expenses);
    }
    // 可選：如果切換到追蹤視圖且尚未初始化或需要刷新，觸發一次加載
    else if (viewToShow === 'tracker') {
        console.log("Tracker view activated, ensuring it's updated...");
        // initExpenseTracker(auth.currentUser?.uid); // 確保初始化
        updateExpenseTracker(); // 加載預設/當前日期數據
    }
}

/**
 * (更新後) 打開編輯「資產」的模態框 (#editAssetModal)，
 * 並將傳入的資產數據填充到表單中作為預設值。
 * @param {object} asset - 包含要編輯資產完整數據的物件 (從 renderAssetCards/renderStockCards 傳入)。
 */
function openRecordModal(asset) { // 維持函數名稱 openRecordModal，但功能改變
    if (!asset) {
        console.error("無效的資產數據傳遞給 openRecordModal:", asset);
        alert("無法載入資產編輯資料，缺少資產 ID。");
        return;
    }
    console.log("Opening edit asset modal for asset:", asset);

    const modalElement = document.getElementById('editAssetModal'); // <-- 改為指向新的 Modal ID
    if (!modalElement) {
        console.error("編輯資產 Modal 元素 (#editAssetModal) 未在 HTML 中找到！");
        alert("編輯資產視窗元件缺失。");
        return;
    }

    try {
        // --- 填充資產編輯表單欄位 ---
        document.getElementById('editAssetId').value = asset.id;
        document.getElementById('editAssetName').value = asset.item || '';
        document.getElementById('editAssetType').value = asset.asset_type || ''; // 設定下拉選單的值
        document.getElementById('editAssetAcquisitionValue').value = asset.acquisition_value || 0;
        document.getElementById('editAssetNotes').value = asset.notes || '';
        populateDropdown('editAssetType', assetCategories, '選擇資產類');
        // --- 處理取得日期 ---
        const dateInput = document.getElementById('editAssetAcquisitionDate');
        if (dateInput) {
            let formattedDate = '';
            if (asset.acquisition_date) {
                try {
                    formattedDate = formatDateForDisplay(asset.acquisition_date);
                } catch { formattedDate = asset.acquisition_date; }
            }
            dateInput.value = formattedDate;
            // (可選) 重新初始化 Datepicker
            if (typeof $ !== 'undefined' && $.fn.datepicker) {
                 try {
                      $(dateInput).datepicker('destroy');
                      $(dateInput).datepicker({ format: 'yyyy/mm/dd', autoclose: true, todayHighlight: true, language: 'zh-TW' });
                      // $(dateInput).datepicker('update', formattedDate); // 可能不需要這行，setDate 會觸發更新
                 } catch (e) { console.error("處理編輯資產 Modal 的 Datepicker 時出錯:", e); }
            }
        }

        // --- 根據資產類型決定是否顯示「股數/數量」欄位 ---
        const quantityGroup = document.getElementById('editAssetQuantityGroup');
        const quantityInput = document.getElementById('editAssetQuantity');
        const stockTypes = fixed_assets_opt;
        if (quantityGroup && quantityInput) {
            if (stockTypes.includes(asset.asset_type)) {
                quantityGroup.style.display = 'block'; // 顯示欄位
                quantityInput.value = asset.quantity || 0; // 填充數量
                quantityInput.required = true; // 設為必填 (可選)
            } else {
                quantityGroup.style.display = 'none'; // 隱藏欄位
                quantityInput.value = ''; // 清空值
                quantityInput.required = false; // 非必填
            }
        }
        // --- 股數欄位處理結束 ---

        // --- 顯示 Modal ---
        const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
        modal.show();
        console.log("Edit asset modal shown.");

    } catch (error) {
        console.error("填充編輯資產 Modal 時出錯:", error);
        alert("載入編輯資產視窗時發生錯誤。");
    }
}

/**
 * 處理編輯資產 Modal 中 "儲存變更" 按鈕的點擊事件。
 */
async function handleUpdateAssetSubmit() {
    const user = auth.currentUser;
    if (!user) {
        alert('請先登入才能儲存資產變更！');
        const modalElement = document.getElementById('editAssetModal');
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if(modalInstance) modalInstance.hide();
        showLoginModal();
        return;
    }

    const form = document.getElementById('editAssetForm');
    const saveButton = document.getElementById('saveAssetChangesBtn');

    // 獲取正在編輯的資產 ID
    const assetId = document.getElementById('editAssetId').value;
    if (!assetId) {
        alert("錯誤：找不到要編輯的資產 ID。");
        return;
    }

    // 基本表單驗證 (可選)
    // if (!form || !form.checkValidity()) { ... }

    // 禁用按鈕
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = '儲存中...'; }

    // 從編輯 Modal 表單收集更新後的數據
    const assetType = document.getElementById('editAssetType').value;
    const quantityInput = document.getElementById('editAssetQuantity');
    const stockTypes = fixed_assets_opt;
    let quantityValue = -1; // 預設為 -1 (非股票類)
    if (stockTypes.includes(assetType) && quantityInput.offsetParent !== null) { // 檢查欄位是否可見
         quantityValue = parseInt(quantityInput.value, 10);
         if (isNaN(quantityValue) || quantityValue < 0) { // 股票數量不能小於 0
              alert("請輸入有效的股數 (大於或等於 0)！");
              if (saveButton) { saveButton.disabled = false; saveButton.textContent = '儲存變更'; }
              return;
         }
    }

    const updatedAssetData = {
        item: document.getElementById('editAssetName').value.trim(),
        asset_type: assetType,
        acquisition_date: document.getElementById('editAssetAcquisitionDate').value,
        acquisition_value: parseFloat(document.getElementById('editAssetAcquisitionValue').value),
        notes: document.getElementById('editAssetNotes').value || null,
        quantity: quantityValue, // 使用處理過的值
        // 注意：current_price 和 current_amount 通常不由用戶編輯，後端應重新計算或獲取
    };

    // 驗證必要欄位
     if (!updatedAssetData.item || isNaN(updatedAssetData.acquisition_value) || updatedAssetData.acquisition_value < 0) {
          alert("請確保資產名稱和有效的取得價值已填寫！");
          if (saveButton) { saveButton.disabled = false; saveButton.textContent = '儲存變更'; }
          return;
     }

    console.log(`準備更新資產 ID: ${assetId}，新數據:`, updatedAssetData);

    try {
        // **後端 API 需要確認**
        // 方案 A: 使用特定端點 POST /api/editAsset (需傳遞 assetId)
        // 方案 B: 使用 RESTful 風格 PUT /api/asset/{assetId}
        // 這裡假設使用方案 B
        const response = await fetchWithAuth(`${API_BASE_URL}/asset/${assetId}`, { // <--- API 端點示例
            method: 'PUT', // <--- 使用 PUT
            body: JSON.stringify(updatedAssetData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "更新失敗" }));
            throw new Error(errorData.error || `更新資產失敗 (${response.status})`);
        }

        // --- 更新成功 ---
        console.log("資產更新成功:", await response.json());

        // 關閉 Modal
        const modalElement = document.getElementById('editAssetModal');
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
         if(modalInstance) modalInstance.hide();
         else if(modalElement) modalElement.style.display = 'none';

        alert('資產更新成功！');

        // --- 刷新資產列表 ---
        console.log("正在刷新資產列表...");
        await renderAssetCardsForAccount(); // 刷新現金/其他
        await renderStockCardsForAccount(); // 刷新股票/證券
        // --- 刷新結束 ---

    } catch (error) {
        console.error('更新資產失敗:', error);
        alert(`更新資產失敗：${error.message}`);
    } finally {
        // --- 恢復按鈕狀態 ---
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = '儲存變更'; }
    }
}
