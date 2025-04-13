from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from SmartMF import SmartMF
import requests
from lxml import html
import json


import base64
import os
from google import genai
from google.genai import types


client = genai.Client(api_key= 'AIzaSyDqqI2-g6VQoGvQvxixEg6xNtjlhJh9h3I') # Replace 'YOUR_API_KEY' with your actual Gemini API key
app = Flask(__name__)
CORS(app)  # 啟用 CORS，允許所有來源訪問
 

# 初始化 SupWallet
wallet = SmartMF() # Removed db_name argument as it's handled in SupWallet class


def get_current_price(item: str) -> int:
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
 

@app.route('/')
def list_api_endpoints():
    endpoints = {
        '/': '列出所有 API 端點',
        '/api/accounts': 'GET - 獲取所有用戶帳戶列表',
        '/api/home/<user_id>': 'GET - 獲取指定用戶首頁資產總值',
        '/api/stocks/<user_id>': 'GET - 獲取指定用戶的股票資產資料',
        '/api/assets/<user_id>': 'GET - 獲取指定用戶的非股票資產資料',
        '/api/changeInventory/<user_id>': 'POST - 更新指定用戶的庫存（買入或賣出股票）',
        '/api/submitAccount/<user_id>': 'POST - 提交指定用戶的記帳資料',
        '/api/submitStock/<user_id>': 'POST - 提交或更新指定用戶的股票資產資料',
        '/api/getRecords/<user_id>': 'GET - 獲取指定用戶的記帳記錄（分頁）',
        '/api/totals/<user_id>': 'GET - 獲取指定用戶當月總收入與支出',
        '/api/record/<user_id>/<record_id>': 'PUT - 更新指定用戶的特定記帳記錄',
        '/api/record/<user_id>/<record_id>': 'DELETE - 刪除指定用戶的特定記帳記錄',
        '/api/editAsset/<user_id>': 'POST - 編輯指定用戶的資產',
        '/api/getDailyHistory/<user_id>': 'GET - 獲取指定用戶當天的歷史記錄',
        '/api/getSummaryDate/<user_id>': 'GET - 獲取指定用戶指定日期的總結數據',
        '/api/getRecordsByDateRange/<account>': 'GET - 獲取指定用戶在指定日期範圍內的記帳記錄 (需提供 start_date 和 end_date 查詢參數)',
        # '/api/ai_suggestion/<account>': 'POST - 獲取 AI 財務建議 (目前註解)',
    }
    return jsonify(endpoints)

    # 獲取帳戶列表
@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    # 這裡假設有一個方法可以從 Firestore 獲取所有用戶 ID
    users = wallet.get_all_users() # Changed to get_all_users
    return jsonify(users)


# 獲取首頁資產資料
@app.route('/api/home/<user_id>', methods=['GET'])
def get_home_page_data(user_id):
    wallet.updateStockPrice(user_id)
    assets = wallet.get_all_assets(user_id) # Changed to get_all_assets
    # 獲取所有資產的當前淨資產價值
    total_current_value = 0
    for asset in assets:
        if(asset.get('current_amount') != None): # Corrected key name
            total_current_value += asset['current_amount'] # Corrected key name
    return jsonify({"totalAssets": total_current_value})
    
 

# 獲取股票資料
@app.route('/api/stocks/<user_id>', methods=['GET'])
def get_stock_data(user_id):
    stocks = wallet.get_all_assets(user_id) # Changed to get_all_assets
    fixed_assets = wallet.get_options(user_id).get('assetType').get('assets').get('fixed_assets') # Changed to get_options
    stock_data = []
    for stock in stocks:
        if stock.get("asset_type") in (["股票", "ETF", "金融股", "美債"] + list(fixed_assets)): # Corrected key name
            stock_data.append(stock)
    return jsonify(stock_data)
