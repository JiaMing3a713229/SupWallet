// 全局變量
const version = 'v1.0.3';
var current_account = ''; // 當前選擇的帳戶
const initialLoad = 15;   // 初始載入記錄數量
let currentPage = 1;      // 當前頁碼
let isLoading = false;    // 是否正在載入
let hasMore = true;       // 是否還有更多數據
// const API_BASE_URL = 'https://web-firestore-453815.de.r.appspot.com/api'; // Flask API 基礎 URL
const API_BASE_URL = 'http://127.0.0.1:8080/api'
const POST_API_BASE_URL = 'https://postflask-dot-web-firestore-453815.de.r.appspot.com/api'; // 處理貼文功能伺服器
// const POST_API_BASE_URL = 'http://127.0.0.1:5000/api'; // 處理貼文功能伺服器

// DOM 緩存
const postsContainer = document.getElementById('postsContainer');
const postForm = document.getElementById('postForm');
const postModal = document.getElementById('postModal');
const closePostFormBtn = document.getElementById('closePostFormBtn');

// DOM緩存，方便快速訪問元素
const domCache = {
    pageTitle: document.getElementById('pageTitle'),
    tableBody: document.getElementById('recordCardContainer'),
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
    expenseCategoryChart: null, // 後續初始化
    expenseTrendsChart: null,  // 後續初始化
};


