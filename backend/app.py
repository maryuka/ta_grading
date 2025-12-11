import os
import pandas as pd
import re
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from dotenv import load_dotenv
import io
import json
import zipfile
import shutil
import tempfile
from werkzeug.utils import secure_filename
from datetime import datetime
import subprocess
import difflib

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

@app.route('/api/assignments')
def get_assignments():
    """backend/data配下の課題ディレクトリ一覧を返す"""
    data_dir = os.path.join(PROJECT_ROOT, 'backend', 'data')
    assignments = []
    
    if os.path.exists(data_dir):
        for item in os.listdir(data_dir):
            item_path = os.path.join(data_dir, item)
            # ディレクトリかつ.DS_Storeなどのシステムファイルではない
            if os.path.isdir(item_path) and not item.startswith('.'):
                # config.jsonがある場合は、その内容を読み込む
                config_path = os.path.join(item_path, 'config.json')
                if os.path.exists(config_path):
                    with open(config_path, 'r') as f:
                        config = json.load(f)
                    assignment_info = {
                        'id': item,
                        'name': config.get('name', item.replace('_', ' ').title()),
                        'path': item,
                        'created_at': config.get('created_at')
                    }
                else:
                    # 既存の課題（config.jsonがない）の処理
                    assignment_info = {
                        'id': item,
                        'name': item.replace('_', ' ').title(),  # r_1_variable -> R 1 Variable
                        'path': item
                    }
                    
                    # 特定の課題名のマッピング
                    if item == 'r_1_variable':
                        assignment_info['name'] = '課題1: 変数'
                    
                assignments.append(assignment_info)
    
    # 作成日時でソート（新しい順）
    assignments.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    
    return jsonify(assignments)

