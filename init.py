from SmartMF import SmartMF
 

def initialize_database():
  """Initializes the database with some default data."""
  smart_mf = SmartMF()
 

#   # Add the initial user
#   smart_mf.add_user(user_id="JiaMing")
#   smart_mf.add_user(user_id="Rhea")
#   smart_mf.add_user(user_id="CH&Rhea")

def uploader(user_id, file_path):
  """Uploads a file to the database."""
  smart_mf = SmartMF()
  smart_mf.upload_csv_to_collection()

if __name__ == "__main__":
#   initialize_database()
    smart_mf = SmartMF()
    user_id = ['JiaMing', 'Rhea', 'Co-Found']  # 替換為你的使用者 ID
    
  
    # Download the expenses collection to a CSV file
    # for i in user_id:
    #     print(i)
    #     expenses_collection_path = f'UserDB/{i}/expenses'
    #     assets_collection_path = f'UserDB/{i}/assets'
    #     smart_mf.download_collection_to_csv(collection_path=expenses_collection_path, output_filename=f'{i}_expenses.csv')
    #     smart_mf.download_collection_to_csv(collection_path=assets_collection_path, output_filename=f'{i}_assets.csv')

    # Upload the expenses CSV file to the collection
    smart_mf.upload_csv_to_collection('Rhea_expenses.csv',
                                    collection_path=smart_mf._get_expense_collection_path(user_id[1]),
                                    collection_name="expenses")

    smart_mf.upload_csv_to_collection('Co-Found_expenses.csv',
                                    collection_path=smart_mf._get_expense_collection_path('CH&Rhea'),
                                    collection_name="expenses")
   