// 頁面載入時初始化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => window.scrollTo(0, 1), 100); // 解決行動裝置狀態列問題

    // 初始化登入模態框
    initLoginModal();


    initDate();         // 初始化日期
    loadAccounts();     // 載入帳戶列表
    showNoAccountMessage(); // 顯示未選擇帳戶提示
    window.addEventListener('scroll', throttle(handleScroll, 200)); // 滾動事件
    
    setupOptionCards(); // 設置紀錄頁面的選項卡
    document.getElementById('accountList-title').addEventListener('change', handleHeaderAccountFilter);

    updateHomePage(current_account); // 更新首頁
    setupManagePageCards();

    window.addEventListener('hashchange', handleHashChange); // 監聽 URL hash 變化
    handleHashChange();

    // 預設顯示現金資料
    switchDataView('assets');

    // 滾動時隱藏/顯示 header 和 footer
    let lastScroll = 0;
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        const scrollDelta = currentScroll - lastScroll;
        if (scrollDelta > 5 && currentScroll > 0) {
            header.classList.add('hidden');
            footer.classList.add('hidden');
        } else if (scrollDelta < -15 || currentScroll <= 0) {
            header.classList.remove('hidden');
            footer.classList.remove('hidden');
        }
        lastScroll = currentScroll <= 0 ? 0 : currentScroll;
    });

    // 提交記帳表單
    document.getElementById('submitRecordBtn').addEventListener('click', async () => {
        const form = document.getElementById('recordForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = {
            date: document.getElementById('recordDate').value,
            // items: document.getElementById('recordItem').value,
            person: current_account,
            // property: document.getElementById('recordCategory').value, // 使用 category 作為 property
            // isIncome: document.getElementById('recordType').value,
            amounts: parseFloat(document.getElementById('recordAmount').value),
            assetId: document.getElementById('recordAssetId').value  // 儲存資產 ID
        };

        console.log("Edit asset: ",formData);

        try {
            const response = await fetch(`${API_BASE_URL}/editAsset/${current_account}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (!response.ok) throw new Error('提交失敗');

            // 關閉模態框並刷新數據
            bootstrap.Modal.getInstance(document.getElementById('recordModal')).hide();
            alert('記帳提交成功！');
            
            // 刷新帳本記錄
            currentPage = 1;
            hasMore = true;
            domCache.tableBody.innerHTML = '';
            fetchRecords(currentPage, initialLoad, { owner: current_account });
            
            // 刷新資產數據
            renderAssetCardsForAccount(current_account);
        } catch (error) {
            console.error('提交失敗:', error);
            alert('提交失敗，請稍後再試');
        }
    });


    //update
    loadPosts(current_account);
    postForm.addEventListener('submit', handlePostSubmit);
    closePostFormBtn.addEventListener('click', () => {
        postModal.style.display = 'none';
        postForm.reset();
        imagePreview.innerHTML = '';
        imagePreview.style.display = 'none';
    });
    // 點擊彈出層外部關閉
    postModal.addEventListener('click', (e) => {
        if (e.target === postModal) {
            postModal.style.display = 'none';
            postForm.reset();
            imagePreview.innerHTML = '';
            imagePreview.style.display = 'none';
        }
    });

    // 圖片預覽功能
    const postImageInput = document.getElementById('postImage');
    const imagePreview = document.getElementById('imagePreview');
    postImageInput.addEventListener('change', (e) => {
        imagePreview.innerHTML = ''; // 清空之前的預覽
        const files = e.target.files; // 獲取所有選擇的檔案
    
        if (files && files.length > 0) {
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    // 為每張圖片創建一個預覽元素
                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'image-preview-item'; // 使用 CSS 類控制樣式
                    imgContainer.innerHTML = `<img src="${event.target.result}" alt="圖片預覽">`;
                    imagePreview.appendChild(imgContainer);
                };
                reader.readAsDataURL(file); // 將檔案轉為 Data URL 用於預覽
            });
            imagePreview.style.display = 'flex'; // 顯示預覽區域，並使用 flex 布局
        } else {
            imagePreview.style.display = 'none'; // 無圖片時隱藏
        }
    });

    // 清除圖片預覽
    postForm.addEventListener('reset', () => {
        imagePreview.innerHTML = '';
        imagePreview.style.display = 'none';
    });
    

    initExpenseTracker(); // 初始化開銷追蹤

});

// 切換錢包頁面視圖
function switchHomeView(viewType) {
    domCache.assetsContainer.style.display = viewType === 'dailyReport' ? 'block' : 'none';
    domCache.expenseTrackerContainer.style.display = viewType === 'expenseTracker' ? 'block' : 'none';
    domCache.showDailyReportBtn.classList.toggle('active', viewType === 'dailyReport');
    domCache.showExpenseTrackerBtn.classList.toggle('active', viewType === 'expenseTracker');

    if (current_account) {
        if (viewType === 'dailyReport') {
            updateHomePage(current_account);
        } else if (viewType === 'expenseTracker') {
            updateExpenseTracker(current_account);
        }
    }
}
// 快速貼文功能
function openPostModal() {
    postModal.style.display = 'flex';
}
// 處理URL hash變化，切換頁面
function setupManagePageCards() {
    const optionContainer = document.querySelector('#managePage .option-container');
    if (!optionContainer) {
        console.error('找不到管理頁面的 .option-container');
        return;
    }

    optionContainer.addEventListener('click', e => {
        const card = e.target.closest('.option-card');
        if (!card) return;

        const sectionId = card.dataset.section;
        if (!sectionId) {
            console.error('卡片缺少 data-section 屬性');
            return;
        }

        // 切換顯示區域
        domCache.recordsSection.style.display = sectionId === 'recordsSection' ? 'block' : 'none';
        domCache.stocksSection.style.display = sectionId === 'stocksSection' ? 'block' : 'none';

        // 更新卡片樣式
        domCache.showRecordsCard.style.background = sectionId === 'recordsSection' ? 'var(--primary)' : '#e2e8f0';
        domCache.showStocksCard.style.background = sectionId === 'stocksSection' ? 'var(--secondary)' : '#e2e8f0';

        // 載入對應數據
        if (current_account != '') {
            if (sectionId === 'recordsSection') {
                currentPage = 1;
                hasMore = true;
                domCache.tableBody.innerHTML = '';
                fetchRecords(currentPage, initialLoad, { owner: current_account });
            } else if (sectionId === 'stocksSection') {
                switchDataView('assets'); // 預設顯示現金資料
            }
        }
    });
}

// 初始化登入模態框
async function initLoginModal() {
    // 顯示登入模態框
    loginModal.style.display = 'flex';

    // 載入帳戶列表
    try {
        const response = await fetch(`${API_BASE_URL}/accounts`);
        if (!response.ok) throw new Error('載入帳戶失敗');
        const accounts = await response.json();
        renderAccountOptions(accounts, 'loginAccountList', '<option value="" disabled selected>請選擇帳戶</option>');
    } catch (error) {
        console.error('載入帳戶失敗:', error);
        loginAccountList.innerHTML = '<option value="" disabled selected>載入失敗，請重試</option>';
    }

    // 處理登入表單提交
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedAccount = loginAccountList.value;
        if (!selectedAccount) {
            alert('請選擇一個帳戶！');
            return;
        }

        // 設置當前帳戶並關閉模態框
        current_account = selectedAccount;
        loginModal.style.display = 'none';

        // 刷新頁面數據
        const activePageId = window.location.hash.slice(1) || 'homePage';
        switch (activePageId) {
            case 'managePage':
                if (domCache.recordsSection.style.display === 'block') {
                    domCache.tableBody.innerHTML = '';
                    fetchRecords(currentPage, initialLoad, { owner: current_account });
                } else {
                    renderStockCardsForAccount(current_account);
                }
                break;
            case 'homePage':
                updateHomePage(current_account);
                break;
            case 'sharePage':
                loadPosts(current_account);
                break;
        }

        // 更新頂部帳戶選擇
        document.getElementById('accountList-title').value = current_account;
    });

    // 點擊模態框外部不關閉（強制用戶選擇帳戶）
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            alert('請選擇一個帳戶進行登入！');
        }
    });
}
// 處理URL hash變化，切換頁面
function handleHashChange() {
    const hash = window.location.hash.slice(1) || 'homePage';
    const targetPage = document.getElementById(hash);

    if (targetPage) {
        domCache.pages.forEach(page => page.classList.toggle('active', page.id === hash));
        domCache.navButtons.forEach(btn => btn.classList.toggle('active', btn.getAttribute('href') === `#${hash}`));
        domCache.pageTitle.textContent = targetPage.dataset.title;
        document.title = `Gochy - ${targetPage.dataset.title}`;

        if (!current_account) {
            showNoAccountMessage();
        } else {
            switch (hash) {
                case 'managePage':
                    domCache.recordsSection.style.display = 'none';
                    domCache.stocksSection.style.display = 'block';
                    domCache.showRecordsCard.style.background = '#e2e8f0';
                    domCache.showStocksCard.style.background = 'var(--secondary)';
                    switchDataView('assets'); // 預設顯示現金資料
                    break;
                case 'homePage':
                    // domCache.assetsContainer.innerHTML = '';
                    updateHomePage(current_account);
                    break;
                case 'sharePage':
                    loadPosts(current_account);
                    break;
                case 'chargePage':
                    break;
            }
        }
    }
}

// 顯示未選擇帳戶的提示訊息
function showNoAccountMessage() {
    const activePageId = window.location.hash.slice(1) || 'homePage';
    if (activePageId === 'homePage') {
        domCache.assetsContainer.innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
    } else if (activePageId === 'managePage') {
        if (domCache.recordsSection.style.display === 'block') {
            domCache.tableBody.innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
        } else {
            domCache.stocksSection.innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
        }
    } else if (activePageId === 'sharePage') {
        // 發現頁面保留預設訊息
    }
}

// 處理頂部帳戶選擇變化
function handleHeaderAccountFilter(e) {
    const selectedAccount = e.target.value;
    if (selectedAccount === 'select-account') return;

    currentPage = 1;
    hasMore = true;
    current_account = selectedAccount;

    const activePageId = window.location.hash.slice(1) || 'homePage';
    switch (activePageId) {
        case 'managePage':
            if (domCache.recordsSection.style.display === 'block') {
                domCache.tableBody.innerHTML = '';
                fetchRecords(currentPage, initialLoad, { owner: current_account });
            } else {
                // domCache.stocksSection.innerHTML = '';
                renderStockCardsForAccount(current_account);
            }
            break;
        case 'homePage':
            // domCache.assetsContainer.innerHTML = '';
            updateHomePage(current_account);
            break;
        case 'sharePage':
            loadPosts(current_account);
            break;
    }
}

// 初始化日期欄位
function initDate() {
    const today = new Date();
    const defult_date = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('inputDate1').value = defult_date;
    document.getElementById('inputDate2').value = defult_date;
}

// 提交記帳表單
async function submitFinForm(e) {
    e.preventDefault();
    const form = domCache.accountForm;
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    const formData = {
        date: document.getElementById('inputDate1').value,
        items: document.getElementById('items1').value,
        person: document.getElementById('accountList2').value,
        property: document.getElementById('property1').value,
        isIncome: document.getElementById('isIncome1').value,
        amounts: parseFloat(document.getElementById('amounts1').value)
    };
    try {
        const response = await fetch(`${API_BASE_URL}/submitAccount/${formData.person}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        if (!response.ok) throw new Error('提交失敗');
        domCache.accountForm.reset();
        initDate();
        alert('記帳提交成功！');
    } catch (error) {
        console.error('提交失敗:', error);
        alert('提交失敗，請稍後再試');
    }
    
}

// 提交資產表單
async function submitStockForm(e) {
    e.preventDefault();
    const form = domCache.assetForm;
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    const assetValueInput = document.getElementById('assetValue').value;
    const formData = {
        date: document.getElementById('inputDate2').value,
        items: document.getElementById('assetName').value,
        type: document.getElementById('category1').value,
        owner: document.getElementById('accountList3').value,
        quantity: assetValueInput === '' ? -1 : parseInt(assetValueInput, 10),
        initialAmount: parseFloat(document.getElementById('inventValue').value)
    };
    // console.log(formData);
    try {
        const response = await fetch(`${API_BASE_URL}/submitStock/${formData.owner}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        if (!response.ok) throw new Error('提交失敗');
        domCache.assetForm.reset();
        initDate();
        alert('資產提交成功！');
    } catch (error) {
        console.error('提交失敗:', error);
        alert('提交失敗，請稍後再試');
    }
}

// 渲染帳戶選擇選項
function renderAccountOptions(accounts, selectId, defaultOption) {
    const select = document.getElementById(selectId);
    select.innerHTML = defaultOption;
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.textContent = account;
        select.appendChild(option);
    });
}

// 載入帳戶列表
async function loadAccounts() {
    try {
        const response = await fetch(`${API_BASE_URL}/accounts`);
        if (!response.ok) throw new Error('載入帳戶失敗');
        const accounts = await response.json();
        renderAccountOptions(accounts, 'accountList', '<option value="NaN">顯示全部</option>');
        renderAccountOptions(accounts, 'accountList2', '<option value="" disabled selected>選擇帳戶</option>');
        renderAccountOptions(accounts, 'accountList3', '<option value="" disabled selected>選擇帳戶</option>');
        renderAccountOptions(accounts, 'accountList-title', '<option value="select-account" disabled selected>切換帳戶</option>');
    } catch (error) {
        console.error('載入帳戶失敗:', error);
    }
}

let assetChart = null; // 總資產分佈圖表的實例
let expenseChart = null; // 當月開銷分佈圖表的實例


function renderDistributionOnChart(canvasId, containerId, distributionData, chartTitle, chartInstance) {
    let targetCanvas = document.getElementById(canvasId);
    const container = document.getElementById(containerId);

    // 如果 canvas 不存在，動態創建
    if (!targetCanvas) {
        if (!container) {
            console.error(`找不到 #${containerId}，無法渲染圖表`);
            return;
        }
        targetCanvas = document.createElement('canvas');
        targetCanvas.id = canvasId;
        container.appendChild(targetCanvas);
    }

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) {
        console.error('無法獲取 2D 上下文，圖表渲染失敗');
        return;
    }

    const labels = Object.keys(distributionData).filter(key => distributionData[key] > 0);
    const values = labels.map(key => distributionData[key]);
    const backgroundColors = [
        '#7ed321', '#ff6b6b', '#4a90e2', '#f8e71c', '#50e3c2', '#ff9f1c', '#9b59b6',
        '#e91e63', '#00bcd4', '#8bc34a'
    ].slice(0, labels.length);

    // 銷毀舊圖表實例
    if (chartInstance) {
        chartInstance.destroy();
    }

    // 根據 canvasId 分配全局變數
    const newChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 12 } } },
                title: { display: true, text: chartTitle, font: { size: 16 } },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                            const percentage = ((value / total) * 100).toFixed(2);
                            return `${context.label}: NT$${formatNumber(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    // 根據 canvasId 更新對應的全局變數
    if (canvasId === 'assetChart') {
        assetChart = newChart;
    } else if (canvasId === 'expenseChart') {
        expenseChart = newChart;
    }
}

function renderDailyExpenses(expenses, todayExpenses) {
    const container = document.getElementById('dailyExpensesContainer');
    container.innerHTML = '<h3 style="text-align: center; font-size: 1.2rem; margin-bottom: 10px;">當天開銷</h3>';

    if (!expenses || expenses.length === 0) {
        container.innerHTML += '<p style="text-align: center; color: var(--text-secondary);">今日無開銷記錄</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    // 添加總額顯示
    const totalCard = document.createElement('div');
    totalCard.className = 'record-card total-card';
    totalCard.innerHTML = `
        <div class="record-item">
            <span>當天開銷總額</span>
            <span class="expense-amount">NT$${formatNumber(todayExpenses)}</span>
        </div>
    `;
    fragment.appendChild(totalCard);

    // 添加每筆開銷項目
    expenses.forEach(expense => {
        const card = document.createElement('div');
        card.className = `record-card ${expense.TransactionType === '收入' ? 'income-card' : 'expense-card'}`;
        const amountClass = expense.TransactionType === '收入' ? 'income-amount' : 'expense-amount';
        card.innerHTML = `
            <div class="record-header">
                <span>${expense.date || ''}</span>
            </div>
            <div class="record-item">
                <span>${expense.Item || ''}</span>
                <span class="${amountClass}">NT$${formatNumber(expense.Amount || 0)}</span>
            </div>
        `;
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

// 切換資料顯示的函數
function switchDataView(viewType) {
    // console.log(`切換資料顯示為: ${viewType}`);
    domCache.stocksDataView.style.display = viewType === 'stocks' ? 'block' : 'none';
    domCache.assetsDataView.style.display = viewType === 'assets' ? 'block' : 'none';
    domCache.showStocksBtn.classList.toggle('active', viewType === 'stocks');
    domCache.showAssetsBtn.classList.toggle('active', viewType === 'assets');

    if (current_account) {
        if (viewType === 'stocks') {
            renderStockCardsForAccount(current_account);
        } else if (viewType === 'assets') {
            renderAssetCardsForAccount(current_account);
        }
    } else {
        domCache[viewType === 'stocks' ? 'stocksDataView' : 'assetsDataView'].innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
    }
}

// 為指定帳戶渲染持股卡片
//修改 renderStockCardsForAccount 函數，將資料渲染到 stocksDataView
async function renderStockCardsForAccount(account) {
    try {
        const response = await fetch(`${API_BASE_URL}/stocks/${account}`);
        if (!response.ok) throw new Error('載入股票數據失敗');
        const data = await response.json();
        renderStockCards(data, domCache.stocksDataView);
    } catch (error) {
        console.error('載入股票數據失敗:', error);
        domCache.stocksDataView.innerHTML = '<p class="no-account-message">載入失敗，請稍後重試</p>';
    }
}

// 新增 renderAssetCardsForAccount 函數，將資料渲染到 assetsDataView
async function renderAssetCardsForAccount(account) {
    try {
        const response = await fetch(`${API_BASE_URL}/assets/${account}`);
        if (!response.ok) throw new Error('載入現金數據失敗');
        const data = await response.json();
        renderAssetCards(data, domCache.assetsDataView);
    } catch (error) {
        console.error('載入現金數據失敗:', error);
        domCache.assetsDataView.innerHTML = '<p class="no-account-message">載入失敗，請稍後重試</p>';
    }
}

// 渲染持股卡片
/*
  input: stockJSON
  id: row[0],
  date: formattedDate,
  item: row[2],
  type: row[3],
  amount: row[4],
  initPrice: row[5],
  currentPrice: row[6],
  price:[7]
*/
// 修改 renderStockCards 函數，將資料渲染到指定的容器
function renderStockCards(stockDatas, container) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    stockDatas.forEach(stockData => {
        const change = stockData.CurrentValue - stockData.InitialAmount;
        const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
        const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '';
        const card = document.createElement('div');
        card.className = 'stock-card';
        card.innerHTML = `
            <div class="stock-header">
                <span class="stock-item">${stockData.Item}</span>
                <span class="stock-price ${changeClass}">${parseFloat(stockData.CurrentValue).toFixed(0)}</span>
            </div>
            <div class="stock-info">
                <span>${formatNumber(stockData.Quantity)}股</span>
                <span class="stock-change ${changeClass}">
                    <span class="arrow">${arrow}</span>
                    <span>${Math.abs(change).toFixed(1)}</span>
                </span>
            </div>
            <div class="stock-actions">
                <button class="btn-buy" onclick="buyStock('${stockData.Item}', event)">BUY</button>
                <button class="btn-sell" onclick="sellStock('${stockData.Item}', ${stockData.Quantity}, event)">SELL</button>
            </div>
        `;
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            card.classList.toggle('active');
        });
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

// 渲染現金卡片
function renderAssetCards(assetDatas, container) {
    // console.log(assetDatas);
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    assetDatas.forEach(assetData => {
        if(assetData.InitialAmount > 0){
            const card = document.createElement('div');
            card.className = 'assetItem-card';
            const assetTypeIcon = getAssetTypeIcon(assetData.Type);
            const formattedDate = formatDateForDisplay(assetData.date);
            card.innerHTML = `
                <div class="assetItem-card-inner">
                    <div class="assetItem-header">
                        <div class="assetItem-header-left">
                            <span class="assetItem-type-icon">${assetTypeIcon}</span>
                            <span class="assetItem-item">${assetData.Item}</span>
                        </div>
                        <span class="assetItem-price">NT$${parseInt(assetData.InitialAmount)}</span>
                    </div>
                    <div class="assetItem-details">
                        <div class="assetItem-info">
                            <span class="assetItem-date">${formattedDate}</span>
                            <span class="assetItem-type">${assetData.Type}</span>
                        </div>
                        <div class="assetItem-actions">
                            <button class="btn-record" onclick="openRecordModal('${assetData.id}')">
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
}

