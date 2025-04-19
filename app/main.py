from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from SmartMF import SmartMF
import requests
from lxml import html
import json
import firebase_admin
from firebase_admin import credentials
from firebase_admin import auth
import base64
import os
from google import genai
from google.genai import types


client = genai.Client(api_key= 'AIzaSyDqqI2-g6VQoGvQvxixEg6xNtjlhJh9h3I') # Replace 'YOUR_API_KEY' with your actual Gemini API key
app = Flask(__name__)
CORS(app)  # 啟用 CORS，允許所有來源訪問
 

# 初始化 SupWallet
wallet = SmartMF() # Removed db_name argument as it's handled in SupWallet class
# ---> 新增 Firebase Token 驗證裝飾器 <---
from functools import wraps

def firebase_token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        # 從 Authorization header 獲取 token
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]

        if not token:
            return jsonify({"error": "缺少 Authorization Token"}), 401

        try:
            # 驗證 Firebase ID Token
            # check_revoked=True 可以檢查 token 是否已被撤銷 (例如用戶更改密碼)
            decoded_token = auth.verify_id_token(token, check_revoked=True)
            # 將驗證後的 user id (uid) 存放在 Flask 的 g 物件中，方便後續路由使用
            g.uid = decoded_token.get('uid')
            g.email = decoded_token.get('email')
            if not g.uid:
                 raise ValueError("Token is missing UID.")
            # print(f"Token verified for UID: {g.uid}")
        except auth.RevokedIdTokenError:
            return jsonify({"error": "Token已被撤銷，請重新登入"}), 401
        except auth.InvalidIdTokenError as e:
            print(f"Invalid Token Error: {e}")
            return jsonify({"error": "無效的 Authorization Token"}), 401
        except Exception as e:
            print(f"Token Verification Error: {e}")
            return jsonify({"error": "Token 驗證失敗"}), 401

        return f(*args, **kwargs)
    return decorated_function
# 這個 API 現在應該在前端 Firebase Auth 註冊成功後被調用
@app.route('/api/createUserProfile', methods=['POST'])
@firebase_token_required # <--- 使用新的裝飾器驗證請求來源
def create_user_profile():
    """在 Firestore 中為新註冊的使用者建立 Profile 文件"""
    uid = g.uid # 從已驗證的 token 中獲取 uid
    email = g.email # 從 token 中獲取 email

    # 可以選擇性地從請求 body 獲取額外資訊，例如 username
    data = request.get_json() or {}
    username = data.get('username') # 前端在註冊後可以將選擇的 username 傳過來

    if not uid or not email:
        return jsonify({"error": "無法從 Token 獲取必要的用戶資訊"}), 400

    try:
        # 呼叫修改過的 add_user_profile
        success = wallet.add_user_profile(uid=uid, email=email, username=username)
        if success:
            return jsonify({"message": "使用者 Profile 建立成功"}), 201
        else:
            # add_user_profile 返回 False 可能表示 Firestore 操作失敗
            return jsonify({"error": "建立使用者 Profile 失敗"}), 500
    except Exception as e:
        print(f"建立 Profile 失敗 for UID {uid}: {e}")
        return jsonify({"error": "建立 Profile 時發生伺服器錯誤"}), 500
# <--------------------------------------------------->

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


# 範例：修改 /api/home
@app.route('/api/home', methods=['GET'])
@firebase_token_required # <--- 使用新的裝飾器
def get_home_page_data():
    uid = g.uid # <--- 從 g 物件獲取 uid
    try:
        # wallet.updateStockPrice(uid)
        assets = wallet.get_all_assets(uid)
        total_current_value = sum(asset.get('current_amount', 0) for asset in assets if asset.get('current_amount') is not None)
        return jsonify({"totalAssets": total_current_value})
    except Exception as e:
         print(f"Error getting home page data for {uid}: {e}")
         return jsonify({"error": "獲取首頁資料時發生錯誤"}), 500
    
# 獲取股票資料
@app.route('/api/options', methods=['GET'])
@firebase_token_required
def get_options_data():
    uid = g.uid
    options = wallet.get_options(uid) # Changed to get_options
    return jsonify(options)

# 獲取股票資料
@app.route('/api/stocks', methods=['GET'])
@firebase_token_required
def get_stock_data():
    uid = g.uid
    wallet.updateStockPrice(uid)
    print(f"Stock price update attempt finished for UID: {uid}.")

    stocks = wallet.get_all_assets(uid) # Changed to get_all_assets
    fixed_assets = wallet.get_options(uid).get('assetType').get('assets').get('fixed_assets') # Changed to get_options
    stock_data = []
    for stock in stocks:
        if stock.get("asset_type") in (["股票", "ETF", "金融股", "美債"] + list(fixed_assets)): # Corrected key name
            stock_data.append(stock)
    return jsonify(stock_data)

