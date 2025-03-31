from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from SupWalletAPI import SupWallet
import requests
from lxml import html
import json

import base64
import os
from google import genai
from google.genai import types

client = genai.Client(api_key= 'AIzaSyDqqI2-g6VQoGvQvxixEg6xNtjlhJh9h3I')
app = Flask(__name__)
CORS(app)  # 啟用 CORS，允許所有來源訪問

# 初始化 SupWallet
wallet = SupWallet(db_name="UserDB")

# 儲存當天的資產和開銷記錄
def save_daily_history(user_id, date=None):
    """
    儲存指定日期的資產和開銷記錄到 Firestore 的 history 集合
    Args:
        user_id: 用戶 ID
        date: 指定日期，默認為當天 (格式: YYYY-MM-DD)
    """
    # 如果未指定日期，默認為當天
    if date is None:
        date = datetime.now().strftime("%Y/%m/%d")
        date_formatted = datetime.now().strftime("%Y%m%d")

    # 定義需要統計的資產類型
    target_types = ["美債", "ETF", "金融股", "股票", "定存", "活存", "虛擬貨幣"]
    type_summary = {type_name: 0 for type_name in target_types}  # 初始化各類型總和為 0
    
    # 獲取資產數據
    assets = wallet.getAssetAllData(user_id)
    total_assets = 0
    asset_summary = {}
    for asset in assets:
        current_value = asset.get("CurrentValue", 0) or 0
        asset_type = asset.get("Type", "未知")
        item = asset.get("Item", "未知項目")
        total_assets += current_value
        asset_summary[item] = asset_summary.get(item, 0) + current_value
        # 如果資產類型在目標列表中，累加到對應類型的總和
        if asset_type in target_types:
            type_summary[asset_type] += current_value
        
    # 獲取當天開銷記錄
    expenses = wallet.getMonthlyExpense(user_id)
    daily_expenses = []
    total_income = 0
    total_expense = 0
    
    # 過濾出當天的記錄
    for exp in expenses:
        exp_date = exp.get("date", "")
        if exp_date.startswith(date):  # 假設日期格式為 YYYY-MM-DD
            amount = exp.get("Amount", 0)
            transaction_type = exp.get("TransactionType", "")
            daily_expenses.append({
                "id": exp.get("id", ""),
                "Item": exp.get("Item", ""),
                "Amount": amount,
                "TransactionType": transaction_type,
                "Category": exp.get("Category", "")
            })
            if transaction_type == "收入":
                total_income += amount
            else:
                total_expense += amount

    # 構建歷史記錄數據
    history_data = {
        "date": date,
        "totalAssets": total_assets,
        "typeSummary": type_summary,
        "assetSummary": asset_summary,
        "totalIncome": total_income,
        "totalExpense": total_expense,
        "expenses": daily_expenses,
        "timestamp": datetime.now().isoformat()  # 添加時間戳記
    }
    print("history_data", history_data)
    # 儲存到 Firestore
    try:
        wallet.db.collection(wallet.database).document(user_id).collection("history").document(date_formatted).set(history_data)
        print(f"已儲存 {user_id} 的 {date} 歷史記錄")
    except Exception as e:
        print(f"儲存 {user_id} 的 {date} 歷史記錄失敗: {str(e)}")

    return history_data

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


@app.route('/')
def say_hello():
    return "Hello SupWallet"

# 獲取帳戶列表
@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    # 這裡假設有一個方法可以從 Firestore 獲取所有用戶 ID
    users = wallet.getAllUsers()
    return jsonify(users)

# 獲取首頁資產資料
@app.route('/api/home/<user_id>', methods=['GET'])
def get_home_page_data(user_id):
    assets = wallet.getAssetAllData(user_id)
    # print(assets)
    total_current_value = 0
    for asset in assets:
        if(asset['CurrentValue'] != None):
            total_current_value += asset['CurrentValue']
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
        # print("asset", asset)
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
    # print("expenses_ref", expenses_ref)
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
    # print(f"Page: {page}, Limit: {limit}, Total Records: {len(expenses)}, Returned: {len(records)}")
    # print("Records:", records)

    # 返回 JSON 響應
    return jsonify({"records": records, "hasMore": has_more})

# 獲取當月總收入與支出
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
        "InitialAmount": amount,
        "CurrentValue": amount
    }
    wallet.updateAsset(user_id, edit_id, edit_asset_data)
    return jsonify({"message": "Record deleted"})

# 新增 API 端點：手動觸發儲存當天數據（用於測試）
@app.route('/api/saveDailyHistory/<user_id>', methods=['GET'])
def save_daily_history_api(user_id):
    data = save_daily_history(user_id)
    return jsonify({"message": "Daily history saved", "data": data})

@app.route('/api/getDailyHistory/<user_id>', methods=['GET'])
def get_daily_history(user_id):
    date = datetime.now().strftime("%Y%m%d")  # 當天日期，例如 20250317
    try:
        doc_ref = wallet.db.collection(wallet.database).document(user_id).collection("history").document(date)
        doc = doc_ref.get()
        if doc.exists:
            return jsonify(doc.to_dict())
        else:
            return jsonify({"message": "當天無歷史記錄", "data": {}}), 404
    except Exception as e:
        print(f"查詢 {user_id} 的 {date} 歷史記錄失敗: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/getSummaryDate/<user_id>', methods=['GET'])
def get_summary_data(user_id):
    # date = datetime.now().strftime("%Y%m%d")  # 當天日期，例如 20250317
    strDate = datetime.now().strftime("%Y/%m/%d")
    try:
        data = wallet.getSummaryData(user_id, strDate)
        return data
        
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
        records = wallet.getExpensebyRange(
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
            return jsonify({"suggestion": "AI助手還在睡覺喔!"}), 200
        else:
            # 將 JSON 數據轉換為提示文字
            prompt = f"你好，我是 {account}，這是我的開銷情況："
            if data:
                prompt += "詳細記錄："
                for record in data:
                    amount = record.get('Amount', 0)
                    category = record.get('Category', '其他')
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
    app.run(debug=True)