// 根據資產類型返回合適的圖標
function getAssetTypeIcon(type) {
  const icons = {
    '活存': '💵', // 錢袋，代表可隨時提取的現金
    '定存': '🏦', // 銀行，代表固定期限的存款
    '虛擬貨幣': '₿'  // 比特幣符號，代表數字加密貨幣
  };
  
  return icons[type] || '📦';
}

// 格式化日期顯示
function formatDateForDisplay(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}




// 買入股票
async function buyStock(name, event) {
    event.stopPropagation();
    const sharesToBuy = prompt(`請輸入要買入的 ${name} 股數：`, '0');
    if (sharesToBuy === null) return;

    const shares = parseInt(sharesToBuy, 10);
    if (isNaN(shares) || shares <= 0) {
        alert('請輸入有效的股數（大於 0 的數字）！');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/changeInventory/${current_account}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 0, name, shares })
        });
        if (!response.ok) throw new Error('更新庫存失敗');
        renderStockCardsForAccount(current_account);
    } catch (error) {
        console.error('更新庫存失敗:', error);
        alert('更新庫存失敗，請稍後再試！');
    }
}

/// 賣出股票
async function sellStock(name, amount, event) {
    event.stopPropagation();
    const sharesToSell = prompt(`請輸入要賣出的 ${name} 股數：`, '0');
    if (sharesToSell === null) return;

    const shares = parseInt(sharesToSell, 10);
    if (isNaN(shares) || shares <= 0) {
        alert('請輸入有效的股數（大於 0 的數字）！');
        return;
    }
    if (amount - shares < 0) {
        alert('庫存不足！');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/changeInventory/${current_account}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 1, name, shares: -shares })
        });
        if (!response.ok) throw new Error('更新庫存失敗');
        renderStockCardsForAccount(current_account);
    } catch (error) {
        console.error('更新庫存失敗:', error);
        alert('更新庫存失敗，請稍後再試！');
    }
}