# 獲取資產資料
@app.route('/api/assets/<user_id>', methods=['GET'])
def get_asset_data(user_id):
    assets = wallet.get_all_assets(user_id) # Changed to get_all_assets
    ignore_assets = wallet.get_options(user_id).get('assetType').get('assets').get('fixed_assets') # Changed to get_options
    asset_data = []
    for asset in assets:
        if asset.get("asset_type") in (list(ignore_assets) + ['ETF', '金融股', '股票', '美債']): # Corrected key name
            continue
        asset_data.append(asset)
    
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
    existAsset = wallet.find_asset_by_name(user_id, name) # Changed to find_asset_by_name
 

    if existAsset != None:
        print("Inventory found")
        current_price = get_current_price(name)
        exist_data = existAsset["acquisition_date"]
        exist_id = existAsset["id"]
        exist_data["quantity"] += shares # Corrected key name
        updateValue = {
            "id": exist_data["id"],
            'acquisition_date' : exist_data["acquisition_date"],
            'item' : exist_data["item"], # Corrected key name
            'asset_type' : exist_data["asset_type"], # Corrected key name
            'quantity' : exist_data["quantity"], # Corrected key name
            'current_price': current_price,  # 確保數值格式 # Corrected key name
            'acquisition_value' : (exist_data["acquisition_value"] + shares * current_price), # Corrected key name
            'current_amount' : exist_data["acquisition_value"] + shares * current_price # Corrected key name
        }
        wallet.update_asset(user_id, exist_id, updateValue) # Changed to update_asset
        return jsonify({"message": "Inventory updated"})
    else:
        print("Inventory not found")
        return jsonify({"message": "Inventory not found"})
 

# 提交記帳資料
@app.route('/api/submitAccount/<user_id>', methods=['POST'])
def submit_account_data(user_id):
    data = request.json
    formatted_data = {
        "amount": data["amount"],
        "item": data["items"], # Corrected key name
        "category": data["category"], # Corrected key name
        "date": data["date"], # Corrected key name
        "invoice_number": data["invoice_number"], # Corrected key name
        "merchant": data["merchant"], # Corrected key name
        "payment_method": data["payment_method"], # Corrected key name
        "notes" : data["notes"], # Corrected key name
        "transactionType": data["transactionType"], # Corrected key name
    }
    
    doc_id = wallet.add_expense(user_id, formatted_data) # Changed to add_expense
    # return jsonify({"message": "Account data submitted", "doc_id": doc_id})
    return jsonify({"message": "Account data submitted"})
 

# 提交股票資料
@app.route('/api/submitStock/<user_id>', methods=['POST'])
def submit_stock_data(user_id):
    currentPrice = 0
    currentValue = 0
    data = request.json
    existAsset = wallet.find_asset_by_name(user_id, data["items"]) # Changed to find_asset_by_name
    if(existAsset != None):
        exist_data = existAsset["data"]
        print(exist_data['item'],"Asset existed") # Corrected key name
        exist_id = existAsset["id"]
        currentPrice = get_current_price(data["items"])
        updateValue = {
            "id": exist_data["id"],
            'date' : exist_data["date"],
            'item' : exist_data["items"],
            'type' : exist_data["type"], # Corrected key name
            'quantity' : exist_data["quantity"], # Corrected key name
            'currentValue': currentPrice,  # 確保數值格式 # Corrected key name
            'initialAmount' : (exist_data["initialAmount"] + int(data["quantity"]) * currentPrice), # Corrected key name
            'currentValue' : exist_data["currentValue"] + int(data["quantity"]) * currentPrice # Corrected key name
        }
        wallet.update_asset(user_id, exist_id, updateValue) # Changed to update_asset
        return jsonify({"message": "Stock data updated"})
    else:
        if(data["type"] == '股票' or data["type"] == 'ETF' or data["type"] == '美債' or data["type"] == '金融股'): # Corrected key name
            currentPrice = get_current_price(data["items"])
            currentValue = int(data["quantity"]) * int(currentPrice) # Corrected key name
        else:
            currentValue = data["initialAmount"] # Corrected key name
        formatted_data = {
            'date': data["date"],
            'item': data["items"], # Corrected key name
            'type': data["type"], # Corrected key name
            'quantity': int(data["quantity"]), # Corrected key name
            'initialAmount': data["initialAmount"], # Corrected key name
            'currentValue': currentPrice,  # 確保數值格式 # Corrected key name
            'currentValue': currentValue # Corrected key name
        }
        doc_id = wallet.add_asset(user_id, formatted_data) # Changed to add_asset
        return jsonify({"message": "Stock data submitted", "doc_id": doc_id})
 

