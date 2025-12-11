import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import '@freee_jp/vibes/css';
import {
    Button,
    TextArea,
    Container,
    Note,
    GlobalNavi,
    PageTitle
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
    FaClock,
    FaCloudUploadAlt
} from 'react-icons/fa';
import StudentListPage from './StudentListPage';
import StudentDetailPage from './StudentDetailPage';
import AssignmentUpload from './AssignmentUpload';

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
const HomePage = ({ assignments }) => {
    const navigate = useNavigate();

    return (
        <Container width="full">
            <div style={{ padding: '20px' }}>
                {/* 課題一覧カード */}
                <div style={{ marginBottom: '30px' }}>
                    <h2>📚 課題一覧</h2>
                    <p style={{ color: '#666', marginBottom: '20px' }}>
                        課題を選択して学生のレビューを開始してください。上のナビゲーションバーからも直接アクセスできます。
                    </p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '20px',
                        marginBottom: '30px'
                    }}>
                        {assignments.length > 0 ? assignments.map(assignment => (
                            <div
                                key={assignment.id}
                                onClick={() => navigate(`/assignments/${assignment.id}`)}
                                style={{
                                    background: '#ffffff',
                                    border: '2px solid #e0e0e0',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                                    e.currentTarget.style.borderColor = '#0066cc';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                    e.currentTarget.style.borderColor = '#e0e0e0';
                                }}
                            >
                                <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>
                                    📂 {assignment.name}
                                </h3>
                                <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                                    クリックして学生一覧を見る →
                                </p>
                            </div>
                        )) : (
                            <div style={{
                                background: '#f8f9fa',
                                borderRadius: '12px',
                                padding: '40px',
                                textAlign: 'center',
                                color: '#666'
                            }}>
                                <p>課題データを読み込み中...</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 課題アップロードセクション */}
                <div style={{ marginTop: '40px', paddingTop: '40px', borderTop: '2px solid #e0e0e0' }}>
                    <h2>📤 新しい課題をアップロード</h2>
                    <p style={{ color: '#666', marginBottom: '20px' }}>
                        新しい課題データをアップロードして、レビューを開始できます。
                    </p>
                    <div style={{ textAlign: 'center', padding: '30px 0' }}>
                        <Button 
                            appearance="primary" 
                            size="large"
                            onClick={() => navigate('/assignments/upload')}
                            style={{
                                padding: '15px 40px',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px rgba(0,102,204,0.3)',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,102,204,0.4)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,102,204,0.3)';
                            }}
                        >
                            <FaCloudUploadAlt style={{ marginRight: '10px', fontSize: '20px' }} />
                            新しい課題をアップロード
                        </Button>
                    </div>
                    <div style={{ marginTop: '20px', padding: '15px', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 必要なファイル形式</h4>
                        <ul style={{ margin: '0', paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
                            <li>学生リストCSV（必須列: 広大ID, フルネーム, ステータス）</li>
                            <li>提出ファイルのZIPアーカイブ</li>
                        </ul>
                    </div>
                </div>
            </div>
        </Container>
    );
};

// メインアプリケーション
function App() {
    const [students, setStudents] = useState([]);
    const [unsavedFeedbacks, setUnsavedFeedbacks] = useState({}); // 未保存のフィードバックを管理
    const [assignments, setAssignments] = useState([]); // 課題一覧
    const [reviewStats, setReviewStats] = useState({}); // 各課題のレビュー率
    const location = useLocation();

    useEffect(() => {
        console.log('App mounted');
        // 課題一覧を取得
        axios.get('/api/assignments')
            .then(res => {
                console.log('Assignments loaded:', res.data);
                setAssignments(res.data);
                
                // 各課題のレビュー率を取得
                res.data.forEach(assignment => {
                    axios.get(`/api/assignments/${assignment.id}/students`)
                        .then(studentsRes => {
                            const totalStudents = studentsRes.data.length;
                            const reviewedStudents = studentsRes.data.filter(s => s['レビュー済み'] === '1').length;
                            const percentage = totalStudents > 0 ? Math.round((reviewedStudents / totalStudents) * 100) : 0;
                            
                            setReviewStats(prev => ({
                                ...prev,
                                [assignment.id]: {
                                    reviewed: reviewedStudents,
                                    total: totalStudents,
                                    percentage
                                }
                            }));
                        })
                        .catch(err => {
                            console.error(`Failed to fetch students for ${assignment.id}:`, err);
                        });
                });
            })
            .catch(err => {
                console.error('Failed to fetch assignments:', err);
                setAssignments([]);
            });

        // 学生一覧を取得（後方互換性のため）
        axios.get('/api/students')
            .then(res => setStudents(res.data))
            .catch(err => {
                console.error('Failed to fetch students:', err);
                setStudents([]);
            });
    }, []);


    // グローバルナビのリンク設定（空の配列）
    const globalNavLinks = [];


    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', borderBottom: '1px solid #e0e0e0', paddingBottom: '10px', marginBottom: '20px' }}>
                <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <PageTitle mt={1} style={{ cursor: 'pointer' }}>TAレビューシステム</PageTitle>
                </Link>
            </div>
            <div>
                <Routes>
                    <Route path="/" element={<HomePage assignments={assignments} />} />
                    <Route path="/assignments/upload" element={<AssignmentUpload />} />
                    <Route path="/assignments/:assignmentId" element={<StudentListPage />} />
                    <Route path="/assignments/:assignmentId/students/:studentId" element={<StudentDetailPage />} />
                    {/* 互換性のために古いルートも残す */}
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
                </Routes>
            </div>
        </>
    );
}

export default App;