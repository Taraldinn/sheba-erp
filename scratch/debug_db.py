import mysql.connector

try:
    conn = mysql.connector.connect(
        host="127.0.0.1",
        user="shebafi_master",
        password="Mother519466@",
        database="shebafi_master"
    )
    cursor = conn.cursor(dictionary=True)
    
    print("--- TABLES ---")
    cursor.execute("SHOW TABLES")
    for row in cursor.fetchall():
        print(row)
        
    print("\n--- IP_PHONE_CONFIGS ---")
    cursor.execute("SELECT * FROM ip_phone_configs")
    for row in cursor.fetchall():
        print(row)
        
    print("\n--- IP_PHONE_NUMBERS ---")
    cursor.execute("SELECT * FROM ip_phone_numbers")
    for row in cursor.fetchall():
        print(row)
        
    cursor.close()
    conn.close()
except Exception as e:
    print("ERROR:", e)