# 查詢記錄（分頁）
@app.route('/api/getRecords/<user_id>', methods=['GET'])
def search_records(user_id):
    # 獲取查詢參數，默認為 page=1, limit=15
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 15, type=int)
 
    # 獲取當月支出記錄列表
    expenses_ref = wallet.get_monthly_expenses(user_id)  # 假設返回的是 List[dict]
    # print("expenses_ref", expenses_ref)
    # 將記錄轉換為帶有 id 的字典列表
    expenses = [
        {
            "id": exp["id"],  # 如果原始數據沒有 id，可以用索引作為臨時 id
            "date": exp.get("date", ""),  # 注意這裡字段名應與前端一致
            "item": exp.get("item", ""),  # 假設有 Item 字段，需與前端匹配 # Corrected key name
            "amount": exp.get("amount", 0.0), # Corrected key name
            "transactionType": exp.get("transactionType", "") # Corrected key name
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
    # print(f"Page: {page}, Limit: {limit}, Total Records: {len(expenses)}, Returned: {len(records)}")
    # print("Records:", records)
 

    # 返回 JSON 響應
    return jsonify({"records": records, "hasMore": has_more})
 

# 獲取當月總收入與支出
@app.route('/api/totals/<user_id>', methods=['GET'])
def get_total_expense(user_id):
    expenses = wallet.get_monthly_expenses(user_id) # Changed to get_monthly_expenses
    total_income = 0
    total_expense = 0
    for doc in expenses:
        amount = doc.get("amount", 0) # Corrected key name
        if doc.get("transactionType") == "收入": # Corrected key name
            total_income += amount
        else:
            total_expense += amount
    return jsonify({"totalIncome": total_income, "totalExpense": total_expense, "owner": user_id})
 

# 更新記錄
@app.route('/api/record/<user_id>/<record_id>', methods=['PUT'])
def update_record(user_id, record_id):
    data = request.json
    data["amount"] = int(data["amount"]) # Corrected key name
    wallet.update_expense(user_id, record_id, data) # Changed to update_expense
    # wallet.db.collection(wallet.database).document(user_id).collection("expenses").document(record_id).set(data)
    return jsonify({"message": "Record updated"})
 

# 刪除記錄
@app.route('/api/record/<user_id>/<record_id>', methods=['DELETE'])
def delete_record(user_id, record_id):
    wallet.delete_expense(user_id, "expenses", record_id) # Changed to delete_expense
    return jsonify({"message": "Record deleted"})
 
@app.route('/api/editAsset/<user_id>', methods=['POST'])
def edit_record(user_id):
    data = request.json
    edit_id = data.get("assetId")
    amount = data.get("amounts")
    # src_data = wallet.getAssets(user_id, edit_id)
    # print("src_data", src_data)
    # current_val = src_data.get("CurrentValue")
    # amount = -int(data.get("amounts")) if data.get("isIncome") == "支出" else int(data.get("amounts"))
    edit_asset_data ={
        "date": data["date"],
        "initialAmount": amount,
        "currentValue": amount
    }
    wallet.update_asset(user_id, edit_id, edit_asset_data)
    return jsonify({"message": "Record deleted"})
 

@app.route('/api/getDailyHistory/<user_id>', methods=['GET'])
def get_daily_history(user_id):
    date = datetime.now().strftime("%Y%m%d")  # 當天日期，例如 20250317
    try:
        doc_ref = wallet.firestore_client.db.collection(wallet._get_users_collection_path()).document(user_id).collection("history").document(date)
        doc = doc_ref.get()
        if doc.exists:
            return jsonify(doc.to_dict())
        else:
            return jsonify({"message": "當天無歷史記錄", "data": {}}), 404
    except Exception as e:
        print(f"查詢 {user_id} 的 {date} 歷史記錄失敗: {str(e)}")
        return jsonify({"error": str(e)}), 500
 

@app.route('/api/getSummaryData/<user_id>', methods=['GET'])
def get_summary_data(user_id):
# date = datetime.now().strftime("%Y%m%d")  # 當天日期，例如 20250317
    strDate = datetime.now().strftime("%Y/%m/%d")
    try:
        data = wallet.get_summary_data(user_id, strDate) # Changed to get_summary_data
        return jsonify(data)
        
    except Exception as e:
        print(f"查詢 {user_id} 的 {strDate} 歷史記錄失敗: {str(e)}")
        return jsonify({"error": str(e)}), 500
    return "Summary data saved"
 

# 查詢記錄的路由
@app.route('/api/getRecordsByDateRange/<account>', methods=['GET'])
def get_records(account):
    try:
        # 從查詢參數中獲取日期範圍
        
        start_date = request.args.get('start_date')  # 格式: YYYY/MM/DD
        end_date = request.args.get('end_date')      # 格式: YYYY/MM/DD
        
        # 驗證日期參數
        if not start_date or not end_date:
            return jsonify({"error": "請提供 start_date 和 end_date"}), 400
        
        try:
            # 驗證日期格式
            datetime.strptime(start_date, '%Y/%m/%d')
            datetime.strptime(end_date, '%Y/%m/%d')
        except ValueError:
            return jsonify({"error": "日期格式無效，應為 YYYY/MM/DD"}), 400
 

        # 調用 getExpensebyRange 方法
        records = wallet.get_expenses_by_date_range( # Changed to get_expenses_by_date_range
            user_id=account,
            start_date=start_date,
            end_date=end_date
        )
        # 返回結果
        response = {
            "records": records,
            "hasMore": False  # 如果有分頁需求，可根據實際情況設置
        }
        return jsonify(response), 200
 

    except Exception as e:
        return jsonify({"error": str(e)}), 500
 

 # AI 建議路由
@app.route('/api/ai_suggestion/<account>', methods=['POST'])
def ai_suggestion(account):
    try:
        # 獲取用戶輸入的數據
        data = request.get_json()
        suggestion = ""
        if not data:
            return jsonify({"suggestion": "您的AI助手充電中!"}), 200
        else:
            # 將 JSON 數據轉換為提示文字
            prompt = f"你好，我是 {account}，可以稱我為{account}，，這是我今天的開銷情況："
            if data:
                prompt += "可以口語化的整理我的財務情況，簡短不超過30字的提醒或鼓勵，以下是我的財務資料："
                for record in data:
                    amount = record.get('amount', 0)
                    category = record.get('category', '其他')
                    date = record.get('date', '未知日期')
                    prompt += f"- {date}: {category} {amount} 元，"
            else:
                prompt += "無具體記錄"
            prompt += "請提供簡短的財務建議。"
 

        # 使用 Gemini API 生成建議
        suggestion = client.models.generate_content(
            model="gemini-2.0-flash", contents=prompt
        ).text
 

        # 返回建議文字
        return jsonify({"suggestion": suggestion}), 200
 

    except ValueError as ve:
        return jsonify({"error": "數據格式錯誤: " + str(ve)}), 400
    except Exception as e:
        return jsonify({"error": "生成建議失敗: " + str(e)}), 500
 

 

if __name__ == "__main__":
    app.run(debug=True, port=8080, host='0.0.0.0')