@app.route('/api/students')
@app.route('/api/assignments/<assignment_id>/students')
def get_students_with_status(assignment_id=None):
    # 課題IDが指定された場合、その課題のデータディレクトリを使用
    if assignment_id:
        # 動的に課題ディレクトリのパスを構築
        assignment_base_path = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
        assignment_csv_path = os.path.join(assignment_base_path, 'list.csv')
        assignment_feedback_csv_path = os.path.join(assignment_base_path, 'list_feedback.csv')
        assignment_review_status_path = os.path.join(assignment_base_path, 'review_status.json')
        
        # config.jsonから設定を読み込む
        config_path = os.path.join(assignment_base_path, 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            assignment_submission_path = os.path.join(assignment_base_path, config.get('submission_dir', 'submissions'))
            # config.jsonからファイル名を取得
            assignment_name = config.get('source_file_name', 'assignment')
        else:
            # config.jsonがない場合のフォールバック（通常は発生しない）
            assignment_submission_path = os.path.join(assignment_base_path, 'submissions')
            assignment_name = 'assignment'
    else:
        # デフォルトのパスを使用（後方互換性のため）
        assignment_csv_path = CSV_PATH
        assignment_feedback_csv_path = FEEDBACK_CSV_PATH
        assignment_review_status_path = REVIEW_STATUS_PATH
        assignment_submission_path = SUBMISSION_PATH
        assignment_name = ASSIGNMENT_NAME
    
    # フィードバックCSVを初期化または読み込み（課題別のパスを使用）
    if not os.path.exists(assignment_feedback_csv_path):
        try:
            df = pd.read_csv(assignment_csv_path, encoding='utf-8', keep_default_na=False, na_values=[''])
        except UnicodeDecodeError:
            df = pd.read_csv(assignment_csv_path, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
        
        if 'フィードバックコメント' not in df.columns:
            df['フィードバックコメント'] = ''
        
        df.to_csv(assignment_feedback_csv_path, index=False, encoding='utf-8-sig', na_rep='')
    else:
        try:
            df = pd.read_csv(assignment_feedback_csv_path, encoding='utf-8', keep_default_na=False, na_values=[''])
        except UnicodeDecodeError:
            df = pd.read_csv(assignment_feedback_csv_path, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
    
    # レビュー状態を読み込み（課題別のパスを使用）
    if assignment_id and os.path.exists(assignment_review_status_path):
        with open(assignment_review_status_path, 'r') as f:
            review_status = json.load(f)
    elif not assignment_id:
        review_status = load_review_status()
    else:
        review_status = {}
    
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
        
        # 自動チェックは無効化（ただし、保存された結果があれば読み込む）
        student_id = row['広大ID']
        folder_path = find_student_folder(student_id, assignment_submission_path)
        
        # フォルダ内のファイル一覧を取得
        files_in_folder = []
        if folder_path and os.path.exists(folder_path):
            files_in_folder = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
        student_info['files'] = files_in_folder

        # 保存された自動チェック結果があれば使用、なければ空文字
        auto_feedback = ""
        if assignment_id:
            auto_check_path = os.path.join(assignment_base_path, 'auto_check_results.json')
            if os.path.exists(auto_check_path):
                with open(auto_check_path, 'r') as f:
                    auto_check_data = json.load(f)
                if auto_check_data and 'results' in auto_check_data:
                    auto_feedback = auto_check_data['results'].get(str(student_id), "")
        student_info['auto_feedback'] = auto_feedback
        
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
@app.route('/api/assignments/<assignment_id>/students/<hirodai_id>')
def get_student_details(hirodai_id, assignment_id=None):
    # 課題IDが指定された場合、その課題のデータを使用
    if assignment_id:
        assignment_base_path = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
        assignment_csv_path = os.path.join(assignment_base_path, 'list_feedback.csv')
        
        # config.jsonから設定を読み込む
        config_path = os.path.join(assignment_base_path, 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            assignment_submission_path = os.path.join(assignment_base_path, config.get('submission_dir', 'submissions'))
            assignment_name = config.get('source_file_name', 'assignment')
        else:
            assignment_submission_path = os.path.join(assignment_base_path, 'submissions')
            assignment_name = 'assignment'
        
        # CSVファイルを読み込み
        try:
            df = pd.read_csv(assignment_csv_path, encoding='utf-8', keep_default_na=False, na_values=[''])
        except UnicodeDecodeError:
            df = pd.read_csv(assignment_csv_path, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
    else:
        # 後方互換性のため
        df = initialize_feedback_csv()
        assignment_submission_path = SUBMISSION_PATH
        assignment_name = ASSIGNMENT_NAME
    
    # NaN値をNoneに置換
    df = df.where(pd.notnull(df), None)
    
    if hirodai_id not in df['広大ID'].values:
        return jsonify({'error': '学生が見つかりません'}), 404
    
    student_data = df[df['広大ID'] == hirodai_id].iloc[0]
    folder_path = find_student_folder(hirodai_id, assignment_submission_path)
    source_code, test_history = "ファイルが見つかりません。", "ファイルが見つかりません。"
    if folder_path:
        source_path = os.path.join(folder_path, f"{assignment_name}.c")
        history_path = os.path.join(folder_path, f"{assignment_name}-test-history.txt")
        if os.path.exists(source_path):
            with open(source_path, 'r', encoding='utf-8', errors='ignore') as f: source_code = f.read()
        if os.path.exists(history_path):
            with open(history_path, 'r', encoding='utf-8', errors='ignore') as f: test_history = f.read()
    student_dict = student_data.to_dict()
    # NaN値をNoneに変換
    for key, value in student_dict.items():
        if pd.isna(value):
            student_dict[key] = None
    
    # 自動チェックは無効化
    student_dict['auto_feedback'] = ""
    
    # レビュー状態を追加
    if assignment_id:
        # 課題別のレビューステータスを読み込む
        review_status_path = os.path.join(assignment_base_path, 'review_status.json')
        if os.path.exists(review_status_path):
            with open(review_status_path, 'r') as f:
                review_status = json.load(f)
        else:
            review_status = {}
    else:
        review_status = load_review_status()
    student_dict['レビュー済み'] = '1' if review_status.get(hirodai_id) else ''
    
    # 自動チェック結果を追加
    if assignment_id:
        # 課題別の自動チェック結果を読み込む
        auto_check_path = os.path.join(assignment_base_path, 'auto_check_results.json')
        if os.path.exists(auto_check_path):
            with open(auto_check_path, 'r') as f:
                auto_check_data = json.load(f)
        else:
            auto_check_data = {}
    else:
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
        'assignment_name': assignment_name,
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
@app.route('/api/assignments/<assignment_id>/auto-check-all', methods=['POST'])
def auto_check_all_students(assignment_id=None):
    # 課題IDが指定された場合、その課題のデータを使用
    if assignment_id:
        assignment_base_path = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
        assignment_csv_path = os.path.join(assignment_base_path, 'list.csv')
        assignment_auto_check_path = os.path.join(assignment_base_path, 'auto_check_results.json')
        
        # config.jsonから設定を読み込む
        config_path = os.path.join(assignment_base_path, 'config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            assignment_submission_path = os.path.join(assignment_base_path, config.get('submission_dir', 'submissions'))
            assignment_name = config.get('source_file_name', 'assignment')  # config.jsonからファイル名を取得
        else:
            # config.jsonがない場合のフォールバック（通常は発生しない）
            assignment_submission_path = os.path.join(assignment_base_path, 'submissions')
            assignment_name = 'assignment'
        
        # CSVファイルを読み込み
        try:
            df = pd.read_csv(assignment_csv_path, encoding='utf-8', keep_default_na=False, na_values=[''])
        except UnicodeDecodeError:
            df = pd.read_csv(assignment_csv_path, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
    else:
        # 後方互換性のため、デフォルト設定を使用
        df = initialize_feedback_csv()
        assignment_submission_path = SUBMISSION_PATH
        assignment_name = ASSIGNMENT_NAME
        assignment_auto_check_path = AUTO_CHECK_PATH
    
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
        folder_path = find_student_folder(student_id, assignment_submission_path)
        auto_feedback = ""
        source_filename = f"{assignment_name}.c"
        history_filename = f"{assignment_name}-test-history.txt"
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
        'assignment': assignment_id if assignment_id else ASSIGNMENT_NAME,
        'results': check_results
    }
    
    # 課題IDが指定された場合は、その課題のディレクトリに保存
    if assignment_id:
        with open(assignment_auto_check_path, 'w') as f:
            json.dump(auto_check_data, f, ensure_ascii=False, indent=2)
    else:
        save_auto_check_results(auto_check_data)
    
    return jsonify({
        'total': total_students,
        'checked': checked_count,
        'issues_found': issues_found,
        'skipped': 0
    })

# 自動チェックステータス確認エンドポイント
@app.route('/api/auto-check-status')
@app.route('/api/assignments/<assignment_id>/auto-check-status')
def get_auto_check_status(assignment_id=None):
    if assignment_id:
        # 課題IDが指定された場合、その課題の自動チェック結果を読み込む
        assignment_base_path = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
        assignment_auto_check_path = os.path.join(assignment_base_path, 'auto_check_results.json')
        
        if os.path.exists(assignment_auto_check_path):
            with open(assignment_auto_check_path, 'r') as f:
                auto_check_data = json.load(f)
            if auto_check_data and 'checked_at' in auto_check_data:
                return jsonify({
                    'checked': True,
                    'checked_at': auto_check_data['checked_at'],
                    'assignment': auto_check_data.get('assignment', assignment_id)
                })
    else:
        # 後方互換性のため
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
@app.route('/api/assignments/<assignment_id>/students/<hirodai_id>/feedback', methods=['POST'])
def save_feedback(hirodai_id, assignment_id=None):
    feedback_data = request.json['feedback']
    # 空文字列もそのまま受け入れる（レビュー完了として扱う）
    
    # 課題IDが指定された場合、その課題のデータを使用
    if assignment_id:
        assignment_base_path = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
        assignment_feedback_csv_path = os.path.join(assignment_base_path, 'list_feedback.csv')
        assignment_review_status_path = os.path.join(assignment_base_path, 'review_status.json')
        
        # CSVファイルを読み込み
        try:
            df = pd.read_csv(assignment_feedback_csv_path, encoding='utf-8', keep_default_na=False, na_values=[''])
        except UnicodeDecodeError:
            df = pd.read_csv(assignment_feedback_csv_path, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
        
        # 該当する学生のフィードバックを更新
        if hirodai_id in df['広大ID'].values:
            df.loc[df['広大ID'] == hirodai_id, 'フィードバックコメント'] = feedback_data
        
        # フィードバックCSVに保存（空文字列を保持）
        df.to_csv(assignment_feedback_csv_path, index=False, encoding='utf-8-sig', na_rep='')
        
        # レビュー状態を別ファイルに保存
        if os.path.exists(assignment_review_status_path):
            with open(assignment_review_status_path, 'r') as f:
                review_status = json.load(f)
        else:
            review_status = {}
        review_status[hirodai_id] = True
        with open(assignment_review_status_path, 'w') as f:
            json.dump(review_status, f, ensure_ascii=False, indent=2)
    else:
        # 後方互換性のため
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

# clang-formatで整形するAPI
@app.route('/api/assignments/<assignment_id>/students/<hirodai_id>/format')
def format_source_code(assignment_id, hirodai_id):
    """
    ソースコードをclang-formatで整形して差分を返す
    """
    try:
        # 課題のパスを取得
        assignment_base_path = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
        assignment_config_path = os.path.join(assignment_base_path, 'config.json')
        
        # config.jsonから設定を読み込み
        if os.path.exists(assignment_config_path):
            with open(assignment_config_path, 'r') as f:
                config = json.load(f)
            source_file_name = config.get('source_file_name', assignment_id)
            submission_dir = config.get('submission_dir', 'submissions')
        else:
            source_file_name = assignment_id
            submission_dir = 'submissions'
        
        # ソースファイルのパスを構築
        submission_path = os.path.join(assignment_base_path, submission_dir)
        folder_path = find_student_folder(hirodai_id, submission_path)
        
        if not folder_path:
            return jsonify({'error': 'Student folder not found'}), 404
        
        source_file = f"{source_file_name}.c"
        source_path = os.path.join(folder_path, source_file)
        
        if not os.path.exists(source_path):
            return jsonify({'error': 'Source file not found'}), 404
        
        # 元のソースコードを読み込み
        with open(source_path, 'r', encoding='utf-8', errors='ignore') as f:
            original_code = f.read()
        
        # clang-formatで整形
        try:
            # Google styleを使用（-style=googleでも可）
            result = subprocess.run(
                ['clang-format', '-style=Google', source_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return jsonify({'error': 'clang-format failed', 'stderr': result.stderr}), 500
            
            formatted_code = result.stdout
            
            # 差分を生成（unified diff形式）
            diff_lines = list(difflib.unified_diff(
                original_code.splitlines(keepends=True),
                formatted_code.splitlines(keepends=True),
                fromfile='元のコード',
                tofile='整形済みコード',
                lineterm=''
            ))
            diff_text = ''.join(diff_lines)
            
            # 変更があるかチェック
            has_diff = original_code.strip() != formatted_code.strip()
            
            # 差分の行数をカウント
            added_lines = sum(1 for line in diff_lines if line.startswith('+') and not line.startswith('+++'))
            removed_lines = sum(1 for line in diff_lines if line.startswith('-') and not line.startswith('---'))
            
            return jsonify({
                'original': original_code,
                'formatted': formatted_code,
                'diff': diff_text,
                'has_diff': has_diff,
                'stats': {
                    'added': added_lines,
                    'removed': removed_lines,
                    'total_changes': added_lines + removed_lines
                }
            })
            
        except subprocess.TimeoutExpired:
            return jsonify({'error': 'clang-format timeout'}), 500
        except Exception as e:
            return jsonify({'error': f'clang-format error: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# CSVエクスポートAPI（課題別）
@app.route('/api/assignments/<assignment_id>/export/csv')
def export_csv_by_assignment(assignment_id):
    # 課題のパスを取得
    assignment_base_path = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
    assignment_feedback_csv_path = os.path.join(assignment_base_path, 'list_feedback.csv')
    
    # フィードバックCSVが存在しない場合はエラー
    if not os.path.exists(assignment_feedback_csv_path):
        return jsonify({'error': 'Feedback CSV not found'}), 404
    
    # CSVを読み込み
    try:
        df = pd.read_csv(assignment_feedback_csv_path, encoding='utf-8', keep_default_na=False, na_values=[''])
    except UnicodeDecodeError:
        df = pd.read_csv(assignment_feedback_csv_path, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
    
    # BOM付きUTF-8でエンコード（Excelで正しく開けるように）
    output = io.BytesIO()
    # BOMを追加
    output.write('\ufeff'.encode('utf-8'))
    # CSVデータを書き込み
    csv_string = df.to_csv(index=False, encoding='utf-8', na_rep='')
    output.write(csv_string.encode('utf-8'))
    output.seek(0)
    
    # config.jsonから課題名を取得
    assignment_config_path = os.path.join(assignment_base_path, 'config.json')
    assignment_name = assignment_id
    if os.path.exists(assignment_config_path):
        with open(assignment_config_path, 'r') as f:
            config = json.load(f)
            assignment_name = config.get('name', assignment_id)
    
    # 日本語のファイル名を適切にエンコード
    filename = f'フィードバック_{assignment_name}_{datetime.now().strftime("%Y%m%d")}.csv'
    # RFC 2231形式でエンコード
    import urllib.parse
    encoded_filename = urllib.parse.quote(filename.encode('utf-8'))
    
    # レスポンスを作成
    response = Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}",
            'Content-Type': 'text/csv; charset=utf-8'
        }
    )
    
    return response

# CSVエクスポートAPI（後方互換性のため残す）
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

# 課題アップロードAPI
@app.route('/api/assignments/upload', methods=['POST'])
def upload_assignment():
    """
    新しい課題をアップロード
    必要なファイル:
    - zip_file: 学生の提出ファイル（ZIPアーカイブ）
    - csv_file: 学生リスト（CSVファイル）
    - assignment_name: 課題の表示名
    """
    try:
        # ファイルの確認
        if 'zip_file' not in request.files or 'csv_file' not in request.files:
            return jsonify({'error': 'ZIPファイルとCSVファイルの両方が必要です'}), 400
        
        zip_file = request.files['zip_file']
        csv_file = request.files['csv_file']
        assignment_name = request.form.get('assignment_name', '')
        source_file_name = request.form.get('source_file_name', '')
        
        if not assignment_name:
            return jsonify({'error': '課題名を入力してください'}), 400
        
        if not source_file_name:
            return jsonify({'error': 'ソースファイル名を入力してください'}), 400
        
        # 課題IDの生成（タイムスタンプベース）
        assignment_id = f"assignment_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # 保存先ディレクトリの作成
        assignment_dir = os.path.join(PROJECT_ROOT, 'backend', 'data', assignment_id)
        os.makedirs(assignment_dir, exist_ok=True)
        
        # 一時ディレクトリを使用してファイルを処理
        with tempfile.TemporaryDirectory() as temp_dir:
            # CSVファイルの処理
            csv_path = os.path.join(temp_dir, 'list_original.csv')
            csv_file.save(csv_path)
            
            # CSVの読み込みとバリデーション
            try:
                df = pd.read_csv(csv_path, encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    df = pd.read_csv(csv_path, encoding='shift_jis')
                except:
                    df = pd.read_csv(csv_path, encoding='cp932')
            
            # 必要なカラムの確認
            required_columns = ['広大ID', 'フルネーム', 'ステータス']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                return jsonify({
                    'error': f'CSVファイルに必要な列がありません: {", ".join(missing_columns)}'
                }), 400
            
            # CSVファイルを保存
            # オリジナルを保存
            shutil.copy(csv_path, os.path.join(assignment_dir, 'list_original.csv'))
            # システム用のコピーを作成
            df.to_csv(os.path.join(assignment_dir, 'list.csv'), index=False, encoding='utf-8-sig')
            
            # フィードバック用CSVの初期化
            if 'フィードバックコメント' not in df.columns:
                df['フィードバックコメント'] = ''
            df.to_csv(os.path.join(assignment_dir, 'list_feedback.csv'), index=False, encoding='utf-8-sig')
            
            # レビューステータスファイルの初期化
            with open(os.path.join(assignment_dir, 'review_status.json'), 'w') as f:
                json.dump({}, f)
            
            # 自動チェック結果ファイルの初期化
            with open(os.path.join(assignment_dir, 'auto_check_results.json'), 'w') as f:
                json.dump({}, f)
            
            # ZIPファイルの処理
            zip_path = os.path.join(temp_dir, 'submissions.zip')
            zip_file.save(zip_path)
            
            # 提出ファイル用ディレクトリの作成
            submissions_dir = os.path.join(assignment_dir, 'submissions')
            os.makedirs(submissions_dir, exist_ok=True)
            
            # ZIPファイルの展開
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    # ZIPファイル内のファイルリストを取得
                    file_list = zip_ref.namelist()
                    
                    # 安全な展開（パストラバーサル攻撃を防ぐ）
                    for file_info in zip_ref.infolist():
                        # ファイル名を安全にする
                        file_name = file_info.filename
                        
                        # ディレクトリの場合はスキップ
                        if file_name.endswith('/'):
                            continue
                        
                        # パスの正規化
                        safe_path = os.path.normpath(file_name)
                        if safe_path.startswith('..') or safe_path.startswith('/'):
                            continue
                        
                        # ファイルを展開
                        target_path = os.path.join(submissions_dir, safe_path)
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        
                        with zip_ref.open(file_info) as source, open(target_path, 'wb') as target:
                            shutil.copyfileobj(source, target)
                    
                    # 展開されたファイル数を記録
                    extracted_files = len([f for f in file_list if not f.endswith('/')])
                    
            except zipfile.BadZipFile:
                # エラー時はディレクトリを削除
                shutil.rmtree(assignment_dir)
                return jsonify({'error': '無効なZIPファイルです'}), 400
            except Exception as e:
                # エラー時はディレクトリを削除
                shutil.rmtree(assignment_dir)
                return jsonify({'error': f'ZIPファイルの展開中にエラーが発生しました: {str(e)}'}), 500
        
        # 課題設定ファイルの作成
        config = {
            'id': assignment_id,
            'name': assignment_name,
            'source_file_name': source_file_name,  # ファイル名のベース部分を保存
            'created_at': datetime.now().isoformat(),
            'submission_dir': 'submissions',
            'total_students': len(df),
            'extracted_files': extracted_files
        }
        
        with open(os.path.join(assignment_dir, 'config.json'), 'w') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'success': True,
            'assignment_id': assignment_id,
            'assignment_name': assignment_name,
            'total_students': len(df),
            'extracted_files': extracted_files,
            'message': f'課題「{assignment_name}」がアップロードされました'
        })
        
    except Exception as e:
        return jsonify({'error': f'アップロード処理中にエラーが発生しました: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)