import os
import pandas as pd
import re
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from dotenv import load_dotenv
import io
import json

# --- パス設定 ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# .envファイルはスクリプトと同じディレクトリにある想定
load_dotenv(os.path.join(SCRIPT_DIR, '.env'))

# --- 設定項目 ---
ASSIGNMENT_DIR = os.getenv('ASSIGNMENT_DIR')
CSV_FILE = os.getenv('CSV_FILE')
SUBMISSION_DIR = os.getenv('SUBMISSION_DIR')
ASSIGNMENT_NAME = os.getenv('ASSIGNMENT_NAME')

# パスを動的に組み立て (プロジェクトルートは backend/ の親)
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BASE_PATH = os.path.join(PROJECT_ROOT, 'backend', ASSIGNMENT_DIR)
CSV_PATH = os.path.join(BASE_PATH, CSV_FILE)
FEEDBACK_CSV_PATH = os.path.join(BASE_PATH, 'list_feedback.csv')  # フィードバック用CSV
REVIEW_STATUS_PATH = os.path.join(BASE_PATH, 'review_status.json')  # レビュー状態管理用
AUTO_CHECK_PATH = os.path.join(BASE_PATH, 'auto_check_results.json')  # 自動チェック結果
SUBMISSION_PATH = os.path.join(BASE_PATH, SUBMISSION_DIR)

app = Flask(__name__)
CORS(app) # ReactからのAPIリクエストを許可

# --- preprocess.pyから移植した関数群 ---
def find_student_folder(student_id, base_dir):
    search_prefix = f"{student_id}"
    if not os.path.isdir(base_dir): return None
    for folder_name in os.listdir(base_dir):
        if folder_name.startswith(search_prefix):
            return os.path.join(base_dir, folder_name)
    return None

def check_header(source_code):
    required_fields = ["氏名", "学生番号", "作成日", "入出力の説明", "動きの説明", "感想"]
    missing_items = []
    header_block_match = re.search(r'/\*.*?\*/', source_code, re.DOTALL)
    text_to_check = header_block_match.group(0) if header_block_match else source_code
    pattern_str = f"((?:{'|'.join(required_fields)}))\\s*[:：]"
    matches = list(re.finditer(pattern_str, text_to_check))
    found_contents = {}
    for i, match in enumerate(matches):
        field_name = match.group(1).strip()
        content_start = match.end()
        content_end = matches[i + 1].start() if i + 1 < len(matches) else len(text_to_check)
        content = text_to_check[content_start:content_end].replace('*/', '').strip()
        found_contents[field_name] = content
    for field in required_fields:
        if field not in found_contents or found_contents[field] == "":
            missing_items.append(field)
    return missing_items

# --- APIエンドポイント定義 ---

def load_review_status():
    """レビュー状態を読み込み"""
    if os.path.exists(REVIEW_STATUS_PATH):
        with open(REVIEW_STATUS_PATH, 'r') as f:
            return json.load(f)
    return {}

def save_review_status(status_dict):
    """レビュー状態を保存"""
    with open(REVIEW_STATUS_PATH, 'w') as f:
        json.dump(status_dict, f, ensure_ascii=False, indent=2)

def load_auto_check_results():
    """自動チェック結果を読み込み"""
    if os.path.exists(AUTO_CHECK_PATH):
        with open(AUTO_CHECK_PATH, 'r') as f:
            return json.load(f)
    return {}

def save_auto_check_results(results_dict):
    """自動チェック結果を保存"""
    with open(AUTO_CHECK_PATH, 'w') as f:
        json.dump(results_dict, f, ensure_ascii=False, indent=2)

