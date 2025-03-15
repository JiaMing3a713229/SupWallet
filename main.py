from flask import Flask, request, jsonify
from flask_cors import CORS
from SupWalletAPI import SupWallet
import requests
from lxml import html
import json

app = Flask(__name__)
CORS(app)  # 啟用 CORS，允許所有來源訪問

# 初始化 SupWallet
service_account_key = "serviceAccountKey.json"  # 替換為你的服務帳戶金鑰路徑
wallet = SupWallet(db_name="UserDB", serviceAccountKey=service_account_key)

def get_current_price(item: str):
    """
    獲取股票當前價格，支持 TW 和 TWO 市場
    Args:
        item: 股票代碼
    Returns:
        float 或 None: 當前價格或無法獲取時返回 None
    """
    # 定義可能的市場後綴
    market_suffixes = ['.TW', '.TWO']
    
    # 添加 User-Agent 模擬瀏覽器
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    for suffix in market_suffixes:
        url = f"https://finance.yahoo.com/quote/{item}{suffix}"
        
        try:
            # 發送 HTTP 請求
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()  # 如果狀態碼不是 200，會拋出異常
            
            # 解析 HTML
            tree = html.fromstring(response.content)
            
            # 使用更穩健的 XPath（Yahoo Finance 可能會改變結構）
            price_xpath = '/html/body/div[2]/main/section/section/section/article/section[1]/div[2]/div[1]/section/div/section/div[1]/div[1]/span[1]/text()'
            price_elements = tree.xpath(price_xpath)
            
            if price_elements:
                current_price = float(price_elements[0].replace(",", ""))
                print(f"{item}{suffix} 的當前價格: {current_price}")
                return float(current_price)
                
        except requests.RequestException as e:
            print(f"無法訪問 {url}，錯誤: {str(e)}")
            continue
    
    print(f"找不到 {item} 的價格，可能不在 TW 或 TWO 市場")
    return None

# 獲取帳戶列表
# 定義一個路由
@app.route('/')
def say_hello():
    return "Hello SupWallet"

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    # 這裡假設有一個方法可以從 Firestore 獲取所有用戶 ID
    users = wallet.getAllUsers()
    return jsonify(users)

# 獲取首頁資產資料
@app.route('/api/home/<user_id>', methods=['GET'])
def get_home_page_data(user_id):
    assets = wallet.getAssetAllData(user_id)
    total_current_value = sum(asset['CurrentValue'] for asset in assets)
    return jsonify({"totalAssets": total_current_value})

# 獲取股票資料
@app.route('/api/stocks/<user_id>', methods=['GET'])
def get_stock_data(user_id):
    stocks = wallet.getAssetAllData(user_id)
    stock_data = []
    for stock in stocks:
        if stock.get("Type") in ["股票", "ETF", "金融股", "美債"]:
            stock_data.append(stock)
    return jsonify(stock_data)
# 獲取資產資料
@app.route('/api/assets/<user_id>', methods=['GET'])
def get_asset_data(user_id):
    assets = wallet.getAssetAllData(user_id)
    asset_data = []
    for asset in assets:
        if asset.get("Type") in ["股票", "ETF", "金融股", "美債"]:
            continue
        asset_data.append(asset)
        print("append asset", asset)
    return jsonify(asset_data)

# 更新庫存（買入或賣出）
@app.route('/api/changeInventory/<user_id>', methods=['POST'])
def update_inventory(user_id):
    data = request.json
    state = data.get("state")  # 0: buy, 1: sell
    name = data.get("name")
    shares = data.get("shares")

    print("changeInventory:", data)
    asset_data = {"name": name, "shares": shares}
    existAsset = wallet.findAsset(user_id, name)

    if existAsset != None:
        print("Inventory found")
        currentPrice = get_current_price(name)
        exist_data = existAsset["data"]
        exist_id = existAsset["id"]
        exist_data["Quantity"] += shares
        updateValue = {
            "id": exist_data["id"],
            'date' : exist_data["date"],
            'Item' : exist_data["Item"],
            'Type' : exist_data["Type"],
            'Quantity' : exist_data["Quantity"],
            'CurrentPrice': currentPrice,  # 確保數值格式
            'InitialAmount' : (exist_data["InitialAmount"] + shares * currentPrice),
            'CurrentValue' : exist_data["CurrentValue"] + shares * currentPrice
        }
        wallet.updateAsset(user_id, exist_id, updateValue)
        return jsonify({"message": "Inventory updated"})
    else:
        print("Inventory not found")
        return jsonify({"message": "Inventory not found"})

