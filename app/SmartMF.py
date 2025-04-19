import firebase_admin
from firebase_admin import credentials, firestore, auth
from datetime import datetime, timedelta
import pandas as pd
from typing import Dict, List, Optional, Union, Any
import requests
from lxml import html

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

class Expense:
    """Represents an expense record."""


    def __init__(
        self,
        date: str = None,
        item: str = None,
        amount: float = None,
        payment_method: str = None,
        category: str = None,
        transaction_type: str = "支出",
        merchant: str = None,
        notes: str = None,
        invoice_number: str = None,
    ):
        """
        Initializes an Expense object.


        Args:
            date: The expense date (YYYY/MM/DD).
            item: The expense item description.
            amount: The expense amount.
            payment_method: The payment method.
            category: The expense category.
            transaction_type: The transaction type (default: "支出").
            merchant: The merchant name (optional).
            notes: Additional notes (optional).
            invoice_number: The invoice number (optional).
        """
        self.date = date
        self.item = item
        self.amount = amount
        self.payment_method = payment_method
        self.category = category
        self.transaction_type = transaction_type
        self.merchant = merchant
        self.notes = notes
        self.invoice_number = invoice_number


    def to_dict(self) -> Dict[str, Any]:
        """Converts the Expense object to a dictionary.


        Returns:
            A dictionary representation of the expense.
        """
        expense_dict = {
            "date": self.date,
            "item": self.item,
            "amount": self.amount,
            "payment_method": self.payment_method,
            "category": self.category,
            "transactionType": self.transaction_type,
        }


        # Add optional fields if they exist
        if self.merchant:
            expense_dict["merchant"] = self.merchant
        if self.notes:
            expense_dict["notes"] = self.notes
        if self.invoice_number:
            expense_dict["invoice_number"] = self.invoice_number


        return expense_dict
 

    def __str__(self) -> str:
        return f"Expense: {self.to_dict()}"
    

 

class Asset:
    """Represents an asset record."""


    def __init__(
        self,
        item: str = None,
        current_value: int = None,
        asset_type: str = None,
        acquisition_date: str = None,
        acquisition_value: int = None,
        quantity: int = 0,
        notes: str = None,
    ):
        """
        Initializes an Asset object.


        Args:
            item: The asset name.
            current_value: The current value of the asset.
            asset_type: The type of asset.
            acquisition_date: The acquisition date.
            acquisition_value: The acquisition value.
            notes: Additional notes.
        """
        self.item = item
        self.current_value = current_value
        self.asset_type = asset_type
        self.acquisition_date = acquisition_date
        self.acquisition_value = acquisition_value
        self.quantity = quantity
        self.notes = notes


    def to_dict(self) -> Dict[str, Any]:
        """Converts the Asset object to a dictionary.


        Returns:
            A dictionary representation of the asset.
        """
        asset_dict = {
            "item": self.item,
            "currentValue": self.current_value,
            "type": self.asset_type,
            "quantity": self.quantity,
        }


        # Add optional fields
        if self.acquisition_date:
            asset_dict["acquisitionDate"] = self.acquisition_date
        if self.acquisition_value is not None:  # Explicitly check for None
            asset_dict["acquisitionValue"] = self.acquisition_value
        if self.notes:
            asset_dict["notes"] = self.notes


        return asset_dict


    def __str__(self) -> str:
        return f"Asset: {self.to_dict()}"
 

 

