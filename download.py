import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import csv
from datetime import datetime
import io

def export_firestore_collection_to_csv(collection_name, output_filename=None, service_account_key_path="serviceAccountKey.json"):
    """
    將指定的 Firestore collection 的所有 document 資料匯出到本地 CSV 檔案。

    Args:
        collection_name (str): 要匯出的 Firestore collection 名稱。
        output_filename (str, optional): 匯出的 CSV 檔案名稱。如果為 None，
                                         則使用預設格式 "collection名稱_YYYYMMDD_HHMMSS.csv"。
        service_account_key_path (str, optional): Firebase 服務帳戶金鑰 JSON 檔案的路徑。
                                                    預設為 "serviceAccountKey.json"。

    Returns:
        str: 匯出的 CSV 檔案的完整路徑。
             如果沒有資料或初始化失敗，則返回相應的錯誤訊息。
    """
    try:
        # 初始化 Firebase Admin SDK (如果尚未初始化)
        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_key_path)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
    except Exception as e:
        return f"Firebase 初始化失敗：{e}"

    collection_ref = db.collection(collection_name)
    docs = collection_ref.get()

    if not docs:
        return f"指定的 collection:{collection_name} 中沒有資料。"

    # 決定 CSV 檔案的標題列
    field_names = []
    first_doc_data = docs[0].to_dict() if docs else {}
    for key in first_doc_data:
        field_names.append(key)

    if not field_names:
        return "Collection 中的 document 沒有欄位。"

    # 設定輸出檔案名稱
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if output_filename is None:
        output_filename = f"{collection_name}_{timestamp}.csv"

    try:
        with open(output_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=field_names)

            writer.writeheader()
            for doc in docs:
                writer.writerow(doc.to_dict())

        return f"資料已成功匯出到：{output_filename}"
    except Exception as e:
        return f"寫入 CSV 檔案時發生錯誤：{e}"

if __name__ == '__main__':
    # 確保你已經將你的服務帳戶金鑰 JSON 檔案命名為 serviceAccountKey.json
    # 並放在與此腳本相同的目錄下，或者修改 service_account_key_path 參數。

    # 測試匯出 expenses collection
    user_id = 'JiaMing'  # 替換為你的使用者 ID
    assets_collection_path = f'UserDB/{user_id}/assets'
    # result = export_firestore_collection_to_csv('expenses')
    # print(result)

    # 指定輸出的檔案名稱
    result_with_filename = export_firestore_collection_to_csv(assets_collection_path, 'jiaMing_assets.csv')
    print(result_with_filename)