def initialize_feedback_csv():
    """フィードバックCSVが存在しない場合、元のCSVからコピーして作成"""
    if not os.path.exists(FEEDBACK_CSV_PATH):
        try:
            df = pd.read_csv(CSV_PATH, encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(CSV_PATH, encoding='shift_jis')
        
        # フィードバックコメント列がない場合は追加
        if 'フィードバックコメント' not in df.columns:
            df['フィードバックコメント'] = ''
        
        # フィードバックCSVとして保存（空文字列を保持）
        df.to_csv(FEEDBACK_CSV_PATH, index=False, encoding='utf-8-sig', na_rep='')
        return df
    else:
        try:
            # keep_default_na=Falseとna_values=['']で空文字列を保持
            df = pd.read_csv(FEEDBACK_CSV_PATH, encoding='utf-8', keep_default_na=False, na_values=[''])
            return df
        except UnicodeDecodeError:
            df = pd.read_csv(FEEDBACK_CSV_PATH, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
            return df

@app.route('/api/students')
def get_students_with_status():
    # フィードバックCSVを初期化または読み込み
    df = initialize_feedback_csv()
    
    # レビュー状態を読み込み
    review_status = load_review_status()
    
    # NaN値をNoneに置換
    df = df.where(pd.notnull(df), None)
    
    # JSONで返すための結果リスト
    students_with_status = []

    for index, row in df.iterrows():
        # 未提出はリストに含めない
        if '提出済み' not in str(row['ステータス']):
            continue

        student_info = row.to_dict()
        
        
        # NaN値を文字列に変換（特に評点フィールド）
        for key, value in student_info.items():
            if pd.isna(value):
                # 広大IDは絶対にNoneにしない
                if key != '広大ID':
                    student_info[key] = None
        
        auto_feedback = "" # 自動生成されるフィードバック

        student_id = row['広大ID']
        folder_path = find_student_folder(student_id, SUBMISSION_PATH)
        source_filename = f"{ASSIGNMENT_NAME}.c"
        source_path = os.path.join(folder_path, source_filename) if folder_path else None
        history_filename = f"{ASSIGNMENT_NAME}-test-history.txt"
        history_path = os.path.join(folder_path, history_filename) if folder_path else None
        
        # フォルダ内のファイル一覧を取得
        files_in_folder = []
        if folder_path and os.path.exists(folder_path):
            files_in_folder = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
        student_info['files'] = files_in_folder

        # ファイル不備チェック
        if not source_path or not os.path.exists(source_path) or not os.path.exists(history_path):
            auto_feedback += f"この課題では \"{source_filename}\" と \"{history_filename}\" を提出してください。"
            if not history_path or not os.path.exists(history_path):
                auto_feedback += " make testを実行するとtxtファイルが作成されます(演習1の「演習課題のやり方」を参照してください)。"
            if not source_path or not os.path.exists(source_path):
                student_info['auto_feedback'] = auto_feedback.strip()
                
                # レビュー状態を追加（ファイルが間違っていてもレビュー状態は必要）
                student_id_for_review = student_info.get('広大ID')
                if student_id_for_review is None:
                    student_info['レビュー済み'] = None
                else:
                    student_id_str = str(student_id_for_review).strip()
                    student_info['レビュー済み'] = '1' if review_status.get(student_id_str, False) else ''
                
                students_with_status.append(student_info)
                continue # ソースがないのでヘッダーチェックはスキップ

        # ヘッダー記入漏れチェック
        try:
            with open(source_path, 'r', encoding='utf-8', errors='ignore') as f:
                source_code = f.read()
            missing_items = check_header(source_code)
            if missing_items:
                auto_feedback += f"{source_filename}に, "
                auto_feedback += ",".join([f" {item}" for item in missing_items])
                auto_feedback += "を記入してください。"
        except Exception:
            pass # エラーの場合は何もしない

        student_info['auto_feedback'] = auto_feedback.strip()
        
        # レビュー状態を追加
        student_id = student_info.get('広大ID')
        
        
        if student_id is None:
            student_info['レビュー済み'] = None
        else:
            # 文字列として統一して比較
            student_id_str = str(student_id).strip() if not isinstance(student_id, str) else student_id.strip()
            # review_statusの値を取得してチェック
            student_info['レビュー済み'] = '1' if review_status.get(student_id_str, False) else ''
        
        students_with_status.append(student_info)

    return jsonify(students_with_status)

# 学生詳細と保存API
@app.route('/api/student/<hirodai_id>')
def get_student_details(hirodai_id):
    # フィードバックCSVから読み込み
    df = initialize_feedback_csv()
    
    # NaN値をNoneに置換
    df = df.where(pd.notnull(df), None)
    student_data = df[df['広大ID'] == hirodai_id].iloc[0]
    folder_path = find_student_folder(hirodai_id, SUBMISSION_PATH)
    source_code, test_history = "ファイルが見つかりません。", "ファイルが見つかりません。"
    if folder_path:
        source_path = os.path.join(folder_path, f"{ASSIGNMENT_NAME}.c")
        history_path = os.path.join(folder_path, f"{ASSIGNMENT_NAME}-test-history.txt")
        if os.path.exists(source_path):
            with open(source_path, 'r', encoding='utf-8', errors='ignore') as f: source_code = f.read()
        if os.path.exists(history_path):
            with open(history_path, 'r', encoding='utf-8', errors='ignore') as f: test_history = f.read()
    student_dict = student_data.to_dict()
    # NaN値をNoneに変換
    for key, value in student_dict.items():
        if pd.isna(value):
            student_dict[key] = None
    
    # auto_feedbackの生成（/api/studentsと同じロジック）
    auto_feedback = ""
    source_filename = f"{ASSIGNMENT_NAME}.c"
    history_filename = f"{ASSIGNMENT_NAME}-test-history.txt"
    
    # ファイル不備チェック
    if not folder_path or not os.path.exists(source_path) or not os.path.exists(history_path):
        auto_feedback += f"この課題では \"{source_filename}\" と \"{history_filename}\" を提出してください."
        if not os.path.exists(history_path):
            auto_feedback += " make testを実行するとtxtファイルが作成されます(演習1の「演習課題のやり方」を参照してください)."
    
    # ヘッダー記入漏れチェック（ソースコードが存在する場合のみ）
    if source_code != "ファイルが見つかりません.":
        missing_items = check_header(source_code)
        if missing_items:
            auto_feedback += f"{source_filename}に"
            auto_feedback += ",".join([f" {item}" for item in missing_items])
            auto_feedback += "を記入してください."
    
    student_dict['auto_feedback'] = auto_feedback.strip()
    
    # レビュー状態を追加
    review_status = load_review_status()
    student_dict['レビュー済み'] = '1' if review_status.get(hirodai_id) else ''
    
    # 自動チェック結果を追加
    auto_check_data = load_auto_check_results()
    auto_check_result = ''
    if auto_check_data and 'results' in auto_check_data:
        auto_check_result = auto_check_data['results'].get(str(hirodai_id), '')
    
    # フォルダ内のファイル一覧を取得
    files_in_folder = []
    if folder_path and os.path.exists(folder_path):
        files_in_folder = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
    
    response = {
        'student': student_dict, 
        'source_code': source_code, 
        'test_history': test_history, 
        'files': files_in_folder,
        'assignment_name': ASSIGNMENT_NAME,
        'auto_check_result': auto_check_result
    }
    return jsonify(response)

# 自動チェック用エンドポイント（個別）
@app.route('/api/student/<hirodai_id>/auto-check')
def auto_check_student(hirodai_id):
    # フィードバックCSVから読み込み
    df = initialize_feedback_csv()
    
    # NaN値をNoneに置換
    df = df.where(pd.notnull(df), None)
    student_data = df[df['広大ID'] == hirodai_id].iloc[0]
    folder_path = find_student_folder(hirodai_id, SUBMISSION_PATH)
    
    auto_feedback = ""
    source_filename = f"{ASSIGNMENT_NAME}.c"
    history_filename = f"{ASSIGNMENT_NAME}-test-history.txt"
    source_path = os.path.join(folder_path, source_filename) if folder_path else None
    history_path = os.path.join(folder_path, history_filename) if folder_path else None
    
    # ファイル不備チェック
    if not source_path or not os.path.exists(source_path) or not os.path.exists(history_path):
        auto_feedback += f"この課題では \"{source_filename}\" と \"{history_filename}\" を提出してください。"
        if history_path and not os.path.exists(history_path):
            auto_feedback += " make testを実行するとtxtファイルが作成されます(演習1の「演習課題のやり方」を参照してください)。"
    
    # ヘッダー記入漏れチェック（ソースコードが存在する場合のみ）
    if source_path and os.path.exists(source_path):
        with open(source_path, 'r', encoding='utf-8', errors='ignore') as f:
            source_code = f.read()
        missing_items = check_header(source_code)
        if missing_items:
            auto_feedback += f"{source_filename}に"
            auto_feedback += ",".join([f" {item}" for item in missing_items])
            auto_feedback += "を記入してください。"
    
    # 既存の自動チェック結果を読み込んで更新
    auto_check_data = load_auto_check_results()
    if 'results' not in auto_check_data:
        from datetime import datetime
        auto_check_data = {
            'checked_at': datetime.now().isoformat(),
            'assignment': ASSIGNMENT_NAME,
            'results': {}
        }
    auto_check_data['results'][str(hirodai_id)] = auto_feedback.strip()
    save_auto_check_results(auto_check_data)
    
    return jsonify({'auto_feedback': auto_feedback.strip()})

# 全学生自動チェック用エンドポイント
@app.route('/api/auto-check-all', methods=['POST'])
def auto_check_all_students():
    # フィードバックCSVから読み込み
    df = initialize_feedback_csv()
    
    # NaN値をNoneに置換
    df = df.where(pd.notnull(df), None)
    
    # 統計情報
    total_students = 0
    checked_count = 0
    issues_found = 0
    
    # 自動チェック結果を格納
    check_results = {}
    
    for index, row in df.iterrows():
        # 未提出はスキップ
        if '提出済み' not in str(row['ステータス']):
            continue
            
        total_students += 1
        student_id = str(row['広大ID'])
        checked_count += 1
        
        # 自動チェック実行
        folder_path = find_student_folder(student_id, SUBMISSION_PATH)
        auto_feedback = ""
        source_filename = f"{ASSIGNMENT_NAME}.c"
        history_filename = f"{ASSIGNMENT_NAME}-test-history.txt"
        source_path = os.path.join(folder_path, source_filename) if folder_path else None
        history_path = os.path.join(folder_path, history_filename) if folder_path else None
        
        # ファイル不備チェック
        if not source_path or not os.path.exists(source_path) or not os.path.exists(history_path):
            auto_feedback += f"この課題では \"{source_filename}\" と \"{history_filename}\" を提出してください。"
            if history_path and not os.path.exists(history_path):
                auto_feedback += " make testを実行するとtxtファイルが作成されます(演習1の「演習課題のやり方」を参照してください)。"
        
        # ヘッダー記入漏れチェック（ソースコードが存在する場合のみ）
        if source_path and os.path.exists(source_path):
            with open(source_path, 'r', encoding='utf-8', errors='ignore') as f:
                source_code = f.read()
            missing_items = check_header(source_code)
            if missing_items:
                auto_feedback += f"{source_filename}に"
                auto_feedback += ",".join([f" {item}" for item in missing_items])
                auto_feedback += "を記入してください。"
        
        # 結果を保存（問題がなくても空文字として保存）
        check_results[student_id] = auto_feedback.strip()
        if auto_feedback.strip():
            issues_found += 1
    
    # 自動チェック結果をJSONファイルに保存
    from datetime import datetime
    auto_check_data = {
        'checked_at': datetime.now().isoformat(),
        'assignment': ASSIGNMENT_NAME,
        'results': check_results
    }
    save_auto_check_results(auto_check_data)
    
    return jsonify({
        'total': total_students,
        'checked': checked_count,
        'issues_found': issues_found,
        'skipped': 0
    })

# 自動チェックステータス確認エンドポイント
@app.route('/api/auto-check-status')
def get_auto_check_status():
    auto_check_data = load_auto_check_results()
    if auto_check_data and 'checked_at' in auto_check_data:
        return jsonify({
            'checked': True,
            'checked_at': auto_check_data['checked_at'],
            'assignment': auto_check_data.get('assignment', ASSIGNMENT_NAME)
        })
    return jsonify({
        'checked': False
    })

@app.route('/api/student/<hirodai_id>/feedback', methods=['POST'])
def save_feedback(hirodai_id):
    feedback_data = request.json['feedback']
    # 空文字列もそのまま受け入れる（レビュー完了として扱う）
    
    # フィードバックCSVを読み込み
    df = initialize_feedback_csv()
    
    # 該当する学生のフィードバックを更新
    if hirodai_id in df['広大ID'].values:
        df.loc[df['広大ID'] == hirodai_id, 'フィードバックコメント'] = feedback_data
    
    # フィードバックCSVに保存（空文字列を保持）
    df.to_csv(FEEDBACK_CSV_PATH, index=False, encoding='utf-8-sig', na_rep='')
    
    # レビュー状態を別ファイルに保存
    review_status = load_review_status()
    review_status[hirodai_id] = True
    save_review_status(review_status)
    
    return jsonify({'status': 'success'})

# CSVエクスポートAPI
@app.route('/api/export/csv')
def export_csv():
    # フィードバックCSVを読み込み（存在しない場合は初期化）
    df = initialize_feedback_csv()
    
    # BOM付きUTF-8でエンコード（Excelで正しく開けるように）
    output = io.BytesIO()
    # BOMを追加
    output.write('\ufeff'.encode('utf-8'))
    # CSVデータを書き込み
    csv_string = df.to_csv(index=False, encoding='utf-8')
    output.write(csv_string.encode('utf-8'))
    output.seek(0)
    
    # レスポンスを作成
    response = Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename=feedback_{ASSIGNMENT_NAME}.csv',
            'Content-Type': 'text/csv; charset=utf-8'
        }
    )
    
    return response

if __name__ == '__main__':
    app.run(debug=True, port=5001)