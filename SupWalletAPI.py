import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from datetime import datetime
import pandas as pd
from flask import Flask, request, jsonify

class SupWallet:
    def __init__(self, db_name):
        self.service_account_key = "serviceAccountKey.json"  # 替換為你的服務帳戶金鑰路徑
        self.cred = credentials.Certificate(self.service_account_key)
        if not firebase_admin._apps:  # 避免重複初始化
            firebase_admin.initialize_app(self.cred)
        self.db = firestore.client()
        self.database = db_name  # 資料庫名稱（頂層集合名稱）
        

    def add_user(self, user_id, user_data=None):
        """
        新增一個使用者到 Firestore 資料庫，並自動創建空的 assets 和 expenses 子集合。
        
        參數:
            user_id (str): 使用者的唯一 ID（如 "user123"）
        
        回傳:
            str: 新增成功的用戶 ID
            None: 如果用戶已存在則返回 None
        """
        # 檢查是否已存在該用戶
        user_ref = self.db.collection(self.database).document(user_id)
        if user_ref.get().exists:
            print(f"使用者 {user_id} 已存在，無法新增")
            return None

        # 如果未提供 user_data，使用預設資料
        if user_data is None:
            user_data = {
                "created_at": datetime.now().isoformat(),
                "name": "未命名用戶",
                "email": ""
            }
        else:
            if not isinstance(user_data, dict):
                raise ValueError("user_data 必須是字典格式")
            user_data["created_at"] = datetime.now().isoformat()

        # 新增使用者主文件
        user_ref.set(user_data)
        print(f"成功新增使用者 {user_id}")

        # 創建空的 assets 子集合（不需要初始資料）
        assets_ref = user_ref.collection("assets")
        # 可選：添加一個空白文件以確保集合存在（Firestore 需要至少一個文件來顯示集合）
        assets_ref.document("init").set({"initialized": True})

        # 創建空的 expenses 子集合
        expenses_ref = user_ref.collection("expenses")
        # 同樣添加一個空白文件
        expenses_ref.document("init").set({"initialized": True})

        return user_id
    
    def getAllUsers(self):
        """獲取所有用戶 ID"""
        users_ref = self.db.collection(self.database).stream()
        accounts = [doc.id for doc in users_ref]
        return accounts

    def upload_data_csv(self, csv_file_path, range):
        """從 CSV 文件讀取指定範圍的資料"""
        self.df = pd.read_csv(csv_file_path)  # 修正 file_path 參數名稱
        self.csv_data = self.df.iloc[:, rsnge]  # range 是索引範圍，例如 0:6
        return self.csv_data

    def getDataFromFirestore(self, user_id, collection, document):
        """從 Firestore 獲取單一文檔資料"""
        self.user_id = user_id
        self.collection = collection
        self.document = document
        ref = self.db.collection(self.database).document(user_id).collection(collection).document(document)
        data = ref.get()
        return data.to_dict() if data.exists else None  # 如果文檔不存在，返回 None

    def setDataToFirestore(self, user_id, collection, data):
        ref = self.db.collection(self.database).document(user_id).collection(collection)
        docs = ref.stream()
        existing_ids = [int(doc.id) for doc in docs if doc.id.isdigit()]
        next_id = max(existing_ids, default=0) + 1 if existing_ids else 1
        document_id = str(next_id)
        
        # 檢查是否已存在
        if ref.document(document_id).get().exists:
            print(f"文檔 {document_id} 已存在，無法上傳")
            return None
        else:
            data['id'] = document_id  # 將 ID 加入資料
            ref.document(document_id).set(data)
            print(f"已上傳資料到 {collection}/{document_id}", "data:", data)
            return document_id

    def deleteDatafromFirestore(self, user_id, collection, tar_id):
        ref = self.db.collection(self.database).document(user_id).collection(collection).document(str(tar_id))

        # 檢查文檔是否存在
        if not ref.get().exists:
            print(f"文檔 {tar_id} 不存在，無法刪除")
            return False
        else:
            print(f"已從 expenses 刪除文檔 {tar_id}", ref.get().to_dict())
            ref.delete()
            return True

    def getDataFromFireStore(self, user_id, collection, tar_id):
        """查詢 expenses 集合中指定 tar_id 的資料"""
        ref = self.db.collection(self.database).document(user_id).collection(collection).document(str(tar_id))
        doc = ref.get()
        if doc.exists:
            data = doc.to_dict()
            data['id'] = tar_id  # 可選：將 ID 加入返回資料
            print(f"找到文檔 {tar_id}: {data}")
            return data
        else:
            print(f"文檔 {tar_id} 不存在")
            return None

    def getMonthlyExpense(self, user_id, year=None, month=None):
        """計算指定用戶當月的支出總額"""
        # 如果未提供年月，預設使用當前月份
        now = datetime.now()
        year = year if year is not None else now.year
        month = month if month is not None else now.month
        
        # 格式化年月，例如 "2025/3"（與你的資料格式一致）
        current_year_month0 = f"{year}/{month}"
        current_year_month1 = datetime.now().strftime("%Y/%m")       

        # 讀取 SpendData 集合
        spend_ref = self.db.collection(self.database).document(user_id).collection("expenses")
        docs = spend_ref.stream()
        monthly_expenseList = []

        for doc in docs:
            data = doc.to_dict()
            date_str = data.get("date", "")
            amount = data.get("Amount", 0.0)
            income_or_expense = data.get("TransactionType", "")
            # 只計算支出，且日期屬於當月
            if (date_str.startswith(current_year_month0) or date_str.startswith(current_year_month1)):
                monthly_expenseList.append(data)
        return monthly_expenseList

    def insert_to_expense(self, user_id, data):
        ret = self.setDataToFirestore(user_id, "expenses", data)
        return ret

    def insert_to_assets(self, user_id, data):
        ret = self.setDataToFirestore(user_id, "assets", data)
        return data

    def delExpense(self, user_id, tar_id):
        ret = self.deleteDatafromFirestore(user_id, "expenses", tar_id)
        return ret
    def delAssets(self, user_id, tar_id):
        ret = self.deleteDatafromFirestore(user_id, "assets", tar_id)
        return ret
    def getExpense(self, user_id, tar_id):
        ret = self.getDataFromFireStore(user_id, "expenses", tar_id)
        return ret
    def getAssets(self, user_id, tar_id):
        ret = self.getDataFromFireStore(user_id, "assets", tar_id)
        return ret
    def getAssetAllData(self, user_id):
        ref = self.db.collection(self.database).document(user_id).collection("assets")
        docs = ref.stream()
        data = []
        for doc in docs:
            data.append(doc.to_dict())
        return data
    def findAsset(self, user_id, item):
        ref = self.db.collection(self.database).document(user_id).collection("assets")
        docs = ref.stream()
        for doc in docs:
            data = doc.to_dict()
            if data.get("Item") == item:
                ret_obj = {
                    "id": doc.id,
                    "data": data
                }
                return ret_obj
        return None
    def updateAsset(self, user_id, tar_id, data):
        ref = self.db.collection(self.database).document(user_id).collection("assets").document(tar_id)
        ref.update(data)
        return True
    def updateExpense(self, user_id, tar_id, data):
        ref = self.db.collection(self.database).document(user_id).collection("expenses").document(tar_id)
        print("update expense", data)
        ref.update(data)
        return True