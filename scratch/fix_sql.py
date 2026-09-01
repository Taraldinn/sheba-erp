with open(r"d:\Ashik\Sheba SQL backup\shebafi_minhaj.sql", "r", encoding="utf-8", errors="ignore") as f:
    sql = f.read()

# Replace unknown collations
sql = sql.replace("utf8mb4_0900_ai_ci", "utf8mb4_unicode_ci")

with open(r"d:\Ashik\Shebad 21 may\scratch\shebafi_minhaj_fixed.sql", "w", encoding="utf-8") as f:
    f.write(sql)

print("SQL collation fixed successfully.")