// 獲取帳本記錄
async function fetchRecords(page, limit, filter = {}) {
    if (isLoading || !hasMore) return;
    isLoading = true;
    const loadingEl = document.getElementById('loading');
    loadingEl.classList.add('visible');

    const selectedOwner = filter.owner || document.getElementById('accountList-title').value;

    try {
        const [recordsResponse, totalsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/getRecords/${selectedOwner}?page=${page}&limit=${limit}`),
            fetch(`${API_BASE_URL}/totals/${selectedOwner}`)
        ]);
        if (!recordsResponse.ok || !totalsResponse.ok) throw new Error('載入資料失敗');

        const recordsData = await recordsResponse.json();
        const totalsData = await totalsResponse.json();

        displayRecords(recordsData.records, recordsData.hasMore);
        displaySummary(totalsData);
        hasMore = recordsData.hasMore;
        isLoading = false;
        loadingEl.classList.remove('visible');

        if (window.location.hash.slice(1) === 'managePage' && hasMore) {
            if (recordsData.records.length > 0) {
                setTimeout(() => fetchRecords(currentPage, limit, { owner: selectedOwner }), 1);
            }
        }
    } catch (error) {
        console.error('載入資料失敗:', error);
        isLoading = false;
        loadingEl.classList.remove('visible');
        domCache.tableBody.innerHTML = '<p style="text-align: center; color: var(--danger);">載入失敗，請稍後重試</p>';
    }
}

// 顯示帳本記錄
function displayRecords(records, hasmore) {

    const tableBody = domCache.tableBody;

    if (!records || records.length === 0) {
        hasMore = false;
        const summaryCard = document.getElementById('summaryCard');
        summaryCard.style.display = 'none';

        if (domCache.tableBody.querySelector('.no-data-card') === null) {
            const noDataCard = document.createElement('div');
            noDataCard.className = 'record-card no-data-card';
            noDataCard.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">無記錄</p>';
            domCache.tableBody.appendChild(noDataCard);
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    records.forEach(record => {
        const card = document.createElement('div');
        card.className = `record-card ${record.type === '收入' ? 'income-card' : 'expense-card'}`;
        const amountClass = record.type === '收入' ? 'income-amount' : 'expense-amount';
        card.innerHTML = `
            <div class="record-header">
                <span>${record.date || ''}</span>
            </div>
            <div class="record-item">
                <span>${record.item || ''}</span>
                <span class="${amountClass}">${formatNumber(record.amount || 0)}</span>
            </div>
            <div class="record-actions">
                <button class="btn-custom acc-btn" onclick="editRecord('${record.id}', '${encodeURIComponent(JSON.stringify([record.date, record.item, record.amount]))}', event)">編輯</button>
                <button class="btn-custom acc-btn" style="background: var(--danger)" onclick="deleteRecord('${record.id}', '${current_account}', event)">刪除</button>
            </div>
        `;
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('acc-btn')) return;
            card.classList.toggle('active');
        });
        fragment.appendChild(card);
    });

    domCache.tableBody.appendChild(fragment);
    currentPage++;

    // 當 hasMore 為 false 時顯示「載入完成」
    if (!hasmore && tableBody.querySelector('.load-complete-card') === null) {
        const loadCompleteCard = document.createElement('div');
        loadCompleteCard.className = 'record-card load-complete-card';
        loadCompleteCard.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">所有記錄已載入完成</p>';
        tableBody.appendChild(loadCompleteCard);
    }
}

// 顯示帳本總覽
function displaySummary(totals) {
    const summaryCard = document.getElementById('summaryCard');
    summaryCard.style.display = 'block';

    const totalIncome = totals.totalIncome || 0;
    const totalExpense = totals.totalExpense || 0;
    const total = totalIncome;
    const incomePercentage = (totalIncome - totalExpense) > 0 ? ((totalIncome - totalExpense) / total) * 100 : 0;  //Green bar
    const expensePercentage = total > 0 ? (totalExpense / total) * 100 : 100;
    const ownerDisplay = totals.owner === 'NaN' ? '' : `${totals.owner}`;
    const profit = totalIncome - totalExpense;

    summaryCard.innerHTML = `
        <div class="summary-card">
            <div class="summary-header">
                <div class="summary-item income">收入: ${formatNumber(totalIncome)}</div>
                <div class="summary-item expense">支出: ${formatNumber(totalExpense)}</div>
            </div>
            <div class="summary-total">${ownerDisplay}</div>
            <div class="ratio-bar">
                <div class="ratio-income" style="width: ${incomePercentage}%"></div>
                <div class="ratio-expense" style="width: ${expensePercentage}%"></div>
            </div>
            <div class="summary-total">${profit}</div>
        </div>
    `;
}

// 處理滾動載入更多記錄
function handleScroll() {
    if (isLoading || !hasMore) return;
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 50) {
        fetchRecords(currentPage, { owner: current_account || ' ' });
    }
}

// 編輯記錄
async function editRecord(id, dataString, event) {
    event.stopPropagation();
    const [date, item, amount] = JSON.parse(decodeURIComponent(dataString));
    const record = {
        date: prompt('輸入日期', date),
        Item: prompt('輸入項目', item),
        Amount: prompt('輸入金額', amount)
    };

    try {
        const response = await fetch(`${API_BASE_URL}/record/${current_account}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
        });
        if (!response.ok) throw new Error('更新記錄失敗');
        // 需要加延遲
        currentPage = 1;
        hasMore = true;
        domCache.tableBody.innerHTML = '';
        fetchRecords(currentPage, initialLoad, { owner: current_account });
    } catch (error) {
        console.error('更新記錄失敗:', error);
        alert('更新記錄失敗，請稍後再試');
    }
}

