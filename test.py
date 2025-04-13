from SmartMF import SmartMF, Expense, Asset
from datetime import date
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

if __name__ == "__main__":
    smf = SmartMF()
    user_id = smf.get_all_users()[2]
    
    test_asset = Asset(item = "test",
                       asset_type= "活期",
                       acquisition_date= '2025/04/10',
                       acquisition_value= 10000,
                       quantity= -1,
                       )
    
    
    print(ret)