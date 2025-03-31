from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials, firestore, storage
import os
from datetime import datetime
from flask_cors import CORS
# 初始化 Flask 應用
app = Flask(__name__)
# 啟用 CORS，允許所有來源（或指定來源）
CORS(app)

# 初始化 Firebase
cred = credentials.Certificate("serviceAccountKey.json")  # 替換為您的服務帳戶金鑰路徑
firebase_admin.initialize_app(cred, {
    'storageBucket': 'supwallet_postdb'  
})
db = firestore.client()
bucket = storage.bucket()


# 上傳貼文
@app.route('/api/posts', methods=['POST'])
def create_post():
    try:
        # 獲取表單資料
        print("接收到的表單資料：")
        for key in request.form:
            print(f"{key}: {request.form[key]}")

        user_id = request.form.get('userId')
        content = request.form.get('content')
        privacy = request.form.get('privacy')
        image_files = request.files.getlist('images')  # 獲取多個檔案
    
        if not user_id or not content or not privacy:
            return jsonify({'error': 'Missing required fields'}), 400

        # 上傳圖片並獲取 URL 列表
        image_urls = []
        for image_file in image_files:
            if image_file and image_file.filename:  # 確保檔案有效
                print(f"處理檔案: {image_file.filename}")
                filename = f"posts/{user_id}/{datetime.now().strftime('%Y%m%d%H%M%S')}_{image_file.filename}"
                blob = bucket.blob(filename)
                blob.upload_from_file(image_file, content_type=image_file.content_type)
                blob.make_public()
                image_urls.append(blob.public_url)

        # 儲存貼文到 Firestore
        ref = db.collection("UserDB").document(user_id).collection("post")
        docs = ref.stream()
        existing_ids = [int(doc.id) for doc in docs if doc.id.isdigit()]
        next_id = max(existing_ids, default=0) + 1 if existing_ids else 1
        document_id = str(next_id)

        post_data = {
            'id': next_id,
            'content': content,
            'list': privacy,
            'imageUrls': image_urls,  # 儲存多個圖片的 URL 列表
            'timestamp': firestore.SERVER_TIMESTAMP,
            'reactions': {'like': 0, 'love': 0, 'laugh': 0}
        }

        if ref.document(document_id).get().exists:
            print(f"文檔 {document_id} 已存在，無法上傳")
            return jsonify({'error': 'Document already exists'}), 400
        else:
            ref.document(document_id).set(post_data)
            print(f"已上傳資料到 'post'/{document_id}", "data:", post_data)
            return jsonify({'message': 'Post created', 'id': document_id}), 201
       

    except Exception as e:
        print(f"錯誤: {str(e)}")
        return jsonify({'error': str(e)}), 500

# 獲取特定使用者的貼文
@app.route('/api/posts/<account>', methods=['GET'])
def get_posts_by_account(account):
    try:
        posts_ref = db.collection('UserDB')\
                     .document(account)\
                     .collection('post')\
                     .order_by('timestamp', direction=firestore.Query.DESCENDING)\
                     .limit(30)
        posts = [dict(post.to_dict(), id=post.id) for post in posts_ref.stream()]
        return jsonify(posts), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 獲取所有貼文（可選，根據需求保留）
@app.route('/api/posts', methods=['GET'])
def get_posts():
    try:
        posts_ref = db.collection('posts')\
                     .order_by('timestamp', direction=firestore.Query.DESCENDING)\
                     .limit(20)
        posts = [dict(post.to_dict(), id=post.id) for post in posts_ref.stream()]
        return jsonify(posts), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 更新表情反應
@app.route('/api/posts/<user_id>/<post_id>/react', methods=['POST'])
def react_to_post(user_id, post_id):
    try:
        reaction_type = request.json.get('reaction')
        if reaction_type not in ['like', 'love', 'laugh']:
            return jsonify({'error': 'Invalid reaction type'}), 400

        post_ref = db.collection("UserDB").document(user_id).collection("post").document(post_id)
        post_ref.update({
            f'reactions.{reaction_type}': firestore.Increment(1)
        })
        return jsonify({'message': 'Reaction updated'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)