// 刪除記錄
async function deleteRecord(id, owner, event) {
    event.stopPropagation();
    if (confirm('確定要刪除嗎？')) {
        try {
            const response = await fetch(`${API_BASE_URL}/record/${owner}/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('刪除記錄失敗');
            currentPage = 1;
            hasMore = true;
            domCache.tableBody.innerHTML = '';
            fetchRecords(currentPage, initialLoad, { owner: current_account });
        } catch (error) {
            console.error('刪除記錄失敗:', error);
            alert('刪除記錄失敗，請稍後再試');
        }
    }
}

// 格式化數字
function formatNumber(number) {
    return new Intl.NumberFormat('zh-TW').format(number);
}

// 設置紀錄頁面選項卡
function setupOptionCards() {
    const optionContainer = document.querySelector('#chargePage .option-container');
    if (!optionContainer) {
        console.error('找不到 .option-container 元素');
        return;
    }

    optionContainer.addEventListener('click', e => {
        const card = e.target.closest('.option-card');
        if (!card) {
            console.log('點擊的不是 .option-card 或其子元素');
            return;
        }

        const formId = card.dataset.form;
        // console.log('點擊的卡片 formId:', formId);

        const accountForm = document.getElementById('accountForm');
        const assetForm = document.getElementById('assetForm');

        if (!accountForm || !assetForm) {
            console.error('找不到表單元素');
            return;
        }

        if (formId === 'accountForm') {
            accountForm.style.display = 'block';
            assetForm.style.display = 'none';
            console.log('顯示記帳表單');
        } else if (formId === 'assetForm') {
            assetForm.style.display = 'block';
            accountForm.style.display = 'none';
            console.log('顯示資產表單');
        } else {
            console.error('無效的 formId:', formId);
        }
    });
}

// 節流函數，限制事件觸發頻率
function throttle(func) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false);
        }
    };
}

function openRecordModal(asset_id) {
    const modal = new bootstrap.Modal(document.getElementById('recordModal'));
    // console.log('打開記帳模態框，資產 ID:', asset_id);
    // 設置預設日期
    initDateForModal();
    
    // 預填其他欄位
    // document.getElementById('recordItem').value = ""; // 預填資產名稱
    document.getElementById('recordAmount').value = ''; // 清空金額
    // document.getElementById('recordType').value = ''; // 重置類型
    // document.getElementById('recordCategory').value = ''; // 重置類別
    document.getElementById('recordAssetId').value = asset_id; // 儲存資產 ID
    
    modal.show();
}
// 為模態框初始化日期
function initDateForModal() {
    const today = new Date();
    const defaultDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('recordDate').value = defaultDate;
}


//SharePage JavaScripts
// 提交貼文
async function handlePostSubmit(e) {
    e.preventDefault();
    const formData = new FormData(postForm);
    formData.append('userId', current_account); // 添加使用者 ID

    // 確保多檔案上傳字段名為 "images"，與後端一致
    const imageFiles = document.getElementById('postImage').files;
    console.log("選擇的檔案數量:", imageFiles.length);

    try {
        const response = await fetch(`${POST_API_BASE_URL}/posts`, {
            method: 'POST',
            body: formData // 直接發送 FormData，不轉換為 JSON
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '提交失敗');

        postForm.reset();
        postModal.style.display = 'none';
        imagePreview.innerHTML = ''; // 清空圖片預覽
        imagePreview.style.display = 'none';
        loadPosts(current_account);
    } catch (error) {
        console.error('提交貼文失敗:', error);
        alert('發布失敗，請稍後再試！');
    }
}

async function loadPosts(account) {
    if (!account) {
        postsContainer.innerHTML = '<p class="no-account-message">請提供使用者帳戶</p>';
        return;
    }

    postsContainer.innerHTML = '<p id="loadingPosts" class="no-account-message">載入貼文中...</p>';

    try {
        const response = await fetch(`${POST_API_BASE_URL}/posts/${account}`);
        if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
        const posts = await response.json();

        postsContainer.innerHTML = '';
        if (!posts.length) {
            postsContainer.innerHTML = '<p class="no-account-message">尚無貼文</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        posts.forEach(post => {
            const card = createPostCard(post, post.id);
            fragment.appendChild(card);
        });
        postsContainer.appendChild(fragment);
    } catch (error) {
        console.error('載入貼文失敗:', error);
        postsContainer.innerHTML = '<p class="no-account-message">載入失敗，請稍後重試</p>';
    }
}

function createPostCard(post, postId) {
    const card = document.createElement('div');
    card.className = 'post-card';
    const time = post.timestamp ? new Date(post.timestamp).toLocaleString('zh-TW') : '剛剛';
    // 處理圖片顯示，n > 1 時使用輪播
    let imagesHtml = '';
    const totalImages = post.imageUrls.length;
    if (post.imageUrls && post.imageUrls.length > 0) {
        if (totalImages === 1) {
            // 單張圖片
            imagesHtml = `
                <div class="post-images-container single-column">
                    <img src="${post.imageUrls[0]}" class="post-image-item" alt="貼文圖片">
                </div>
            `;
        } else {
            // 多張圖片，使用輪播
            imagesHtml = `
                <div class="post-images-container carousel">
                    <button class="carousel-btn prev" data-post-id="${postId}">&lt;</button>
                    <div class="carousel-images" data-post-id="${postId}">
                        <img src="${post.imageUrls[0]}" class="post-image-item" alt="貼文圖片" data-index="0">
                    </div>
                    <button class="carousel-btn next" data-post-id="${postId}">&gt;</button>
                    <div class="carousel-indicators" data-post-id="${postId}">
                        ${post.imageUrls.map((_, index) => `
                            <span class="indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></span>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    card.innerHTML = `
        <div class="post-header">
            <div class="user-avatar"></div>
            <div>
                <span class="post-user">${current_account}</span>
                <span class="post-list">${post.list === 'public' ? '公開' : '私人'}</span>
                <div class="post-time">${time}</div>
            </div>
        </div>
        <div class="post-content">${post.content}</div>
        ${imagesHtml}
        <div class="post-reactions">
            <button class="reaction-btn" data-reaction="like" data-post-id="${postId}">
                👍 <span class="reaction-count">${post.reactions.like || 0}</span>
            </button>
            <button class="reaction-btn" data-reaction="love" data-post-id="${postId}">
                ❤️ <span class="reaction-count">${post.reactions.love || 0}</span>
            </button>
            <button class="reaction-btn" data-reaction="laugh" data-post-id="${postId}">
                😂 <span class="reaction-count">${post.reactions.laugh || 0}</span>
            </button>
        </div>
    `;

    // 添加反應按鈕事件
    card.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.addEventListener('click', () => handleReaction(current_account, postId, btn.dataset.reaction));
    });

    // 為圖片添加放大功能
    const images = card.querySelectorAll('.post-image-item');
    images.forEach(image => {
        image.addEventListener('click', () => {
            const zoomModal = document.getElementById('imageZoomModal');
            const zoomedImage = document.getElementById('zoomedImage');
            zoomedImage.src = image.src;
            zoomModal.style.display = 'flex';
        });
    });

    // 添加輪播功能（僅當 n > 1 時）
    if (post.imageUrls && post.imageUrls.length > 1) {
        const prevBtn = card.querySelector('.carousel-btn.prev');
        const nextBtn = card.querySelector('.carousel-btn.next');
        const imageContainer = card.querySelector('.carousel-images');
        const indicators = card.querySelectorAll('.carousel-indicators .indicator');
        let currentIndex = 0;

        function updateCarousel(index) {
            imageContainer.innerHTML = `<img src="${post.imageUrls[index]}" class="post-image-item" alt="貼文圖片" data-index="${index}">`;
            indicators.forEach(ind => ind.classList.remove('active'));
            indicators[index].classList.add('active');

            // 重新綁定放大事件
            const newImage = imageContainer.querySelector('.post-image-item');
            newImage.addEventListener('click', () => {
                const zoomModal = document.getElementById('imageZoomModal');
                const zoomedImage = document.getElementById('zoomedImage');
                zoomedImage.src = newImage.src;
                zoomModal.style.display = 'flex';
            });
        }

        prevBtn.addEventListener('click', () => {
            currentIndex = (currentIndex - 1 + totalImages) % totalImages;
            updateCarousel(currentIndex);
        });

        nextBtn.addEventListener('click', () => {
            currentIndex = (currentIndex + 1) % totalImages;
            updateCarousel(currentIndex);
        });

        indicators.forEach(indicator => {
            indicator.addEventListener('click', () => {
                currentIndex = parseInt(indicator.dataset.index);
                updateCarousel(currentIndex);
            });
        });
    }

    return card;
}


// 關閉圖片放大模態框
document.addEventListener('DOMContentLoaded', () => {
    const zoomModal = document.getElementById('imageZoomModal');
    const zoomedImage = document.getElementById('zoomedImage');

    zoomModal.addEventListener('click', (e) => {
        if (e.target === zoomModal || e.target === zoomedImage) {
            zoomModal.style.display = 'none';
        }
    });
});

// 處理表情反應
async function handleReaction(account, postId, reactionType) {
    try {
        const response = await fetch(`${POST_API_BASE_URL}/posts/${account}/${postId}/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reaction: reactionType })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '反應更新失敗');

        loadPosts(current_account);
    } catch (error) {
        console.error('更新表情失敗:', error);
        alert('操作失敗，請稍後再試！');
    }
}

// async function updateHomePage(account) {
//     const assetsContainer = domCache.assetsContainer;

//     // 確保 assetsContainer 存在
//     if (!assetsContainer) {
//         console.error('assetsContainer 未找到');
//         return;
//     }

//     // 如果沒有帳戶，顯示提示訊息，但不覆蓋整個容器
//     if (!account) {
//         const messageArea = assetsContainer.querySelector('.message-area') || document.createElement('div');
//         messageArea.className = 'message-area no-account-message';
//         messageArea.innerHTML = '<p>尚未切換帳戶，請先切換</p>';
//         if (!assetsContainer.contains(messageArea)) {
//             assetsContainer.prepend(messageArea);
//         }
//         return;
//     }

//     // 清除之前的錯誤訊息
//     const existingMessage = assetsContainer.querySelector('.message-area');
//     if (existingMessage) existingMessage.remove();

//     try {
//         const response = await fetch(`${API_BASE_URL}/getSummaryDate/${account}`);
//         if (!response.ok) throw new Error('載入當天數據失敗');
//         const historyData = await response.json();

//         const totalAssets = historyData.total_assets || 0;
//         const todayExpenses = historyData.expenses.reduce((sum, expense) => sum + (expense.Amount || 0), 0);

//         // 檢查 totalAssets 元素是否存在
//         const totalAssetsElement = assetsContainer.querySelector('#totalAssets .value');
//         if (!totalAssetsElement) {
//             console.error('totalAssets .value 未找到，可能 DOM 結構已改變');
//             assetsContainer.innerHTML = `
//                 <div class="total-assets" id="totalAssets">
//                     <span class="label">總資產</span>
//                     <span class="value">NT$${formatNumber(totalAssets)}</span>
//                 </div>
//                 <div id="dailyExpensesContainer" class="record-card-container" style="margin-top: 10px;"></div>
//                 <div id="expenseChartContainer" style="max-width: 400px; margin: 20px auto;">
//                     <canvas id="expenseChart"></canvas>
//                 </div>
//                 <div id="assetChartContainer" style="max-width: 400px; margin: 10px auto;">
//                     <canvas id="assetChart"></canvas>
//                 </div>
//             `;
//         } else {
//             totalAssetsElement.textContent = `NT$${formatNumber(totalAssets)}`;
//         }

//         renderDailyExpenses(historyData.expenses || [], todayExpenses);
//         renderDistributionOnChart('assetChart', 'assetChartContainer', historyData.asset_distribution || {}, '總資產分佈', assetChart);
//         renderDistributionOnChart('expenseChart', 'expenseChartContainer', historyData.expense_distribution || {}, '當月開銷分佈', expenseChart);
//     } catch (error) {
//         console.error('載入當天數據失敗:', error);
//         const messageArea = assetsContainer.querySelector('.message-area') || document.createElement('div');
//         messageArea.className = 'message-area no-account-message';
//         messageArea.innerHTML = '<p>載入失敗，請稍後重試</p>';
//         if (!assetsContainer.contains(messageArea)) {
//             assetsContainer.prepend(messageArea);
//         }
//     }
// }

async function updateHomePage(account) {
    const assetsContainer = domCache.assetsContainer;

    if (!assetsContainer) {
        console.error('assetsContainer 未找到');
        return;
    }

    if (!account) {
        assetsContainer.querySelector('.message-area')?.remove();
        assetsContainer.innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
        return;
    }

    const existingMessage = assetsContainer.querySelector('.message-area');
    if (existingMessage) existingMessage.remove();

    try {
        const response = await fetch(`${API_BASE_URL}/getSummaryDate/${account}`);
        if (!response.ok) throw new Error('載入當天數據失敗');
        const historyData = await response.json();

        const totalAssets = historyData.total_assets || 0;
        const todayExpenses = historyData.expenses.reduce((sum, expense) => sum + (expense.Amount || 0), 0);

        const totalAssetsElement = assetsContainer.querySelector('#totalAssets .value');
        if (!totalAssetsElement) {
            console.error('totalAssets .value 未找到');
            assetsContainer.innerHTML = `
                <div class="total-assets" id="totalAssets"><span class="label">總資產</span><span class="value">NT$${formatNumber(totalAssets)}</span></div>
                <div id="dailyExpensesContainer" class="record-card-container" style="margin-top: 10px;"></div>
                <div id="aiAssistantBoard" class="ai-assistant-container">
                    <h5 class="mb-3">AI助手</h5>
                    <p class="help-text">您的財務小幫手，未來將提供智慧建議</p>
                    <div id="aiMessages" class="ai-messages"><p class="message-placeholder">目前無訊息，敬請期待 AI 功能！</p></div>
                </div>
                <div id="expenseChartContainer" style="max-width: 400px; margin: 20px auto;"><canvas id="expenseChart"></canvas></div>
                <div id="assetChartContainer" style="max-width: 400px; margin: 10px auto;"><canvas id="assetChart"></canvas></div>
            `;
        } else {
            totalAssetsElement.textContent = `NT$${formatNumber(totalAssets)}`;
        }

        renderDailyExpenses(historyData.expenses || [], todayExpenses);
        
        renderDistributionOnChart('assetChart', 'assetChartContainer', historyData.asset_distribution || {}, '總資產分佈', assetChart);
        renderDistributionOnChart('expenseChart', 'expenseChartContainer', historyData.expense_distribution || {}, '當月開銷分佈', expenseChart);
        // 初始化 AI 留言板（未來可擴展）
        initAIAssistant(historyData.expenses);
        
    } catch (error) {
        console.error('載入當天數據失敗:', error);
        const messageArea = assetsContainer.querySelector('.message-area') || document.createElement('div');
        messageArea.className = 'message-area no-account-message';
        messageArea.innerHTML = '<p>載入失敗，請稍後重試</p>';
        if (!assetsContainer.contains(messageArea)) assetsContainer.prepend(messageArea);
    }
}

// 初始化 AI 助手留言板
// function initAIAssistant() {
//     const aiMessages = document.getElementById('aiMessages');
//     if (!aiMessages) {
//         console.error('aiMessages 未找到');
//         return;
//     }
//     // 目前顯示占位文字，未來可與 Gemini 整合
//     aiMessages.innerHTML = '<p class="message-placeholder">目前無訊息，敬請期待 AI 功能！</p>';
// }

// 初始化 AI 助手留言板
async function initAIAssistant(input_data) {
    const aiMessages = document.getElementById('aiMessages');
    if (!aiMessages) {
        console.error('aiMessages 未找到');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/ai_suggestion/${current_account}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input_data) // 直接傳入 input_data
        });

        if (!response.ok) throw new Error(`載入 AI 建議失敗，狀態碼: ${response.status}`);

        const data = await response.json();
        console.log(data);
        aiMessages.innerHTML = `<p class="ai-message">${data.suggestion}</p>`;
    } catch (error) {
        console.error('載入 AI 建議失敗:', error);
        aiMessages.innerHTML = '<p class="message-placeholder">AI 建議載入失敗</p>';
    }
}