class FirestoreClient:
    """A client for interacting with Firestore."""


    def __init__(self, service_account_key: str = "serviceAccountKey.json"):
        """
        Initializes the FirestoreClient.


        Args:
            service_account_key: Path to the service account key JSON file.
        """
        self.service_account_key = service_account_key
        self.cred = credentials.Certificate(self.service_account_key)
        # Avoid duplicate initialization
        if not firebase_admin._apps:
            firebase_admin.initialize_app(self.cred)


        self.db = firestore.client()


    def get_document_reference(self, collection_path: str, document_id: str) -> firestore.DocumentReference:
        """Helper function to get a DocumentReference."""
        return self.db.collection(collection_path).document(document_id)


    def get_document(self, collection_path: str, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a document from Firestore.


        Args:
            collection_path: The path to the collection.
            document_id: The ID of the document to retrieve.


        Returns:
            The document data as a dictionary, or None if the document does not exist.
        """
        try:
            doc_ref = self.get_document_reference(collection_path, document_id)
            doc = doc_ref.get()


            if doc.exists:
                data = doc.to_dict()
                data['id'] = doc.id  # Add the document ID to the data
                return data
            else:
                print(f"Document '{document_id}' not found in '{collection_path}'")
                return None
        except Exception as e:
            print(f"Error getting document '{document_id}' from '{collection_path}': {e}")
            return None


    def add_document(self, collection_path: str, data: Dict[str, Any], document_id: Optional[str] = None) -> Optional[str]:
        """
        Adds a new document to Firestore.


        Args:
            collection_path: The path to the collection.
            data: The document data as a dictionary.
            document_id: (Optional) The ID of the document. If None, Firestore will auto-generate an ID.


        Returns:
            The ID of the newly added document, or None on failure.
        """
        try:
            collection_ref = self.db.collection(collection_path)


            if document_id:
                # Check if the document already exists
                if collection_ref.document(document_id).get().exists:
                    print(f"Document '{document_id}' already exists in '{collection_path}'")
                    return None


                collection_ref.document(document_id).set(data)
                return document_id
            else:
                collection_ref.document(document_id).set(data)
                return document_id
        except Exception as e:
            print(f"Error adding document to '{collection_path}': {e}")
            return None


    def update_document(self, collection_path: str, document_id: str, data: Dict[str, Any]) -> bool:
        """
        Updates an existing document in Firestore.


        Args:
            collection_path: The path to the collection.
            document_id: The ID of the document to update.
            data: The data to update the document with (as a dictionary).


        Returns:
            True if the update was successful, False otherwise.
        """
        try:
            doc_ref = self.get_document_reference(collection_path, document_id)


            if not doc_ref.get().exists:
                print(f"Document '{document_id}' does not exist in '{collection_path}', cannot update.")
                return False


            doc_ref.update(data)
            return True
        except Exception as e:
            print(f"Error updating document '{document_id}' in '{collection_path}': {e}")
            return False


    def delete_document(self, collection_path: str, document_id: str) -> bool:
        """
        Deletes a document from Firestore.


        Args:
            collection_path: The path to the collection.
            document_id: The ID of the document to delete.


        Returns:
            True if the deletion was successful, False otherwise.
        """
        try:
            doc_ref = self.get_document_reference(collection_path, document_id)


            if not doc_ref.get().exists:
                print(f"Document '{document_id}' does not exist in '{collection_path}', cannot delete.")
                return False


            doc_ref.delete()
            return True
        except Exception as e:
            print(f"Error deleting document '{document_id}' from '{collection_path}': {e}")
            return False


    def get_collection(self, collection_path: str) -> List[Dict[str, Any]]:
        """
        Retrieves all documents from a collection in Firestore.


        Args:
            collection_path: The path to the collection.


        Returns:
            A list of dictionaries, where each dictionary represents a document.
        """
        document_snapshots = []
        try:
            docs = self.db.collection(collection_path).stream()
            for doc in docs:
                document_snapshots.append(doc)
            return document_snapshots
        except Exception as e:
            print(f"Error getting collection data from '{collection_path}': {e}")
            return document_snapshots # Return an empty list in case of an error


    

class SmartMF:
    """A class for managing expenses and assets."""

    def __init__(self, service_account_key: str = "serviceAccountKey.json"):
        """
        Initializes the SmartMF class.
        """
        self.firestore_client = FirestoreClient(service_account_key)
        self.optionType = {
        "transactionType": {
            "transactions": [
                "食",
                "衣",
                "住",
                "行",
                "娛樂",
                "醫療",
                "教育",
                "保險",
            ]
        },
        "assetType": {
            "assets": {
                "current_assets": ["活期存款", "定期存款", "現金", "虛擬貨幣"],
                "fixed_assets": ["債券", "金融股", "股票", "市值ETF", "高股息ETF"],
            },
            "liabilities": [
                "信用卡",
                "借貸",
            ],
        },
    }
        
    def download_collection_to_csv(self, collection_path: str, output_filename: Optional[str] = None) -> str:
        """
        Downloads a Firestore collection to a CSV file.


        Args:
            collection_path: The path to the collection.
            output_filename: (Optional) The name of the output CSV file.


        Returns:
            str: The path to the downloaded CSV file.
        """
        try:
            docs = self.firestore_client.get_collection(collection_path)
            if not docs:
                return f"No documents found in '{collection_path}'"


            # Create a DataFrame from the documents
            df = pd.DataFrame(docs)


            # Save to CSV
            if output_filename is None:
                output_filename = f"{collection_path.replace('/', '_')}.csv"


            df.to_csv(output_filename, index=False, encoding='utf-8-sig')
            return f"Collection '{collection_path}' downloaded to '{output_filename}'"
        except Exception as e:
            return f"Error downloading collection '{collection_path}': {e}"

    def upload_csv_to_collection(self, csv_file_path: str, collection_path: str, collection_name: str) -> str:
        """
        Uploads a CSV file to a Firestore collection.


        Args:
            csv_file_path: The path to the CSV file.
            collection_path: The path to the Firestore collection.


        Returns:
            str: A message indicating success or failure.
        """
        try:
            df = pd.read_csv(csv_file_path)


            for _, row in df.iterrows():
                data = row.to_dict()
                if collection_name == "expenses":
                    upload_data = {
                        "amount" : data.get("Amount"),
                        "category" : data.get("Category"),
                        "date" : data.get("date"),
                        "invoice_number": data.get("invoice_number", ""),
                        "item" : data.get("Item"),
                        "merchant": data.get("merchant", ""),
                        "notes": data.get("notes", ""),
                        "payment_method": data.get("payment_method", ""),
                        "transactionType": data.get("TransactionType", "支出"),
                        "id" : data.get("id", ""),
                    }
                elif collection_name == "assets":
                    upload_data = {
                        "acquisition_date" : data.get("date"),
                        "acquisition_value" : data.get("InitialAmount"),
                        "asset_type" : data.get("Type"),
                        "current_amount" : data.get("CurrentValue"),
                        "item": data.get("Item", ""),
                        "notes": data.get("notes", ""),
                        "quantity" : data.get("Quantity", -1),
                        "current_price" : data.get("CurrentPrice", -1),
                        "id" : data.get("id", ""),
                    }
                    if upload_data['category'] == '活存':
                        upload_data['category'] = '活期存款'
                    elif upload_data['category'] == '定存':
                        upload_data['category'] = '定期存款'

                self.firestore_client.add_document(collection_path, upload_data, str(data.get("id")))
                print(f"{data.get('id')}: {upload_data}")


            return f"CSV file '{csv_file_path}' uploaded to '{collection_path}'"
        except Exception as e:
            return f"Error uploading CSV file '{csv_file_path}': {e}"
        
    def _get_users_collection_path(self) -> str:
        """Returns the path to the users collection."""
        return "UserDB"


    def _get_expense_collection_path(self, user_id: str) -> str:
        """Returns the path to the expenses subcollection for a given user."""
        return f"UserDB/{user_id}/expenses"


    def _get_assets_collection_path(self, user_id: str) -> str:
        """Returns the path to the assets subcollection for a given user."""
        return f"UserDB/{user_id}/assets"


    def _get_options_collection_path(self, user_id: str) -> str:
        """Returns the path to the options subcollection for a given user."""
        return f"UserDB/{user_id}/options"


    def _get_relation_collection_path(self, user_id: str) -> str:
        """Returns the path to the relationship subcollection for a given user."""
        return f"UserDB/{user_id}/relationship"
    
    def _get_stock_collection_path(self):
        """Returns the path to the stock collection."""
        return "StockDB"

    def add_user_profile(self, uid: str, email: str, username: Optional[str] = None, user_data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Creates a user profile document in Firestore after successful Firebase Auth registration.
        The document ID will be the Firebase Auth UID.

        Args:
            uid: The Firebase Auth User ID.
            email: The user's email.
            username: The user's chosen display name (can be same as uid initially if not provided).
            user_data: Optional additional user data.
        Returns:
            True if the profile document was created or already exists, False otherwise.
        """
        collection_path = self._get_users_collection_path()
        user_ref = self.firestore_client.get_document_reference(collection_path, uid) # 使用 uid 作為文件 ID

        if user_ref.get().exists:
            print(f"User profile for UID '{uid}' already exists in Firestore.")
            # 可以選擇在這裡更新資料，或者直接返回 True
            # 例如: self.firestore_client.update_document(collection_path, uid, {"last_seen": datetime.now().isoformat()})
            return True # 或者根據需求決定是否算成功

        # 準備要儲存到 Firestore 的基本資料 (不再儲存密碼 hash)
        profile_data = {
            # 如果沒有提供 username，可以用 email 前綴或 uid 作為預設值
            "username": username if username else uid,
            "email": email,
            "created_at": datetime.now().isoformat(),
            "access": 0, # 預設權限
            # 可以加入其他預設欄位，例如空的設定檔連結、頭像 URL 等
        }

        if isinstance(user_data, dict):
            profile_data.update(user_data)

        # 在 Firestore 中建立文件，使用 uid 作為 ID
        added_id = self.firestore_client.add_document(collection_path, profile_data, uid)

        if added_id == uid:
            # 為新用戶建立必要的子集合
            try:
                self.firestore_client.add_document(self._get_options_collection_path(uid), self.optionType, "options")
                self.firestore_client.add_document(self._get_relation_collection_path(uid), {}, "relationship")
                print(f"Successfully created Firestore profile for user UID '{uid}'")
                return True
            except Exception as e:
                print(f"Warning: Failed to create subcollections for user {uid}: {e}")
                # 主 profile 文件已建立，可能仍算成功
                return True
        else:
            print(f"Failed to create Firestore profile for user UID '{uid}'")
            return False
        
    # def add_user(self, user_id: str, user_data: Optional[Dict[str, Any]] = None) -> Optional[str]:
    #     """
    #     Adds a new user to Firestore.


    #     Args:
    #         user_id: The unique ID of the user.
    #         user_data: (Optional) A dictionary containing user data.


    #     Returns:
    #         The ID of the newly added user, or None if the user already exists.
    #     """
    #     collection_path = self._get_users_collection_path()
    #     user_ref = self.firestore_client.get_document_reference(collection_path, user_id)


    #     if user_ref.get().exists:
    #         print(f"User '{user_id}' already exists, cannot add.")
    #         self.firestore_client.add_document(self._get_options_collection_path(user_id), self.optionType, "options")
    #         return None


    #     if user_data is None:
    #         user_data = {
    #             "created_at": datetime.now().isoformat(),
    #             "email": "",
    #             "username": user_id,
    #             "password": "",
    #             "access": 0,
    #         }
    #     else:
    #         if not isinstance(user_data, dict):
    #             raise ValueError("user_data must be a dictionary")
    #         user_data["created_at"] = datetime.now().isoformat()

        
    #     self.firestore_client.add_document(collection_path, user_data, user_id)
    #     self.firestore_client.add_document(self._get_options_collection_path(user_id), self.optionType, "options")
    #     self.firestore_client.add_document(self._get_relation_collection_path(user_id), {}, "relationship")
    #     print(f"Successfully added user '{user_id}'")
    #     return user_id

    def get_user_details(self, uid: str) -> Optional[Dict[str, Any]]:
         """Retrieves user details from Firestore using Firebase UID."""
         collection_path = self._get_users_collection_path()
         user_data = self.firestore_client.get_document(collection_path, uid) # 使用 uid 查詢
         # user_data 字典裡原本就沒有 password_hash 了
         return user_data
    def get_all_user_profiles_uids(self) -> List[str]:
         uids = []
         collection_path = self._get_users_collection_path()
         docs = self.firestore_client.get_collection(collection_path)
         uids = [doc.id for doc in docs if doc.id is not None]
         return uids
    
    def get_all_users(self) -> List[str]:
        """
        Retrieves all user IDs.


        Returns:
            A list of user IDs.
        """
        users = []
        collection_path = self._get_users_collection_path()
        docs = self.firestore_client.get_collection(collection_path)
        users = [doc.id for doc in docs if doc.id is not None]  # Extract user IDs from document references
        # users = [doc.id for doc in users if doc.id is not None]  # Extract user IDs from document references
        return users  # Assuming username is the user_id
        


    def upload_data_csv(self, csv_file_path: str, columns_range: slice) -> pd.DataFrame:
        """
        Reads data from a CSV file within a specified column range.


        Args:
            csv_file_path: The path to the CSV file.
            columns_range: A slice object defining the column range to read.


        Returns:
            A pandas DataFrame containing the selected data.
        """
        try:
            df = pd.read_csv(csv_file_path)
            return df.iloc[:, columns_range]
        except FileNotFoundError:
            print(f"Error: CSV file not found at '{csv_file_path}'")
            return pd.DataFrame()  # Return an empty DataFrame on error
        except Exception as e:
            print(f"Error reading CSV file: {e}")
            return pd.DataFrame()


    def get_data(self, user_id: str, collection_path: str, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves data for a single document.


        Args:
            user_id: The ID of the user.
            collection_path: The name of the subcollection.
            document_id: The ID of the document to retrieve.


        Returns:
            A dictionary containing the document data, or None if the document is not found.
        """
        return self.firestore_client.get_document(collection_path, document_id)


    def set_data(self, user_id: str, collection_path: str, data: Dict[str, Any]) -> Optional[str]:
        """
        Sets data for a document, either creating a new one or overwriting an existing one.


        Args:
            user_id: The ID of the user.
            collection_path: The name of the subcollection ("expenses" or "assets").
            data: A dictionary containing the data to set.


        Returns:
            The ID of the document, or None if the operation fails.
        """
        return self.firestore_client.add_document(collection_path, data)  # Let Firestore handle ID generation


    def update_data(self, user_id: str, collection_path: str, document_id: str, data: Dict[str, Any]) -> bool:
        """
        Updates data for an existing document.


        Args:
            user_id: The ID of the user.
            collection_path: The name of the subcollection ("expenses" or "assets").
            document_id: The ID of the document to update.
            data: A dictionary containing the data to update.


        Returns:
            True if the update was successful, False otherwise.
        """
        return self.firestore_client.update_document(collection_path, document_id, data)


    def delete_data(self, user_id: str, collection_path: str, document_id: str) -> bool:
        """
        Deletes a document.


        Args:
            user_id: The ID of the user.
            collection_path: The name of the subcollection ("expenses" or "assets").
            document_id: The ID of the document to delete.


        Returns:
            True if the deletion was successful, False otherwise.
        """
        return self.firestore_client.delete_document(collection_path, document_id)


    def get_collection_data(self, user_id: str, collection_path: str) -> List[Dict[str, Any]]:
        """
        Retrieves all data from a subcollection.


        Args:
            user_id: The ID of the user.
            collection_path: The path of the collection


        Returns:
            A list of dictionaries, where each dictionary represents a document.
        """
        return self.firestore_client.get_collection(collection_path)


    def get_expenses_by_date_range(
        self,
        user_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        year: Optional[int] = None,
        month: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves expense records within a specified date range, optionally filtering by year and month.


        Args:
            user_id: The ID of the user.
            start_date: (Optional) The start date (YYYY/MM/DD).
            end_date: (Optional) The end date (YYYY/MM/DD).
            year: (Optional) The year to filter by.
            month: (Optional) The month to filter by.


        Returns:
            A list of expense records (dictionaries).
        """
        collection_path = self._get_expense_collection_path(user_id)
        return self._get_records_by_date_range(collection_path, user_id, start_date, end_date, year, month)

    def get_options(self, user_id: str) -> Dict[str, Any]:
        """
        Retrieves options for a user.


        Args:
            user_id: The ID of the user.


        Returns:
            A dictionary containing the user's options.
        """
        collection_path = self._get_options_collection_path(user_id)
        ret = { 
            "transactionsType" : self.firestore_client.get_document(collection_path, "options").get("transactionType"),
            "assetType" : self.firestore_client.get_document(collection_path, "options").get("assetType"),
        }
        return ret
    
    def get_monthly_expenses(
        self,
        user_id: str,
        year: Optional[int] = None,
        month: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves expense records for a specific month.


        Args:
            user_id: The ID of the user.
            year: (Optional) The year to filter by.
            month: (Optional) The month to filter by.


        Returns:
            A list of expense records (dictionaries).
        """
        now = datetime.now()
        year = year if year is not None else now.year
        month = month if month is not None else now.month
        collection_path = self._get_expense_collection_path(user_id)
        return self._get_records_by_date_range(collection_path, user_id, year=year, month=month)


    def _get_records_by_date_range(
        self,
        collection_path: str,
        user_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        year: Optional[int] = None,
        month: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Helper function to retrieve records (expenses or assets) within a date range.


        Args:
            collection_path: The path to the collection (expenses or assets).
            user_id: The ID of the user.
            start_date: (Optional) The start date (YYYY/MM/DD).
            end_date: (Optional) The end date (YYYY/MM/DD).
            year: (Optional) The year to filter by.
            month: (Optional) The month to filter by.


        Returns:
            A list of records (dictionaries).
        """
        records = self.firestore_client.get_collection(collection_path)
        recordsList = [doc.to_dict() for doc in records]
        filtered_records = []
        try:
            if start_date and end_date:
                start_date_obj = datetime.strptime(start_date, "%Y/%m/%d").date()
                end_date_obj = datetime.strptime(end_date, "%Y/%m/%d").date()


                filtered_records = [
                    record
                    for record in recordsList
                    if "date" in record
                    and start_date_obj <= datetime.strptime(record["date"], "%Y/%m/%d").date() <= end_date_obj
                ]
            elif year and month:
                filtered_records = [
                    record
                    for record in recordsList
                    if "date" in record
                    and datetime.strptime(record["date"], "%Y/%m/%d").year == year
                    and datetime.strptime(record["date"], "%Y/%m/%d").month == month
                ]
            else:
                filtered_records = records
        except ValueError as e:
            print(f"ValueError: Invalid date format: {e}")
            return []  # Or raise an exception if appropriate
        return filtered_records


    def find_asset_by_name(self, user_id: str, item_name: str) -> Optional[Dict[str, Any]]:
        """
        Finds an asset record by its name.


        Args:
            user_id: The ID of the user.
            item_name: The name of the asset to find.


        Returns:
            A dictionary containing the asset record, or None if not found.
        """
        collection_path = self._get_assets_collection_path(user_id)
        assets = self.firestore_client.get_collection(collection_path)
        assetsList = [doc.to_dict() for doc in assets]

        for asset in assetsList:
            if "item" in asset and asset["item"] == item_name:
                return {"id": asset.get("id"), "data": asset}
        return None


    def get_summary_data(self, user_id: str, date_str: str) -> Dict[str, Any]:
        """
        Retrieves summary data for a given date.


        Args:
            user_id: The ID of the user.
            date_str: The date (YYYY/MM/DD).


        Returns:
            A dictionary containing summary data.
        """
        ret = {}
        docs = self.firestore_client.get_collection(self._get_options_collection_path(user_id))
        options = [doc.to_dict() for doc in docs]
        options = options[0]
        # expense_opt = options['transactionType']
        # asset_opt = options['assetType']['assets']['current_assets'] + \
        #             options['assetType']['assets']['fixed_assets']
        # liabilities_opt = options['assetType']['liabilities']
        
        try:
            expense_types = options['transactionType']
            asset_types =   options['assetType']['assets']['current_assets'] + \
                            options['assetType']['assets']['fixed_assets'] + \
                            ['美債', 'ETF', '股票', '定存', '活存', '虛擬貨幣']
            liabilities_types = options['assetType']['liabilities']
        except AttributeError:
            expense_types = []
            asset_types = []
            liabilities_types = []
        # Initialize distribution dictionaries
        expense_distribution = {expense_type: 0 for expense_type in expense_types}
        asset_distribution = {asset_type: 0 for asset_type in asset_types}
        liabilities_distribution = {liabilities_type: 0 for liabilities_type in liabilities_types}


        # Get daily expenses
        collection_path = self._get_expense_collection_path(user_id)
        daily_expenses = []
        total_cost = 0
        total_income = 0

        expenseList = self.get_monthly_expenses(user_id=user_id, 
                                                year = datetime.today().year,
                                                month = datetime.today().month)
        
        for expense in expenseList:
            if "date" in expense and expense["date"] == date_str:
                daily_expenses.append(expense)
                if expense.get("transactionType") == "支出":
                    total_cost += expense.get("amount", 0)
                else:
                    total_income += expense.get("amount", 0)
        

        for expense in expenseList:
            category = expense.get("category")
            amount = expense.get("amount", 0)
            if category in expense_types and expense.get("transactionType") == "支出":
                expense_distribution[category] += amount


        # Get asset data
        asset_collection_path = self._get_assets_collection_path(user_id)
        assetsList = self.get_all_assets(user_id=user_id)
        total_asset_amount = 0
        total_liabilities_amount = 0


        for asset in assetsList:
            asset_type = asset.get("asset_type")
            current_amount = asset.get("current_amount", 0)
            if asset_type in asset_types:
                asset_distribution[asset_type] += current_amount
                total_asset_amount += current_amount
            if asset_type in liabilities_types:
                liabilities_distribution[asset_type] += current_amount
                total_liabilities_amount += current_amount


        ret =  {
            "expense_distribution": expense_distribution,
            "asset_distribution": asset_distribution,
            "liabilities_distribution": liabilities_distribution,
            "monthly_expenses": expenseList,
            "expenses": daily_expenses,
            "assets": assetsList,
            "total_asset_amount": total_asset_amount,
            "total_liabilities_amount": total_liabilities_amount,
            "total_cost": total_cost,
            "total_income": total_income,
        }

        return ret
    # Convenience methods for expenses and assets


    def add_expense(self, user_id: str, expense: Union[Expense, Dict[str, Any]]) -> Optional[str]:
        """
        Adds an expense record.


        Args:
            user_id: The ID of the user.
            expense: An Expense object or a dictionary representing an expense.


        Returns:
            The ID of the newly added expense record, or None on failure.
        """
        collection_path = self._get_expense_collection_path(user_id)
        docs = self.firestore_client.get_collection(collection_path)
        existing_ids = [int(doc.to_dict()['id']) for doc in docs]
        next_id = max(existing_ids, default=0) + 1 if existing_ids else 1
        if isinstance(expense, Expense):
            expense_data = expense.to_dict()
        else:
            expense_data = expense

        expense_data["id"] = next_id  # Add the ID to the expense data
        return self.firestore_client.add_document(
            self._get_expense_collection_path(user_id), 
            expense_data,
            str(next_id)
        )


    def update_expense(
        self,
        user_id: str,
        expense_id: str,
        data: Dict[str, Any],
    ) -> bool:
        """
        Updates an expense record.


        Args:
            user_id: The ID of the user.
            expense_id: The ID of the expense record to update.
            data: A dictionary containing the data to update.


        Returns:
            True if the update was successful, False otherwise.
        """
        return self.firestore_client.update_document(
            self._get_expense_collection_path(user_id), str(expense_id), data
        )


    def delete_expense(self, user_id: str, expense_id: str) -> bool:
        """
        Deletes an expense record.


        Args:
            user_id: The ID of the user.
            expense_id: The ID of the expense record to delete.


        Returns:
            True if the deletion was successful, False otherwise.
        """
        return self.firestore_client.delete_document(
            self._get_expense_collection_path(user_id), expense_id
        )


    def get_expense(self, user_id: str, expense_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves an expense record.


        Args:
            user_id: The ID of the user.
            expense_id: The ID of the expense record to retrieve.


        Returns:
            A dictionary containing the expense record, or None if not found.
        """
        return self.firestore_client.get_document(
            self._get_expense_collection_path(user_id), expense_id
        )


    def add_asset(self, user_id: str, asset: Union[Asset, Dict[str, Any]]) -> Optional[str]:
        """
        Adds an asset record.


        Args:
            user_id: The ID of the user.
            asset: an Asset object or a dictionary representing an asset.


        Returns:
            The ID of the newly added asset record, or None on failure.
        """
        collection_path = self._get_assets_collection_path(user_id)
        docs = self.firestore_client.get_collection(collection_path)
        existing_ids = [int(doc.to_dict()['id']) for doc in docs]
        next_id = max(existing_ids, default=0) + 1 if existing_ids else 1

        if isinstance(asset, Asset):
            asset_data = asset.to_dict()
        else:
            asset_data = asset

        asset_data["id"] = next_id  # Add the ID to the asset data
        return self.firestore_client.add_document(
            self._get_assets_collection_path(user_id), 
            asset_data,
            document_id= str(next_id)
        )

    def add_stocks_to_List(self, stock: Union[Asset, Dict[str, Any]]) -> Optional[str]:
        print(f"Adding asset: {stock.get('item')}")
        self.firestore_client.add_document(
            self._get_stock_collection_path(), 
            {
                "item": stock.get("item"),
                "current_price": get_current_price(stock.get("item")),
            },
            str(stock.get("item"))
        )
        # Check if the asset already exists in the collection
        asset_ref = self.firestore_client.get_document_reference(self._get_stock_collection_path(), str(stock.get("item")))

    def get_stockDB(self) -> List[Dict[str, Any]]:
        """
        Retrieves all asset records for a user.


        Args:
            user_id: The ID of the user.


        Returns:
            A list of dictionaries, where each dictionary represents an asset.
        """
        collection_docs = self.firestore_client.get_collection(self._get_stock_collection_path())
        assets_list = [doc.to_dict() for doc in collection_docs]

        return assets_list
    
    def update_asset(
        self,
        user_id: str,
        asset_id: str,
        asset_data: Union[Asset, Dict[str, Any]],
    ) -> bool:
        """
        Updates an asset record.


        Args:
            user_id: The ID of the user.
            asset_id: The ID of the asset record to update.
            data: A dictionary containing the data to update.


        Returns:
            True if the update was successful, False otherwise.
        """
        if isinstance(asset_data, Asset):
            asset_data = asset_data.to_dict()
        else:
            asset_data = asset_data

        return self.firestore_client.update_document(
            self._get_assets_collection_path(user_id), asset_id, asset_data
        )


    def delete_asset(self, user_id: str, asset_id: str) -> bool:
        """
        Deletes an asset record.


        Args:
            user_id: The ID of the user.
            asset_id: The ID of the asset record to delete.


        Returns:
            True if the deletion was successful, False otherwise.
        """
        return self.firestore_client.delete_document(
            self._get_assets_collection_path(user_id), asset_id
        )


    def get_asset(self, user_id: str, asset_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves an asset record.


        Args:
            user_id: The ID of the user.
            asset_id: The ID of the asset record to retrieve.


        Returns:
            A dictionary containing the asset record, or None if not found.
        """
        return self.firestore_client.get_document(
            self._get_assets_collection_path(user_id), asset_id
        )


    def get_all_assets(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Retrieves all asset records for a user.


        Args:
            user_id: The ID of the user.


        Returns:
            A list of dictionaries, where each dictionary represents an asset.
        """
        collection_docs = self.get_collection_data(
            user_id, self._get_assets_collection_path(user_id=user_id)
        )
        assets_list = [doc.to_dict() for doc in collection_docs]

        return assets_list
        
    def updateStockDB(self) -> bool:
        exist_stocks = self.get_stockDB()
        for stock in exist_stocks:
            current_price = get_current_price(stock.get("item"))
            self.firestore_client.update_document(
                self._get_stock_collection_path(), str(stock.get("item")), {"current_price": current_price}
            )
            print(f"Updated {stock.get('item')} price to {current_price}")


    def updateStockPrice(self, user_id: str) -> bool:
        
        ref = self.firestore_client.get_collection(self._get_assets_collection_path(user_id))
        assetsList = [doc.to_dict() for doc in ref if doc.to_dict()['quantity'] >= 0]

        stockDB_List = self.get_stockDB()
        stocks_List = [stock.get('item') for stock in stockDB_List if stock.get("item") is not None]
        
        for doc in assetsList:
            # Check if the item is in the stock collection
            if(doc.get("item") in stocks_List):
                # update the current price
                currentPrice = stockDB_List[stocks_List.index(doc.get("item"))].get("current_price")
                print("update", {doc.get("item")} ,"current price:", currentPrice) 
                currentAmount = currentPrice * doc["quantity"]
                if currentPrice is not None:
                    doc_ref = self.firestore_client.get_document_reference(self._get_assets_collection_path(user_id), str(doc.get("id")))
                    update_data = {
                        "current_price": currentPrice,
                        "current_amount": currentAmount
                    }
                    doc_ref.update(update_data)
                    print(f"Updated {doc.get('item')} price to {currentPrice}")
                else:
                    print(f"Failed to update {doc.get('item')} price")
                