# 獲取資產資料
@app.route('/api/assets', methods=['GET'])
@firebase_token_required
def get_asset_data():
    user_id = g.uid
    assets = wallet.get_all_assets(user_id) # Changed to get_all_assets
    ignore_assets = wallet.get_options(user_id).get('assetType').get('assets').get('fixed_assets') # Changed to get_options
    asset_data = []
    for asset in assets:
        if asset.get("asset_type") in (list(ignore_assets) + ['ETF', '金融股', '股票', '美債']): # Corrected key name
            continue
        asset_data.append(asset)
    
    return jsonify(asset_data)
 
 # ---> 新增：更新資產的 API 端點 (RESTful 風格) <---
@app.route('/api/asset/<asset_id>', methods=['PUT']) # 使用 PUT 方法，asset_id 在 URL 中
@firebase_token_required # 使用 Firebase Token 驗證
def update_asset_data(asset_id): # 函數名修改，接收 asset_id 參數
    """處理更新指定資產 ID 的數據請求"""
    uid = g.uid # 從已驗證的 token 中獲取用戶 UID

    # 1. 獲取前端發送的更新後數據
    data = request.json
    if not data:
        return jsonify({"error": "請求中缺少更新數據"}), 400

    print(f"Received asset update request for ID: {asset_id} by UID: {uid}")
    print(f"Update data: {data}")

    # 2. 準備要更新到 Firestore 的數據字典
    #    只包含前端 Modal 中可編輯的欄位
    #    後端可以再次驗證數據格式和類型
    update_payload = {}
    allowed_fields = ["item", "asset_type", "acquisition_date", "acquisition_value", "quantity", "notes"]
    for field in allowed_fields:
        if field in data: # 只更新前端有提供的欄位
            if field =="acquisition_value":
                update_payload['current_amount'] = data[field]

            # 基本類型轉換和驗證 (可以做得更完善)
            if field in ["acquisition_value", "quantity"] :
                try:
                    # 嘗試轉換為數字，quantity 應為整數
                    update_payload[field] = int(data[field]) if field == "quantity" else float(data[field])
                    # 可以加入非負數檢查
                    if update_payload[field] < 0 and field != 'quantity': # quantity 可以是 -1
                         return jsonify({"error": f"欄位 '{field}' 的值不能為負數"}), 400
                    # 對於 quantity，需要根據 asset_type 判斷是否需要 > 0
                    # 這部分驗證可以在 SmartMF 中做
                except (ValueError, TypeError):
                    return jsonify({"error": f"欄位 '{field}' 的值必須是有效的數字"}), 400
            elif field == "acquisition_date":
                 # 驗證日期格式
                 try:
                     datetime.strptime(data[field], '%Y/%m/%d')
                     update_payload[field] = data[field]
                 except (ValueError, TypeError):
                      return jsonify({"error": "欄位 'acquisition_date' 的格式無效，應為 YYYY/MM/DD"}), 400
            else:
                # 其他欄位直接賦值 (例如 item, asset_type, notes)
                 update_payload[field] = data.get(field) # 使用 get 避免 KeyError

    # 檢查是否有任何有效數據被更新
    if not update_payload:
        return jsonify({"error": "請求中沒有有效的可更新欄位"}), 400

    # 3. 調用 SmartMF 中的更新方法 (假設已存在或需要創建)
    #    這個方法需要驗證 asset_id 是否屬於 uid，然後才更新
    try:
        # *** 你需要在 SmartMF.py 中實現或確認 update_asset 方法 ***
        # 它應該接收 uid, asset_id, 和要更新的數據字典
        success = wallet.update_asset(user_id=uid, asset_id=asset_id, asset_data=update_payload)

        if success:
            return jsonify({"message": "資產更新成功", "id": asset_id}), 200 # 返回成功訊息和 ID
        else:
            # 可能的原因：asset_id 不存在，或不屬於該 uid，或 Firestore 更新失敗
            return jsonify({"error": "更新資產失敗，請確認資產 ID 是否正確或稍後再試"}), 404 # 或 500

    except Exception as e:
        # 捕捉 SmartMF 方法中可能未處理的異常
        print(f"Error updating asset {asset_id} for UID {uid}: {e}")
        return jsonify({"error": "更新資產時發生內部錯誤", "details": str(e)}), 500