// 初始化開銷追蹤
function initExpenseTracker() {
    // 初始化日期選擇器
    $('.datepicker').datepicker({
        format: 'yyyy/mm/dd',
        autoclose: true,
        todayHighlight: true
    });

    // 快速選擇按鈕
    $('#thisMonth').click(() => setDateRange('thisMonth'));
    $('#lastMonth').click(() => setDateRange('lastMonth'));
    $('#thisYear').click(() => setDateRange('thisYear'));
    $('#moreDateBtn').click(toggleDatePicker); // 新增「更多」按鈕事件
    setDateRange('thisMonth'); // 默認本月

    // 表單提交
    $('#dateRangeForm').submit((e) => {
        e.preventDefault();
        updateExpenseTracker(current_account);
    });
}

// 切換日期選擇器顯示
function toggleDatePicker() {
    const datePickerContainer = document.getElementById('datePickerContainer');
    const isHidden = datePickerContainer.style.display === 'none';
    datePickerContainer.style.display = isHidden ? 'flex' : 'none';
    
    // 如果顯示，確保日期選擇器有值
    if (isHidden) {
        const startDate = $('#startDate').val();
        const endDate = $('#endDate').val();
        if (!startDate || !endDate) {
            setDateRange('thisMonth'); // 默認填入本月日期
        }
    }
}

