import base64
import os
from google import genai
from google.genai import types

client = genai.Client(api_key= 'AIzaSyDqqI2-g6VQoGvQvxixEg6xNtjlhJh9h3I')

response = client.models.generate_content(
    model="gemini-2.0-flash", contents="可以幫我分析開銷行為嗎?精簡回答就可以了"
)
print(response.text)