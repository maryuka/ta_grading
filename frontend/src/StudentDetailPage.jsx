import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFilter } from './contexts/FilterContext';
import axios from 'axios';
import { 
    Button,
    TextArea,
    Note,
    Breadcrumbs,
    Stack,
    Text,
    Loading,
    Message
} from '@freee_jp/vibes';
import { 
    FaSave,
    FaRedo,
    FaCheck,
    FaChevronLeft,
    FaChevronRight,
    FaPencilAlt,
    FaList,
    FaFileCode,
    FaHistory
} from 'react-icons/fa';
import { highlightCCode, checkIndentConsistency } from './utils/syntaxHighlight';
import './StudentDetail.css';
import './prism-theme.css';

const StudentDetailPage = () => {
    const { assignmentId, studentId } = useParams();
    const navigate = useNavigate();
    const { filterState } = useFilter();
    const [details, setDetails] = useState(null);
    const [feedback, setFeedback] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [originalFeedback, setOriginalFeedback] = useState('');
    const [assignmentInfo, setAssignmentInfo] = useState(null);
    const [showWhitespace, setShowWhitespace] = useState(false); // 常にfalse（インデント非表示）
    const [formatData, setFormatData] = useState(null);
    const [isLoadingFormat, setIsLoadingFormat] = useState(false);
    const originalCodeRef = useRef(null);
    const formattedCodeRef = useRef(null);
    
    // 課題情報と学生リストを取得
    useEffect(() => {
        // 課題情報を取得
        axios.get('/api/assignments')
            .then(res => {
                const assignment = res.data.find(a => a.id === assignmentId);
                setAssignmentInfo(assignment);
            })
            .catch(err => console.error('Failed to fetch assignment info:', err));
        
        // 学生リストを取得（前後の学生への移動用）
        axios.get(`/api/assignments/${assignmentId}/students`)
            .then(res => {
                const allStudents = res.data || [];
                setStudents(allStudents);
                
                // フィルター状態を適用
                if (filterState.assignmentId === assignmentId && filterState.filteredStudentIds.length > 0) {
                    // フィルターされた学生IDの順序を保持
                    const filtered = filterState.filteredStudentIds
                        .map(id => allStudents.find(s => s['広大ID'] === id))
                        .filter(Boolean);
                    setFilteredStudents(filtered);
                } else {
                    setFilteredStudents(allStudents);
                }
            })
            .catch(err => console.error('Failed to fetch students:', err));
    }, [assignmentId, filterState]);
    
    // 現在の学生のインデックスを取得（フィルターされたリストから）
    const currentIndex = filteredStudents.findIndex(s => s['広大ID'] === studentId);
    const hasNext = currentIndex < filteredStudents.length - 1 && currentIndex !== -1;
    const hasPrev = currentIndex > 0;
    
    // 次の学生へ移動
    const goToNext = useCallback(() => {
        if (hasNext) {
            const nextStudent = filteredStudents[currentIndex + 1];
            navigate(`/assignments/${assignmentId}/students/${nextStudent['広大ID']}`);
        }
    }, [hasNext, currentIndex, filteredStudents, navigate, assignmentId]);
    
    // 前の学生へ移動
    const goToPrev = useCallback(() => {
        if (hasPrev) {
            const prevStudent = filteredStudents[currentIndex - 1];
            navigate(`/assignments/${assignmentId}/students/${prevStudent['広大ID']}`);
        }
    }, [hasPrev, currentIndex, filteredStudents, navigate, assignmentId]);
    
    // 学生詳細を取得
    useEffect(() => {
        setIsLoading(true);
        axios.get(`/api/assignments/${assignmentId}/students/${studentId}`)
            .then(res => {
                setDetails(res.data);
                const existingFeedback = res.data?.student?.['フィードバックコメント'] || '';
                setFeedback(existingFeedback);
                setOriginalFeedback(existingFeedback);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch student details:', err);
                setIsLoading(false);
            });
    }, [studentId, assignmentId]);
    
    // フォーマットデータを取得
    useEffect(() => {
        if (details && details.source_code) {
            setIsLoadingFormat(true);
            axios.get(`/api/assignments/${assignmentId}/students/${studentId}/format`)
                .then(res => {
                    setFormatData(res.data);
                    setIsLoadingFormat(false);
                })
                .catch(err => {
                    console.error('Failed to fetch format data:', err);
                    setIsLoadingFormat(false);
                });
        }
    }, [studentId, assignmentId, details]);
    
    // スクロール同期のハンドラー
    const handleOriginalScroll = useCallback(() => {
        if (originalCodeRef.current && formattedCodeRef.current) {
            formattedCodeRef.current.scrollTop = originalCodeRef.current.scrollTop;
            formattedCodeRef.current.scrollLeft = originalCodeRef.current.scrollLeft;
        }
    }, []);
    
    const handleFormattedScroll = useCallback(() => {
        if (originalCodeRef.current && formattedCodeRef.current) {
            originalCodeRef.current.scrollTop = formattedCodeRef.current.scrollTop;
            originalCodeRef.current.scrollLeft = formattedCodeRef.current.scrollLeft;
        }
    }, []);
    
    // フィードバックの保存
    const handleSave = useCallback(() => {
        const feedbackToSave = feedback || '';
        axios.post(`/api/assignments/${assignmentId}/students/${studentId}/feedback`, { feedback: feedbackToSave })
            .then(() => {
                setOriginalFeedback(feedbackToSave);
                setDetails(prev => ({
                    ...prev,
                    student: {
                        ...prev.student,
                        'フィードバックコメント': feedbackToSave,
                        'レビュー済み': '1'
                    }
                }));
            })
            .catch(err => console.error('Failed to save feedback:', err));
    }, [feedback, studentId, assignmentId]);
    
    
    // キーボードショートカット
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
                e.preventDefault();
                goToPrev();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
                e.preventDefault();
                goToNext();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToPrev, goToNext, handleSave]);
    
    if (isLoading) {
        return (
            <div style={{ width: '100%', padding: '40px', textAlign: 'center' }}>
                <Loading />
            </div>
        );
    }
    
    if (!details || !details.student) {
        return (
            <div style={{ width: '100%', padding: '40px' }}>
                <Message type="error">学生データが見つかりません</Message>
            </div>
        );
    }
    
    const studentData = details.student;
    const isReviewed = studentData['レビュー済み'] === '1';
    const hasUnsavedChanges = feedback !== originalFeedback;
    
    // テスト履歴から成功判定
    const testPassed = details.test_history && details.test_history.includes('すべてのテストに成功しました');
    
    return (
        <div style={{ width: '80%', maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
            <Stack spacing={1.5}>
                    {/* パンくずリスト */}
                    <Breadcrumbs 
                        links={[
                            { title: 'ホーム', url: '/' },
                            { title: assignmentInfo ? assignmentInfo.name : assignmentId, url: `/assignments/${assignmentId}` },
                            { title: studentData['フルネーム'] }
                        ]} 
                    />
                    
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'row',
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        marginBottom: '24px',
                        paddingBottom: '16px',
                        borderBottom: '1px solid #e0e0e0',
                        width: '100%'
                    }}>
                        <h1 style={{ 
                            margin: 0, 
                            fontSize: '24px', 
                            fontWeight: 'bold',
                            color: '#333',
                            flexShrink: 0
                        }}>
                            {studentData['フルネーム']} ({studentData['広大ID']})
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginLeft: 'auto' }}>
                            {/* 提出ファイル一覧とテスト結果 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: 'auto' }}>
                                {/* テスト結果 */}
                                <div style={{
                                    background: testPassed ? '#d4edda' : '#f8d7da',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: `1px solid ${testPassed ? '#c3e6cb' : '#f5c6cb'}`,
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    color: testPassed ? '#155724' : '#721c24'
                                }}>
                                    {testPassed ? '✅ テスト成功' : '❌ テスト失敗'}
                                </div>
                                
                                {/* 提出ファイル一覧 */}
                                {details.files && details.files.length > 0 && (
                                    <div style={{ 
                                        background: '#f0f8ff', 
                                        padding: '8px 12px', 
                                        borderRadius: '4px',
                                        border: '1px solid #d0e5ff',
                                        fontSize: '14px'
                                    }}>
                                        <Text weight="bold">提出ファイル: </Text>
                                        {details.files.map((file, index) => {
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
                                        })}
                                    </div>
                                )}
                            </div>
                            <Button
                                appearance="tertiary"
                                onClick={() => navigate(`/assignments/${assignmentId}`)}
                            >
                                <FaList /> 一覧に戻る
                            </Button>
                        </div>
                    </div>
                    
                    {/* メインコンテンツ：左側にコード、右側にフィードバック */}
                    <div className="student-detail-container">
                        {/* 左側：コード表示エリア */}
                        <div className="code-display-area">
                            {/* ソースコード */}
                            <div className="code-block">
                                <div className="code-header">
                                    <FaFileCode className="file-icon" />
                                    {details.assignment_name || 'assignment'}.c
                                    {(() => {
                                        const consistency = checkIndentConsistency(details.source_code);
                                        if (!consistency.consistent) {
                                            return (
                                                <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#dc3545', fontWeight: 'normal' }}>
                                                    ⚠️ タブとスペース混在
                                                </span>
                                            );
                                        } else if (consistency.hasTab) {
                                            return (
                                                <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6c757d', fontWeight: 'normal' }}>
                                                    タブ使用
                                                </span>
                                            );
                                        } else if (consistency.hasSpace) {
                                            return (
                                                <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6c757d', fontWeight: 'normal' }}>
                                                    スペース使用
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                                <div className="code-content">
                                    <pre>
                                        <code dangerouslySetInnerHTML={{
                                            __html: highlightCCode(details.source_code, showWhitespace)
                                        }} />
                                    </pre>
                                </div>
                            </div>
                            
                            {/* テスト履歴 */}
                            <div className="code-block">
                                <div className="code-header">
                                    <FaHistory className="file-icon" />
                                    {details.assignment_name || 'assignment'}-test-history.txt
                                </div>
                                <div className="code-content">
                                    <pre>{details.test_history}</pre>
                                </div>
                            </div>
                        </div>
                        
                        {/* 右側：フィードバックエリア */}
                        <div className="feedback-area">
                            {/* 自動チェック結果 */}
                            {details.auto_check_result && details.auto_check_result !== '' && (
                                <div className="auto-check-result">
                                    <strong>
                                        🔍 自動チェック結果
                                    </strong>
                                    <div className="auto-check-content">
                                        {details.auto_check_result}
                                    </div>
                                    <Button
                                        small
                                        appearance="secondary"
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
                                        style={{ marginTop: '10px' }}
                                    >
                                        <FaPencilAlt /> この内容でフィードバックを入力
                                    </Button>
                                </div>
                            )}
                            
                            {/* フィードバック入力 */}
                            <div className="feedback-section">
                                <h4>
                                    フィードバックコメント
                                    {isReviewed && <span style={{ color: '#28a745', fontWeight: 'normal', fontSize: '14px' }}> (レビュー済み)</span>}
                                </h4>
                                {/* インデント警告の追加ボタン */}
                                <div style={{ marginBottom: '10px' }}>
                                    <Button
                                        small
                                        appearance="secondary"
                                        onClick={() => {
                                            const indentMessage = 'インデントを揃えましょう. プログラミングⅡのコース内の「自動整形のすすめ」を参考にしてください.';
                                            if (!feedback.includes(indentMessage)) {
                                                const separator = feedback.trim() ? '\n' : '';
                                                setFeedback(feedback + separator + indentMessage);
                                            }
                                        }}
                                        style={{ fontSize: '12px' }}
                                    >
                                        <FaPencilAlt /> インデント整形の注意を追加
                                    </Button>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                                        <Button
                                            small
                                            appearance="tertiary"
                                            onClick={() => {
                                                const noResubmitMessage = ' 再提出は不要です.';
                                                if (!feedback.includes(noResubmitMessage)) {
                                                    setFeedback(feedback + noResubmitMessage);
                                                }
                                            }}
                                            style={{ 
                                                fontSize: '11px',
                                                border: '1px solid #dee2e6',
                                                backgroundColor: '#ffffff'
                                            }}
                                        >
                                            + 再提出は不要です
                                        </Button>
                                        <Button
                                            small
                                            appearance="tertiary"
                                            onClick={() => {
                                                const resubmitMessage = ' 再提出しなさい.';
                                                if (!feedback.includes(resubmitMessage)) {
                                                    setFeedback(feedback + resubmitMessage);
                                                }
                                            }}
                                            style={{ 
                                                fontSize: '11px',
                                                border: '1px solid #dee2e6',
                                                backgroundColor: '#ffffff'
                                            }}
                                        >
                                            + 再提出しなさい
                                        </Button>
                                    </div>
                                </div>
                                <textarea
                                    className={`feedback-textarea ${hasUnsavedChanges ? 'has-unsaved' : ''}`}
                                    value={feedback}
                                    onChange={e => setFeedback(e.target.value)}
                                    placeholder="フィードバックを入力してください..."
                                />
                                
                                <div className="action-buttons">
                                    <Button
                                        onClick={handleSave}
                                        appearance="primary"
                                        style={hasUnsavedChanges ? {
                                            backgroundColor: '#ff6b00',
                                            borderColor: '#ff6b00'
                                        } : isReviewed ? {
                                            backgroundColor: '#28a745',
                                            borderColor: '#28a745'
                                        } : {}}
                                    >
                                        {hasUnsavedChanges ? <><FaSave /> レビュー完了にする</> : 
                                         (isReviewed ? <><FaRedo /> レビュー更新</> : <><FaCheck /> レビュー完了</>)}
                                    </Button>
                                </div>
                                
                                <div className="navigation-buttons">
                                    <Button onClick={goToPrev} disabled={!hasPrev} appearance="tertiary">
                                        <FaChevronLeft /> 前の学生
                                    </Button>
                                    <Button onClick={goToNext} disabled={!hasNext} appearance="tertiary">
                                        次の学生 <FaChevronRight />
                                    </Button>
                                </div>
                                
                                <div className="shortcut-hint">
                                    <strong>ショートカット:</strong><br />
                                    {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+S : 保存<br />
                                    {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+←→ : 前後の学生へ
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    </Stack>
                    
                    {/* コード整形チェックセクション */}
                    {formatData && (
                        <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '2px solid #dee2e6' }}>
                            <h2 style={{ marginBottom: '20px', color: '#333' }}>
                                🔍 コード整形チェック
                                {!formatData.has_diff && (
                                    <span style={{ 
                                        marginLeft: '15px', 
                                        fontSize: '14px', 
                                        color: '#28a745',
                                        fontWeight: 'normal'
                                    }}>
                                        ✓ 整形済み
                                    </span>
                                )}
                            </h2>
                            
                            {/* 2カラムレイアウト */}
                            <div style={{ 
                                display: 'flex', 
                                gap: '20px',
                                width: '100%'
                            }}>
                                {/* 元のコード */}
                                <div style={{ width: 'calc(50% - 10px)' }}>
                                    <div style={{
                                        background: '#f8f9fa',
                                        padding: '10px 15px',
                                        borderRadius: '8px 8px 0 0',
                                        borderBottom: '2px solid #dee2e6',
                                        fontWeight: '600',
                                        fontSize: '14px'
                                    }}>
                                        📄 元のコード
                                    </div>
                                    <div 
                                        ref={originalCodeRef}
                                        onScroll={handleOriginalScroll}
                                        style={{
                                            border: '1px solid #dee2e6',
                                            borderTop: 'none',
                                            borderRadius: '0 0 8px 8px',
                                            maxHeight: '600px',
                                            overflow: 'auto',
                                            background: '#ffffff'
                                        }}>
                                        <pre style={{
                                            margin: 0,
                                            padding: '15px',
                                            fontSize: '12px',
                                            lineHeight: '1.5',
                                            fontFamily: 'monospace',
                                            whiteSpace: 'pre',
                                            wordWrap: 'normal',
                                            overflowX: 'auto'
                                        }}>
                                            <code dangerouslySetInnerHTML={{
                                                __html: highlightCCode(formatData.original)
                                            }} />
                                        </pre>
                                    </div>
                                </div>
                                
                                {/* 整形済みコード */}
                                <div style={{ width: 'calc(50% - 10px)' }}>
                                    <div style={{
                                        background: '#f0f8ff',
                                        padding: '10px 15px',
                                        borderRadius: '8px 8px 0 0',
                                        borderBottom: '2px solid #007bff',
                                        fontWeight: '600',
                                        fontSize: '14px'
                                    }}>
                                        ✨ 整形済みコード
                                    </div>
                                    <div 
                                        ref={formattedCodeRef}
                                        onScroll={handleFormattedScroll}
                                        style={{
                                            border: '1px solid #007bff',
                                            borderTop: 'none',
                                            borderRadius: '0 0 8px 8px',
                                            maxHeight: '600px',
                                            overflow: 'auto',
                                            background: '#ffffff'
                                        }}>
                                        <pre style={{
                                            margin: 0,
                                            padding: '15px',
                                            fontSize: '12px',
                                            lineHeight: '1.5',
                                            fontFamily: 'monospace',
                                            whiteSpace: 'pre',
                                            wordWrap: 'normal',
                                            overflowX: 'auto'
                                        }}>
                                            <code dangerouslySetInnerHTML={{
                                                __html: highlightCCode(formatData.formatted)
                                            }} />
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
            </div>
    );
};

export default StudentDetailPage;