// 設置日期範圍
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
    }
    $('#startDate').datepicker('setDate', firstDay);
    $('#endDate').datepicker('setDate', lastDay);
}

// 更新開銷追蹤
async function updateExpenseTracker(account) {
    if (!account) {
        domCache.expenseTrackerContainer.innerHTML = '<p class="no-account-message">尚未切換帳戶，請先切換</p>';
        return;
    }

    const formData = {
        start_date: $('#startDate').val(),
        end_date: $('#endDate').val()
    };
    $('#submitSpinner').removeClass('d-none');
    try {
        const response = await fetch(`${API_BASE_URL}/getRecordsByDateRange/${account}?start_date=${formData.start_date}&end_date=${formData.end_date}`);
        if (!response.ok) throw new Error('載入開銷數據失敗');
        const data = await response.json();
        const expenses = data.records.filter(record => record.TransactionType === '支出');
        console.log(expenses);
        updateExpenseSummary(expenses);
        updateExpenseCharts(expenses);
        updateExpenseList(expenses);
    } catch (error) {
        console.error('載入開銷數據失敗:', error);
        domCache.expenseTrackerContainer.innerHTML = '<p class="no-account-message">載入失敗，請稍後重試</p>';
    } finally {
        $('#submitSpinner').addClass('d-none');
    }
}