# 提交記帳資料
@app.route('/api/submitAccount/<user_id>', methods=['POST'])
def submit_account_data(user_id):
    data = request.json
    formatted_data = {
        "date": data["date"],
        "Item": data["items"],
        "Category": data["property"],
        "TransactionType": data["isIncome"],
        "Amount": float(data["amounts"])
    }
    doc_id = wallet.insert_to_expense(user_id, formatted_data)
    return jsonify({"message": "Account data submitted", "doc_id": doc_id})

# 提交股票資料
@app.route('/api/submitStock/<user_id>', methods=['POST'])
def submit_stock_data(user_id):
    currentPrice = 0
    currentValue = 0
    data = request.json
    existAsset = wallet.findAsset(user_id, data["items"])
    if(existAsset != None):
        exist_data = existAsset["data"]
        print(exist_data['Item'],"Asset existed")
        exist_id = existAsset["id"]
        currentPrice = get_current_price(data["items"])
        updateValue = {
            "id": exist_data["id"],
            'date' : exist_data["date"],
            'Item' : exist_data["Item"],
            'Type' : exist_data["Type"],
            'Quantity' : exist_data["Quantity"] + int(data["quantity"]),
            'CurrentPrice': currentPrice,  # 確保數值格式
            'InitialAmount' : (exist_data["InitialAmount"] + int(data["quantity"]) * currentPrice),
            'CurrentValue' : exist_data["CurrentValue"] + int(data["quantity"]) * currentPrice
        }
        wallet.updateAsset(user_id, exist_id, updateValue)
        return jsonify({"message": "Stock data updated"})
    else:
        if(data["type"] == '股票' or data["type"] == 'ETF' or data["type"] == '美債' or data["type"] == '金融股'):
            currentPrice = get_current_price(data["items"])
            currentValue = int(data["quantity"]) * int(currentPrice)
        else:
            currentValue = data["inventVal"]
        formatted_data = {
            'date': data["date"],
            'Item': data["items"],
            'Type': data["type"],
            'Quantity': int(data["quantity"]),
            'InitialAmount': data["initialAmount"],
            'CurrentPrice': currentPrice,  # 確保數值格式
            'CurrentValue': currentValue
        }
        doc_id = wallet.insert_to_assets(user_id, formatted_data)
        return jsonify({"message": "Stock data submitted", "doc_id": doc_id})

# 查詢記錄（分頁）
@app.route('/api/getRecords/<user_id>', methods=['GET'])
def search_records(user_id):
    # 獲取查詢參數，默認為 page=1, limit=15
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 15, type=int)

    # 獲取當月支出記錄列表
    expenses_ref = wallet.getMonthlyExpense(user_id)  # 假設返回的是 List[dict]
    print("expenses_ref", expenses_ref)
    # 將記錄轉換為帶有 id 的字典列表
    expenses = [
        {
            "id": exp["id"],  # 如果原始數據沒有 id，可以用索引作為臨時 id
            "date": exp.get("date", ""),  # 注意這裡字段名應與前端一致
            "item": exp.get("Item", ""),  # 假設有 Item 字段，需與前端匹配
            "amount": exp.get("Amount", 0.0),
            "type": exp.get("TransactionType", "")
        }
        for idx, exp in enumerate(expenses_ref)
    ]

    # 計算分頁的起點和終點
    start = (page - 1) * limit
    end = start + limit

    # 根據分頁參數切片記錄
    records = expenses[start:end]
    has_more = len(expenses) > end  # 判斷是否還有更多數據

    # 打印日誌以便調試
    print(f"Page: {page}, Limit: {limit}, Total Records: {len(expenses)}, Returned: {len(records)}")
    print("Records:", records)

    # 返回 JSON 響應
    return jsonify({"records": records, "hasMore": has_more})

# 獲取總收入與支出
@app.route('/api/totals/<user_id>', methods=['GET'])
def get_total_expense(user_id):
    expenses = wallet.getMonthlyExpense(user_id)
    total_income = 0
    total_expense = 0
    for doc in expenses:
        amount = doc.get("Amount", 0)
        if doc.get("TransactionType") == "收入":
            total_income += amount
        else:
            total_expense += amount
    return jsonify({"totalIncome": total_income, "totalExpense": total_expense, "owner": user_id})

# 更新記錄
@app.route('/api/record/<user_id>/<record_id>', methods=['PUT'])
def update_record(user_id, record_id):
    data = request.json
    data["Amount"] = int(data["Amount"])
    wallet.updateExpense(user_id, record_id, data)
    # wallet.db.collection(wallet.database).document(user_id).collection("expenses").document(record_id).set(data)
    return jsonify({"message": "Record updated"})

# 刪除記錄
@app.route('/api/record/<user_id>/<record_id>', methods=['DELETE'])
def delete_record(user_id, record_id):
    wallet.deleteDatafromFirestore(user_id, "expenses", record_id)
    return jsonify({"message": "Record deleted"})

if __name__ == "__main__":
    app.run(debug=True)