# 更新庫存（買入或賣出）
@app.route('/api/changeInventory', methods=['POST'])
@firebase_token_required
def update_inventory():
    user_id = g.uid # <--- 從 g 物件獲取 uid
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
@app.route('/api/submitAccount', methods=['POST'])
@firebase_token_required
def submit_account_data():
    user_id = g.uid # <--- 從 g 物件獲取 uid
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
@app.route('/api/submitStock', methods=['POST'])
@firebase_token_required
def submit_stock_data():
    user_id = g.uid # <--- 從 g 物件獲取 uid
    currentPrice = 0
    currentValue = 0
    data = request.json
    existAsset = wallet.find_asset_by_name(user_id, data["item"]) # Changed to find_asset_by_name
    if(existAsset != None):
        exist_data = existAsset["data"]
        print(exist_data['item'],"Asset existed") # Corrected key name
        exist_id = existAsset["id"]
        currentPrice = get_current_price(data["item"])
        updateValue = {
            "id": exist_data["id"],
            'acquisition_date' : exist_data["acquisition_date"],
            'item' : exist_data["item"],
            'asset_type' : exist_data["asset_type"], # Corrected key name
            'quantity' : exist_data["quantity"], # Corrected key name
            'current_price': currentPrice,  # 確保數值格式 # Corrected key name
            'acquisition_value' : (exist_data["acquisition_value"] + int(data["quantity"]) * currentPrice), # Corrected key name
            'current_amount' : exist_data["current_amount"] + int(data["quantity"]) * currentPrice # Corrected key name
        }

        wallet.update_asset(user_id, exist_id, updateValue) # Changed to update_asset

        return jsonify({"message": "Stock data updated"})
    else:
        options = wallet.get_options(user_id) # Changed to get_options
        asset_type = options.get('assetType').get('assets').get('fixed_assets') # Changed to get_options
        if(data["asset_type"] in asset_type): # Corrected key name
            currentPrice = get_current_price(data["item"])
            currentValue = int(data["quantity"] * currentPrice) # Corrected key name
        else:
            currentValue = data["acquisition_value"] # Corrected key name
        formatted_data = {
            'acquisition_date': data["acquisition_date"],
            'item': data["item"], # Corrected key name
            'asset_type': data["asset_type"], # Corrected key name
            'quantity': int(data["quantity"]), # Corrected key name
            'acquisition_value': data["acquisition_value"], # Corrected key name
            'current_price': currentPrice,  # 確保數值格式 # Corrected key name
            'current_amount': currentValue # Corrected key name
        }
        doc_id = wallet.add_asset(user_id, formatted_data) # Changed to add_asset

        exist_stocks = wallet.get_stockDB()
        if(formatted_data['quantity'] > 0 and formatted_data['item'] not in exist_stocks): # Corrected key name
            print("add stocks_to_List")
            wallet.add_stocks_to_List(formatted_data)

        return jsonify({"message": "Stock data submitted", "doc_id": doc_id})
 

# 查詢記錄（分頁）
@app.route('/api/getRecords', methods=['GET'])
@firebase_token_required
def search_records():
    user_id = g.uid # <--- 從 g 物件獲取 uid
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
@app.route('/api/totals', methods=['GET'])
@firebase_token_required
def get_total_expense():
    user_id = g.uid # <--- 從 g 物件獲取 uid
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
@app.route('/api/record/<record_id>', methods=['PUT'])
@firebase_token_required
def update_record(record_id):
    user_id = g.uid # <--- 從 g 物件獲取 uid
    data = request.json
    data["amount"] = int(data["amount"]) # Corrected key name
    wallet.update_expense(user_id, record_id, data) # Changed to update_expense
    # wallet.db.collection(wallet.database).document(user_id).collection("expenses").document(record_id).set(data)
    return jsonify({"message": "Record updated"})
 

# 刪除記錄
@app.route('/api/record/<record_id>', methods=['DELETE'])
@firebase_token_required
def delete_record(record_id):
    user_id = g.uid # <--- 從 g 物件獲取 uid
    wallet.delete_expense(user_id, "expenses", record_id) # Changed to delete_expense
    return jsonify({"message": "Record deleted"})
 
@app.route('/api/editAsset', methods=['POST'])
@firebase_token_required
def edit_record():
    user_id = g.uid # <--- 從 g 物件獲取 uid
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
 

@app.route('/api/getDailyHistory', methods=['GET'])
@firebase_token_required
def get_daily_history():    
    user_id = g.uid # <--- 從 g 物件獲取 uid
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
 

@app.route('/api/getSummaryData', methods=['GET'])
@firebase_token_required
def get_summary_data():
    user_id = g.uid # <--- 從 g 物件獲取 uid
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
@app.route('/api/recordsByDateRange', methods=['GET'])
@firebase_token_required
def get_records():
    account = g.uid # <--- 從 g 物件獲取 uid
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
@app.route('/api/aiSuggestion', methods=['POST'])
@firebase_token_required
def ai_suggestion():
    account = g.uid # <--- 從 g 物件獲取 uid
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
 

 # 用戶基本資料可以在登入時由 /api/login (之前的) 或前端直接從 Firebase Auth 獲取
# 如果需要從後端獲取 Firestore profile，可以保留並保護它
@app.route('/api/user/profile', methods=['GET'])
@firebase_token_required
def get_user_profile():
     uid = g.uid
     user_details = wallet.get_user_details(uid)
     if user_details:
         return jsonify(user_details), 200
     else:
         # 這可能表示 Auth 成功但 Firestore Profile 未建立或找不到
         print(f"Warning: Firestore profile not found for UID {uid}")
         # 可以嘗試從 Firebase Auth 獲取 email 等資訊返回
         try:
             fb_user = auth.get_user(uid)
             return jsonify({"id": uid, "email": fb_user.email, "username": fb_user.display_name or uid, "profile_status": "missing"}), 200
         except Exception as e:
             print(f"Error getting Firebase Auth user for UID {uid}: {e}")
             return jsonify({"error": "找不到使用者資料"}), 404
# <------------------------------------------------------>


if __name__ == "__main__":
    app.run(debug=True, port=8080, host='0.0.0.0')