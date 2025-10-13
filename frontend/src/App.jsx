import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Routes, Route, NavLink, useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

// 学生リストコンポーネント
const StudentList = ({ students, unsavedFeedbacks }) => {
    // ステータスに応じて絵文字を返すヘルパー関数
    const getStatusIcon = (s) => {
        // レビュー済みフラグをチェック
        if (s['レビュー済み'] === '1') return '✅'; // レビュー済み
        if (s.auto_feedback) return '⚠️'; // 自動指摘あり
        return '📝'; // 要レビュー
    };

    // studentsがnullまたは配列でない場合の処理
    if (!students || !Array.isArray(students)) {
        return <div>読み込み中...</div>;
    }

    return (
        <ul>
            {students.map(s => (
                <li key={s['広大ID']}>
                    <NavLink to={`/student/${s['広大ID']}`}>
                        {getStatusIcon(s)} {s['フルネーム']}
                    </NavLink>
                    {unsavedFeedbacks && unsavedFeedbacks[s['広大ID']] && (
                        <span style={{ color: '#ff6b00', fontSize: '12px', marginLeft: '10px' }}>
                            (未保存)
                        </span>
                    )}
                </li>
            ))}
        </ul>
    );
};

// 採点画面コンポーネント
const GradingView = ({ students, setStudents, unsavedFeedbacks, setUnsavedFeedbacks }) => {
    const { hirodaiID } = useParams();
    const navigate = useNavigate();
    const [details, setDetails] = useState(null);
    const [feedback, setFeedback] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // 現在の学生のインデックスを取得
    const currentIndex = students.findIndex(s => s['広大ID'] === hirodaiID);
    const hasNext = currentIndex < students.length - 1;
    const hasPrev = currentIndex > 0;

    // 次の学生へ移動
    const goToNext = useCallback(() => {
        if (hasNext) {
            const nextStudent = students[currentIndex + 1];
            navigate(`/student/${nextStudent['広大ID']}`);
        }
    }, [hasNext, currentIndex, students, navigate]);

    // 前の学生へ移動
    const goToPrev = useCallback(() => {
        if (hasPrev) {
            const prevStudent = students[currentIndex - 1];
            navigate(`/student/${prevStudent['広大ID']}`);
        }
    }, [hasPrev, currentIndex, students, navigate]);

    useEffect(() => {
        // 前の画面のデータをクリアしない（isLoadingを最初からtrueにしない）
        if (!details) {
            setIsLoading(true);
        }

        // 未保存のフィードバックがあればそれを使用
        const unsavedFeedback = unsavedFeedbacks[hirodaiID];
        if (unsavedFeedback !== undefined) {
            setFeedback(unsavedFeedback);
        }

        axios.get(`/api/student/${hirodaiID}`)
            .then(res => {
                setDetails(res.data);
                if (res.data && res.data.student && unsavedFeedback === undefined) {
                    // 未保存のフィードバックがない場合のみAPIから取得
                    const existingFeedback = res.data.student['フィードバックコメント'];
                    const autoFeedback = res.data.student.auto_feedback;
                    setFeedback(existingFeedback || autoFeedback || '');
                }
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch student details:', err);
                setIsLoading(false);
            });
    }, [hirodaiID]);

    // フィードバックが変更されたときに未保存状態を更新（デバウンス処理）
    useEffect(() => {
        const timer = setTimeout(() => {
            if (details && details.student) {
                const originalFeedback = details.student['フィードバックコメント'] || details.student.auto_feedback || '';
                if (feedback !== originalFeedback) {
                    setUnsavedFeedbacks(prev => ({
                        ...prev,
                        [hirodaiID]: feedback
                    }));
                } else {
                    // 元に戻った場合は未保存状態を削除
                    setUnsavedFeedbacks(prev => {
                        const newState = { ...prev };
                        delete newState[hirodaiID];
                        return newState;
                    });
                }
            }
        }, 500); // 500ms待ってから更新

        return () => clearTimeout(timer);
    }, [feedback, hirodaiID]); // 必要最小限の依存配列

    const handleSave = useCallback(() => {
        // 空欄でも保存（レビュー完了扱い）
        const feedbackToSave = feedback || '';
        axios.post(`/api/student/${hirodaiID}/feedback`, { feedback: feedbackToSave })
            .then(() => {
                // 未保存状態をクリア
                setUnsavedFeedbacks(prev => {
                    const newState = { ...prev };
                    delete newState[hirodaiID];
                    return newState;
                });
                // detailsの状態を更新
                setDetails(prev => ({
                    ...prev,
                    student: {
                        ...prev.student,
                        'フィードバックコメント': feedbackToSave,
                        'レビュー済み': '1'
                    }
                }));
                // 学生リストも更新
                setStudents(prevStudents =>
                    prevStudents.map(s =>
                        s['広大ID'] === hirodaiID
                            ? { ...s, 'フィードバックコメント': feedbackToSave, 'レビュー済み': '1' }
                            : s
                    )
                );
            });
    }, [feedback, hirodaiID, setUnsavedFeedbacks, setStudents]);

    const handleSaveAndNext = useCallback(() => {
        // 空欄でも保存（レビュー完了扱い）
        const feedbackToSave = feedback || '';
        axios.post(`/api/student/${hirodaiID}/feedback`, { feedback: feedbackToSave })
            .then(() => {
                // 未保存状態をクリア
                setUnsavedFeedbacks(prev => {
                    const newState = { ...prev };
                    delete newState[hirodaiID];
                    return newState;
                });
                // 学生リストも更新
                setStudents(prevStudents =>
                    prevStudents.map(s =>
                        s['広大ID'] === hirodaiID
                            ? { ...s, 'フィードバックコメント': feedbackToSave, 'レビュー済み': '1' }
                            : s
                    )
                );
                // 次の学生へ自動的に移動（最後の学生の場合は一覧に戻る）
                if (hasNext) {
                    goToNext();
                } else {
                    navigate('/grading');
                }
            });
    }, [feedback, hirodaiID, hasNext, goToNext, navigate, setUnsavedFeedbacks, setStudents]);

    // キーボードショートカットの実装
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ctrl+S または Cmd+S で保存
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
            // Ctrl+Enter または Cmd+Enter で保存して次へ
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSaveAndNext();
            }
            // Cmd+← で前の学生へ
            if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
                e.preventDefault();
                goToPrev();
            }
            // Cmd+→ で次の学生へ
            if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
                e.preventDefault();
                goToNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToPrev, goToNext, handleSave, handleSaveAndNext]);

    // 初回読み込み時のみ「読み込み中」を表示
    if (isLoading && !details) return <div>読み込み中...</div>;
    if (!details || !details.student) return <div>学生データが見つかりません</div>;

    const studentData = details.student;
    const isReviewed = studentData['レビュー済み'] === '1';
    const hasAutoFeedback = studentData.auto_feedback && !isReviewed;
    const originalFeedback = studentData['フィードバックコメント'] || '';
    const autoFeedback = studentData.auto_feedback || '';
    // 自動フィードバックが初期値として設定されている場合も考慮
    const hasUnsavedChanges = isReviewed
        ? feedback !== originalFeedback  // レビュー済みの場合は保存済みフィードバックと比較
        : (feedback !== originalFeedback && feedback !== autoFeedback); // 未レビューの場合は両方と比較

    return (
        <div>
            <h2>{studentData['フルネーム']} ({studentData['広大ID']})</h2>

            {/* 提出ファイル一覧 */}
            {details.files && details.files.length > 0 && (
                <div style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', marginBottom: '10px' }}>
                    <strong>提出ファイル:</strong> {
                        details.files.map((file, index) => {
                            const expectedFiles = [
                                `${details.assignment_name}.c`,
                                `${details.assignment_name}-test-history.txt`
                            ];
                            const isExpected = expectedFiles.includes(file);
                            return (
                                <span key={file}>
                                    {index > 0 && ', '}
                                    <span style={{ color: isExpected ? 'green' : 'red' }}>
                                        {isExpected ? '○' : '×'}
                                    </span>
                                    {file}
                                </span>
                            );
                        })
                    }
                </div>
            )}

            <div className="code-view">
                <div className="code-panel">
                    <h4>{details.assignment_name || 'assignment'}.c</h4>
                    <pre>{details.source_code}</pre>
                </div>
                <div className="code-panel">
                    <h4>{details.assignment_name || 'assignment'}-test-history.txt</h4>
                    <pre>{details.test_history}</pre>
                </div>
            </div>


            <h4 style={{ marginBottom: '8px' }}>
                フィードバックコメント
                {isReviewed && <span style={{ color: 'green' }}>(レビュー済み)</span>}
                {hasAutoFeedback && <span style={{ color: '#ff6b00' }}>(自動フィードバック入力済み - 保存が必要)</span>}
            </h4>
            {hasAutoFeedback && (
                <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '5px', marginBottom: '8px', border: '1px solid #ffc107' }}>
                    ⚠️ 自動チェックによるフィードバックが入力されています。内容を確認して「保存」ボタンを押してください。
                </div>
            )}
            <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                style={{
                    backgroundColor: hasUnsavedChanges ? '#fffbf0' : 'white',
                    width: '100%',
                    height: '50px',
                    resize: 'vertical'
                }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                ショートカット: {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+S (保存) / {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter (保存して次へ) / {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+←→ (前後の学生へ)
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                    onClick={handleSave}
                    style={{
                        backgroundColor: hasUnsavedChanges ? '#ff6b00' : '#007bff',
                        fontWeight: hasUnsavedChanges ? 'bold' : 'normal',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    {hasUnsavedChanges ? 'レビュー完了にする' : (isReviewed ? 'レビュー更新' : 'レビュー完了')}
                </button>
                <button onClick={goToPrev} disabled={!hasPrev}>← 前へ</button>
                <button onClick={goToNext} disabled={!hasNext}>次へ →</button>
            </div>
        </div>
    );
};

// トップページコンポーネント
const HomePage = ({ students }) => {
    const [exporting, setExporting] = useState(false);

    // CSVエクスポート機能
    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await axios.get('/api/export/csv', {
                responseType: 'blob'
            });

            // ダウンロードリンクを作成
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `feedback_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            alert('CSVファイルをダウンロードしました');
        } catch (error) {
            console.error('Export failed:', error);
            alert('エクスポートに失敗しました');
        } finally {
            setExporting(false);
        }
    };

    // 統計情報を計算
    const stats = {
        total: students.length,
        reviewed: students.filter(s => s['レビュー済み'] === '1').length,
        needsReview: students.filter(s => s['レビュー済み'] !== '1' && s.auto_feedback).length,
        pending: students.filter(s => s['レビュー済み'] !== '1' && !s.auto_feedback).length
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>レビュー記入アプリ</h1>

            <div style={{ background: '#f0f0f0', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h2>レビュー管理</h2>
                <p>総提出数: {stats.total}人</p>
                <p>✅ レビュー済み: {stats.reviewed}人</p>
                <p>⚠️ 自動指摘あり: {stats.needsReview}人</p>
                <p>📝 未レビュー: {stats.pending}人</p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <Link to="/grading">
                    <button style={{ padding: '10px 20px', fontSize: '16px' }}>
                        採点を開始
                    </button>
                </Link>
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    style={{ padding: '10px 20px', fontSize: '16px' }}
                >
                    {exporting ? 'エクスポート中...' : 'CSVエクスポート'}
                </button>
            </div>
        </div>
    );
};

// メインアプリケーション
function App() {
    const [students, setStudents] = useState([]);
    const [unsavedFeedbacks, setUnsavedFeedbacks] = useState({}); // 未保存のフィードバックを管理

    useEffect(() => {
        axios.get('/api/students')
            .then(res => setStudents(res.data))
            .catch(err => {
                console.error('Failed to fetch students:', err);
                setStudents([]);
            });
    }, []);

    return (
        <Routes>
            <Route path="/" element={<HomePage students={students} />} />
            <Route path="/grading" element={
                <div className="app-container">
                    <div className="sidebar">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3>提出済み学生 ({students.length}人)</h3>
                            <Link to="/">
                                <button style={{ padding: '5px 10px' }}>ホーム</button>
                            </Link>
                        </div>
                        <StudentList students={students} unsavedFeedbacks={unsavedFeedbacks} />
                    </div>
                    <main className="main-content">
                        <h3>学生を選択してください</h3>
                    </main>
                </div>
            } />
            <Route path="/student/:hirodaiID" element={
                <div className="app-container">
                    <div className="sidebar">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3>提出済み学生 ({students.length}人)</h3>
                            <Link to="/">
                                <button style={{ padding: '5px 10px' }}>ホーム</button>
                            </Link>
                        </div>
                        <StudentList students={students} unsavedFeedbacks={unsavedFeedbacks} />
                    </div>
                    <main className="main-content">
                        <GradingView students={students} setStudents={setStudents} unsavedFeedbacks={unsavedFeedbacks} setUnsavedFeedbacks={setUnsavedFeedbacks} />
                    </main>
                </div>
            } />
        </Routes>
    );
}

export default App;