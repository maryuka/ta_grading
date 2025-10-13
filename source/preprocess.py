import os
import pandas as pd
import re
from dotenv import load_dotenv

# 実行コマンド: python source/preprocess.py

# .envファイルから環境変数を読み込む
load_dotenv()

# --- パス設定 ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
load_dotenv(os.path.join(SCRIPT_DIR, '.env'))

# --- 設定項目を.envファイルから読み込む ---
ASSIGNMENT_DIR = os.getenv('ASSIGNMENT_DIR')
CSV_FILE = os.getenv('CSV_FILE')
SUBMISSION_DIR = os.getenv('SUBMISSION_DIR')
ASSIGNMENT_NAME = os.getenv('ASSIGNMENT_NAME')
# ----------------------------------------

# ★修正: パスを動的に組み立てる
BASE_PATH = os.path.join(PROJECT_ROOT, ASSIGNMENT_DIR)
CSV_PATH = os.path.join(BASE_PATH, CSV_FILE)
SUBMISSION_PATH = os.path.join(BASE_PATH, SUBMISSION_DIR)
# ★修正: 出力ファイル名を自動生成
OUTPUT_CSV_PATH = os.path.splitext(CSV_PATH)[0] + '_preprocessed.csv'


def find_student_folder(student_id, base_dir):
    """
    学生のIDを元に、提出物フォルダ名を見つけ出す関数。
    """
    search_prefix = f"{student_id}"
    if not os.path.isdir(base_dir):
        return None
    for folder_name in os.listdir(base_dir):
        if folder_name.startswith(search_prefix):
            return os.path.join(base_dir, folder_name)
    return None

def check_header(source_code):
    """
    ソースコードのヘッダー情報が記入されているかチェックする関数。
    記載されていない項目をリストで返します。
    """
    required_fields = ["氏名", "学生番号", "作成日", "入出力の説明", "動きの説明", "感想"]
    missing_items = []

    # --- ヘッダーコメントブロック( /*...*/ )内のみを抽出してチェック対象とする ---
    header_block_match = re.search(r'/\*.*?\*/', source_code, re.DOTALL)
    # もしヘッダーブロックが見つからなければ、ファイル全体をチェック（フォールバック）
    text_to_check = header_block_match.group(0) if header_block_match else source_code

    pattern_str = f"((?:{'|'.join(required_fields)}))\\s*[:：]"
    matches = list(re.finditer(pattern_str, text_to_check))
    
    found_contents = {}
    for i, match in enumerate(matches):
        field_name = match.group(1).strip()
        content_start = match.end()
        content_end = matches[i + 1].start() if i + 1 < len(matches) else len(text_to_check)
        
        # 抽出した内容から不要な文字（空白、改行、コメント終端記号）を削除
        content = text_to_check[content_start:content_end]
        content = content.replace('*/', '').strip() # コメント終端記号を削除
        
        found_contents[field_name] = content

    for field in required_fields:
        if field not in found_contents or found_contents[field] == "":
            missing_items.append(field)
            
    return missing_items

def main():
    """
    メイン処理
    """
    print(f"処理を開始します: {CSV_PATH}")

    # 1. CSVファイルの読み込み
    try:
        df = pd.read_csv(CSV_PATH, encoding='utf-8')
    except UnicodeDecodeError:
        print("UTF-8での読み込みに失敗。Shift_JISで再試行します。")
        df = pd.read_csv(CSV_PATH, encoding='shift_jis')
    except FileNotFoundError:
        print(f"エラー: CSVファイル '{CSV_PATH}' が見つかりません。")
        return

    # 2. 学生ごとにチェック処理
    for index, row in df.iterrows():
        # 未提出の場合はスキップ
        if '提出済み' not in row['ステータス']:
            continue

        feedback = row['フィードバックコメント'] if pd.notna(row['フィードバックコメント']) else ""

        student_id = row['広大ID']
        student_name = row['フルネーム']

        folder_path = find_student_folder(student_id, SUBMISSION_PATH)
        source_filename = f"{ASSIGNMENT_NAME}.c"
        source_path = os.path.join(folder_path, source_filename) if folder_path else None

        history_filename = f"{ASSIGNMENT_NAME}-test-history.txt"
        history_path = os.path.join(folder_path, history_filename) if folder_path else None

        # --- チェック①: ファイル不備チェック ---
        if not os.path.exists(source_path) or not os.path.exists(history_path):
            feedback += f"この課題では \"{ASSIGNMENT_NAME}.c\" と \"{ASSIGNMENT_NAME}-test-history.txt\" を提出してください."
            if not os.path.exists(history_path):
                feedback += f" make testを実行するとtxtファイルが作成されます(演習1の「演習課題のやり方」を参照してください)."
            df.loc[index, 'フィードバックコメント'] = feedback
            print(f"[{student_name}] ❌ ファイル不備: {feedback}")
            if not os.path.exists(source_path):
                continue # ソースファイルがないのでヘッダーチェックはしない

        # --- チェック②: ヘッダー記入漏れチェック ---
        try:
            with open(source_path, 'r', encoding='utf-8', errors='ignore') as f:
                source_code = f.read()
            
            missing_items = check_header(source_code)
            if missing_items:
                feedback += ",".join([f" {item}" for item in missing_items])
                feedback += "を記入してください."
                df.loc[index, 'フィードバックコメント'] = feedback
                print(f"[{student_name}] ⚠️ ヘッダー記入漏れ: {feedback}")

        except Exception as e:
            feedback = f"ソースファイルの読み込み中にエラーが発生しました: {e}"
            print(f"[{student_name}] ❌ エラー: {feedback}")


    # 3. 結果を新しいCSVファイルに保存
    df.to_csv(OUTPUT_CSV_PATH, index=False, encoding='utf-8-sig')
    print("-" * 30)
    print(f"✅ 全ての処理が完了しました。")
    print(f"結果は '{OUTPUT_CSV_PATH}' に保存されました。")
    print("次に、採点支援ツールを起動して、このファイルを使用してください。")


if __name__ == '__main__':
    main()