// 更新開銷摘要
function updateExpenseSummary(expenses) {
    const totalExpense = expenses.reduce((sum, item) => sum + parseInt(item.Amount || 0), 0);
    const days = getDaysDifference($('#startDate').val(), $('#endDate').val());
    const avgDailyExpense = totalExpense / days;

    $('#totalExpense').text(`NT$ ${formatNumber(totalExpense)}`);
    $('#averageDailyExpense').text(`NT$ ${formatNumber(avgDailyExpense.toFixed(0))}`);
    $('#transactionCount').text(expenses.length);
}

// 更新開銷圖表
function updateExpenseCharts(expenses) {
    const categories = {};
    expenses.forEach(item => {
        const category = item.Category|| '其他';
        categories[category] = (categories[category] || 0) + parseFloat(item.Amount || 0);
    });
    const dailyExpenses = {};
    expenses.forEach(item => {
        const date = item.date.split(' ')[0];
        dailyExpenses[date] = (dailyExpenses[date] || 0) + parseFloat(item.Amount || 0);
    });

    if (domCache.expenseCategoryChart) domCache.expenseCategoryChart.destroy();
    if (domCache.expenseTrendsChart) domCache.expenseTrendsChart.destroy();

    // 計算總金額
    const totalAmount = Object.values(categories).reduce((sum, value) => sum + value, 0);
    const labels = Object.keys(categories);
    const amounts = Object.values(categories);
    const percentages = amounts.map(amount => totalAmount > 0 ? (amount / totalAmount * 100).toFixed(1) : 0);

    domCache.expenseCategoryChart = new Chart(document.getElementById('expenseCategoryChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                data: Object.values(categories),
                backgroundColor: ['#7ed321', '#ff6b6b', '#4a90e2', '#f8e71c', '#50e3c2']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'right' }, title: { display: true, text: '消費占比' } } }
    });

    const sortedDates = Object.keys(dailyExpenses).sort();
    domCache.expenseTrendsChart = new Chart(document.getElementById('expenseTrendsChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: [{
                label: '每日開銷',
                data: sortedDates.map(date => dailyExpenses[date]),
                borderColor: '#4a90e2',
                backgroundColor: 'rgba(74, 144, 226, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    // 渲染類別表格
    renderCategoryTable(labels, amounts, percentages);
}

// 渲染類別表格
function renderCategoryTable(labels, amounts, percentages) {
    const tbody = document.getElementById('categoryTableBody');
    tbody.innerHTML = ''; // 清空現有內容

    if (labels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-data">無數據</td></tr>';
        return;
    }

    labels.forEach((category, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${category}</td>
            <td>NT$${formatNumber(amounts[index])}</td>
            <td>${percentages[index]}%</td>
        `;
        tbody.appendChild(row);
    });
}

// 更新開銷列表
function updateExpenseList(expenses) {
    const container = document.getElementById('expenseListContainer');
    container.innerHTML = '';
    if (expenses.length === 0) {
        container.innerHTML = '<p class="no-account-message">此期間沒有開銷記錄</p>';
        return;
    }

    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    const fragment = document.createDocumentFragment();
    expenses.forEach(item => {
        const card = document.createElement('div');
        card.className = 'record-card expense-card';
        card.innerHTML = `
            <div class="record-header">
                <span>${item.date}</span>
            </div>
            <div class="record-item">
                <span>${item.Item || '未命名支出'}</span>
                <span class="expense-amount">NT$${formatNumber(item.Amount || 0)}</span>
            </div>
        `;
        fragment.appendChild(card);
    });
    container.appendChild(fragment);
}

// 計算日期差
function getDaysDifference(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}