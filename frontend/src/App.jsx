import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Routes, Route, NavLink, useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import '@freee_jp/vibes/css';
import { 
    Button,
    TextArea,
    Container,
    Note,
    GlobalNavi,
    DropdownButton
} from '@freee_jp/vibes';
import { 
    FaDownload, 
    FaSearch, 
    FaEdit, 
    FaCheck, 
    FaSave,
    FaRedo,
    FaChevronLeft,
    FaChevronRight,
    FaPencilAlt,
    FaClock
} from 'react-icons/fa';

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
                        <span style={{ color: '#ff6b00', fontSize: '12px', marginLeft: '10px' }}>(未保存)</span>
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
                    setFeedback(existingFeedback || '');
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
                const originalFeedback = details.student['フィードバックコメント'] || '';
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
    const originalFeedback = studentData['フィードバックコメント'] || '';
    const hasUnsavedChanges = feedback !== originalFeedback;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                <h2 style={{ margin: 0 }}>{studentData['フルネーム']} ({studentData['広大ID']})</h2>
                
                {/* 提出ファイル一覧 */}
                {details.files && details.files.length > 0 && (
                    <div style={{ background: '#f0f8ff', padding: '6px 10px', borderRadius: '4px', fontSize: '14px', border: '1px solid #d0e5ff' }}>
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
            </div>

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


            {details.auto_check_result && details.auto_check_result !== '' && (
                <Note type="info">
                    <div style={{ backgroundColor: '#fff3cd', padding: '12px', borderRadius: '4px', border: '1px solid #ffc107' }}>
                        <strong style={{ color: '#856404' }}>🔍 自動チェック結果</strong>
                        <div style={{ marginTop: '8px', color: '#333' }}>{details.auto_check_result}</div>
                        <Button
                            onClick={() => {
                                if (feedback && feedback.trim() !== '') {
                                    const confirmed = window.confirm(
                                        '既存のフィードバックが入力されています。\n' +
                                        '自動チェック結果で上書きしますか？'
                                    );
                                    if (!confirmed) return;
                                }
                                setFeedback(details.auto_check_result);
                            }}
                            small
                            mt={0.5}
                            appearance="secondary"
                        >
                            <FaPencilAlt /> この内容でフィードバックを入力
                        </Button>
                    </div>
                </Note>
            )}

            <h4 style={{ marginBottom: '8px' }}>
                フィードバックコメント
                {isReviewed && <span style={{ color: 'green', marginLeft: '8px' }}>(レビュー済み)</span>}
            </h4>
            <TextArea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                style={{
                    backgroundColor: hasUnsavedChanges ? '#fffbf0' : 'white'
                }}
                rows={3}
                width="full"
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                ショートカット: {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+S (保存) / {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter (保存して次へ) / {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+←→ (前後の学生へ)
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <Button
                    onClick={handleSave}
                    appearance="primary"
                    className={hasUnsavedChanges ? 'save-button-unsaved' : (isReviewed ? 'save-button-reviewed' : 'save-button-new')}
                    style={hasUnsavedChanges ? {
                        backgroundColor: '#ff6b00',
                        borderColor: '#ff6b00',
                        color: 'white',
                        fontWeight: 'bold',
                        boxShadow: '0 3px 6px rgba(255, 107, 0, 0.3)'
                    } : {
                        backgroundColor: isReviewed ? '#28a745' : '#0066cc',
                        borderColor: isReviewed ? '#28a745' : '#0066cc',
                        color: 'white',
                        boxShadow: isReviewed ? '0 2px 4px rgba(40, 167, 69, 0.3)' : '0 2px 4px rgba(0, 102, 204, 0.3)'
                    }}
                >
                    {hasUnsavedChanges ? <><FaSave /> レビュー完了にする</> : (isReviewed ? <><FaRedo /> レビュー更新</> : <><FaCheck /> レビュー完了</>)}
                </Button>
                <Button onClick={goToPrev} disabled={!hasPrev} appearance="secondary"><FaChevronLeft /> 前の学生</Button>
                <Button onClick={goToNext} disabled={!hasNext} appearance="secondary">次の学生 <FaChevronRight /></Button>
            </div>
        </div>
    );
};

// トップページコンポーネント
const HomePage = ({ students, setStudents }) => {
    const [exporting, setExporting] = useState(false);
    const [checkingAll, setCheckingAll] = useState(false);
    const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
    const [autoCheckStatus, setAutoCheckStatus] = useState(null);

    // コンポーネントマウント時に自動チェックステータスを確認
    useEffect(() => {
        axios.get('/api/auto-check-status')
            .then(res => {
                setAutoCheckStatus(res.data);
            })
            .catch(err => {
                console.error('Failed to fetch auto-check status:', err);
            });
    }, []);

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

    // 全学生自動チェック機能
    const handleAutoCheckAll = async () => {
        const confirmed = window.confirm(
            '全学生の自動チェックを実行します。\nレビュー済みの学生はスキップされます。\n続行しますか？'
        );
        if (!confirmed) return;

        setCheckingAll(true);
        setCheckProgress({ current: 0, total: 0 });
        
        try {
            const response = await axios.post('/api/auto-check-all');
            const result = response.data;
            
            // 学生リストを更新
            const updatedStudents = await axios.get('/api/students');
            setStudents(updatedStudents.data);
            
            // 自動チェックステータスを更新
            const statusResponse = await axios.get('/api/auto-check-status');
            setAutoCheckStatus(statusResponse.data);
            
            alert(`自動チェックが完了しました。\n\n` +
                  `チェック対象: ${result.checked}人\n` +
                  `問題あり: ${result.issues_found}人\n` +
                  `スキップ（レビュー済み）: ${result.skipped}人`);
        } catch (error) {
            console.error('Auto-check all failed:', error);
            alert('全学生の自動チェックに失敗しました。');
        } finally {
            setCheckingAll(false);
            setCheckProgress({ current: 0, total: 0 });
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
        <Container width="full">
            <div style={{ padding: '20px' }}>
                <h1>レビュー記入アプリ</h1>

                <div style={{ background: '#e8f4ff', padding: '1.5rem', borderRadius: '8px', marginBottom: '20px', border: '1px solid #b8deff' }}>
                    <h2>レビュー管理</h2>
                    <p>総提出数: <strong>{stats.total}人</strong></p>
                    <p style={{ color: 'green' }}>✅ レビュー済み: {stats.reviewed}人</p>
                    <p style={{ color: 'orange' }}>⚠️ 自動指摘あり: {stats.needsReview}人</p>
                    <p>📝 未レビュー: {stats.pending}人</p>
                </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <Link to="/grading">
                    <Button appearance="primary" large>
                        <><FaEdit /> 採点を開始</>
                    </Button>
                </Link>
                {autoCheckStatus && autoCheckStatus.checked ? (
                    <Button
                        disabled={true}
                        appearance="secondary"
                        large
                    >
                        ✅ この課題では自動チェック済みです
                    </Button>
                ) : (
                    <Button
                        onClick={handleAutoCheckAll}
                        disabled={checkingAll}
                        appearance="primary"
                        large
                    >
                        {checkingAll ? <><FaClock /> チェック中... ({checkProgress.current}/{checkProgress.total})</> : <><FaSearch /> 全学生を自動チェック</>}
                    </Button>
                )}
                <Button
                    onClick={handleExport}
                    disabled={exporting}
                    appearance="secondary"
                    large
                >
                    {exporting ? <><FaClock /> エクスポート中...</> : <><FaDownload /> CSVダウンロード</>}
                </Button>
            </div>
            </div>
        </Container>
    );
};

// メインアプリケーション
function App() {
    const [students, setStudents] = useState([]);
    const [unsavedFeedbacks, setUnsavedFeedbacks] = useState({}); // 未保存のフィードバックを管理
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        axios.get('/api/students')
            .then(res => setStudents(res.data))
            .catch(err => {
                console.error('Failed to fetch students:', err);
                setStudents([]);
            });
    }, []);

    // グローバルナビのリンク設定
    const globalNavLinks = [
        {
            title: 'ホーム',
            url: '/',
            current: location.pathname === '/'
        },
        {
            title: '採点',
            url: '/grading',
            current: location.pathname.startsWith('/grading') || location.pathname.startsWith('/student')
        }
    ];

    // 課題選択ドロップダウン
    const AssignmentDropdown = () => {
        const dropdownContents = [
            { type: 'selectable', text: '課題1: 基礎プログラミング', onClick: () => navigate('/assignment/assignment1') },
            { type: 'selectable', text: '課題2: 配列と文字列', onClick: () => navigate('/assignment/assignment2') },
            { type: 'selectable', text: '課題3: 関数とポインタ', onClick: () => navigate('/assignment/assignment3') },
            { type: 'selectable', text: '課題4: 構造体', onClick: () => navigate('/assignment/assignment4') },
        ];

        return (
            <DropdownButton
                buttonLabel="課題選択"
                dropdownContents={dropdownContents}
                appearance="tertiary"
                small
            />
        );
    };

    return (
        <>
            <GlobalNavi
                links={globalNavLinks}
                hideHelpForm={true}
                sectionNode={<AssignmentDropdown />}
            />
            <div>
                <Routes>
                    <Route path="/" element={<HomePage students={students} setStudents={setStudents} />} />
                    <Route path="/grading" element={
                        <div className="app-container">
                            <div className="sidebar">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <h3>提出済み学生 ({students.length}人)</h3>
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
                                </div>
                                <StudentList students={students} unsavedFeedbacks={unsavedFeedbacks} />
                            </div>
                            <main className="main-content">
                                <GradingView students={students} setStudents={setStudents} unsavedFeedbacks={unsavedFeedbacks} setUnsavedFeedbacks={setUnsavedFeedbacks} />
                            </main>
                        </div>
                    } />
                    <Route path="/assignment/:assignmentId" element={
                        <Container width="full">
                            <div style={{ padding: '20px' }}>
                                <h2>課題レビュー（開発中）</h2>
                                <p>この機能は現在開発中です。</p>
                                <Link to="/">
                                    <Button appearance="secondary">ホームに戻る</Button>
                                </Link>
                            </div>
                        </Container>
                    } />
                </Routes>
            </div>
        </>
    );
}

export default App;