import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
    Container,
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
    FaList
} from 'react-icons/fa';

const StudentDetailPage = () => {
    const { assignmentId, studentId } = useParams();
    const navigate = useNavigate();
    const [details, setDetails] = useState(null);
    const [feedback, setFeedback] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [students, setStudents] = useState([]);
    const [originalFeedback, setOriginalFeedback] = useState('');
    
    // 課題名マッピング（backend/dataディレクトリ構造に合わせる）
    const assignmentNames = {
        'r_1_variable': '課題1: 変数',
    };
    
    const assignmentName = assignmentNames[assignmentId] || assignmentId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // 学生リストを取得（前後の学生への移動用）
    useEffect(() => {
        axios.get('/api/students')
            .then(res => setStudents(res.data || []))
            .catch(err => console.error('Failed to fetch students:', err));
    }, []);
    
    // 現在の学生のインデックスを取得
    const currentIndex = students.findIndex(s => s['広大ID'] === studentId);
    const hasNext = currentIndex < students.length - 1 && currentIndex !== -1;
    const hasPrev = currentIndex > 0;
    
    // 次の学生へ移動
    const goToNext = useCallback(() => {
        if (hasNext) {
            const nextStudent = students[currentIndex + 1];
            navigate(`/assignments/${assignmentId}/students/${nextStudent['広大ID']}`);
        }
    }, [hasNext, currentIndex, students, navigate, assignmentId]);
    
    // 前の学生へ移動
    const goToPrev = useCallback(() => {
        if (hasPrev) {
            const prevStudent = students[currentIndex - 1];
            navigate(`/assignments/${assignmentId}/students/${prevStudent['広大ID']}`);
        }
    }, [hasPrev, currentIndex, students, navigate, assignmentId]);
    
    // 学生詳細を取得
    useEffect(() => {
        setIsLoading(true);
        axios.get(`/api/student/${studentId}`)
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
    }, [studentId]);
    
    // フィードバックの保存
    const handleSave = useCallback(() => {
        const feedbackToSave = feedback || '';
        axios.post(`/api/student/${studentId}/feedback`, { feedback: feedbackToSave })
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
    }, [feedback, studentId]);
    
    // 保存して次へ
    const handleSaveAndNext = useCallback(() => {
        const feedbackToSave = feedback || '';
        axios.post(`/api/student/${studentId}/feedback`, { feedback: feedbackToSave })
            .then(() => {
                if (hasNext) {
                    goToNext();
                } else {
                    navigate(`/assignments/${assignmentId}`);
                }
            })
            .catch(err => console.error('Failed to save feedback:', err));
    }, [feedback, studentId, hasNext, goToNext, navigate, assignmentId]);
    
    // キーボードショートカット
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSaveAndNext();
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
    }, [goToPrev, goToNext, handleSave, handleSaveAndNext]);
    
    if (isLoading) {
        return (
            <Container width="full">
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <Loading />
                </div>
            </Container>
        );
    }
    
    if (!details || !details.student) {
        return (
            <Container width="full">
                <div style={{ padding: '40px' }}>
                    <Message type="error">学生データが見つかりません</Message>
                </div>
            </Container>
        );
    }
    
    const studentData = details.student;
    const isReviewed = studentData['レビュー済み'] === '1';
    const hasUnsavedChanges = feedback !== originalFeedback;
    
    return (
        <Container width="full">
            <div style={{ padding: '20px' }}>
                <Stack spacing={1.5}>
                    {/* パンくずリスト */}
                    <Breadcrumbs 
                        links={[
                            { title: 'ホーム', url: '/' },
                            { title: assignmentName, url: `/assignments/${assignmentId}` },
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
                        <div style={{ marginLeft: 'auto' }}>
                            <Button
                                appearance="tertiary"
                                onClick={() => navigate(`/assignments/${assignmentId}`)}
                            >
                                <FaList /> 一覧に戻る
                            </Button>
                        </div>
                    </div>
                    
                    {/* 提出ファイル一覧 */}
                    {details.files && details.files.length > 0 && (
                        <div style={{ 
                            background: '#f0f8ff', 
                            padding: '10px 15px', 
                            borderRadius: '4px',
                            border: '1px solid #d0e5ff' 
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
                    
                    {/* コード表示エリア */}
                    <div style={{ display: 'flex', gap: '15px', height: '50vh' }}>
                        <div style={{ 
                            flex: 1, 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{ 
                                background: '#f1f3f5', 
                                padding: '8px 12px', 
                                borderBottom: '1px solid #ced4da',
                                fontWeight: 'bold'
                            }}>
                                {details.assignment_name || 'assignment'}.c
                            </div>
                            <pre style={{ 
                                padding: '10px', 
                                margin: 0, 
                                overflow: 'auto',
                                flex: 1
                            }}>
                                {details.source_code}
                            </pre>
                        </div>
                        
                        <div style={{ 
                            flex: 1, 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{ 
                                background: '#f1f3f5', 
                                padding: '8px 12px', 
                                borderBottom: '1px solid #ced4da',
                                fontWeight: 'bold'
                            }}>
                                {details.assignment_name || 'assignment'}-test-history.txt
                            </div>
                            <pre style={{ 
                                padding: '10px', 
                                margin: 0, 
                                overflow: 'auto',
                                flex: 1
                            }}>
                                {details.test_history}
                            </pre>
                        </div>
                    </div>
                    
                    {/* 自動チェック結果 */}
                    {details.auto_check_result && details.auto_check_result !== '' && (
                        <Note type="info">
                            <Stack spacing={0.75}>
                                <Text weight="bold">🔍 自動チェック結果</Text>
                                <Text>{details.auto_check_result}</Text>
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
                                >
                                    <FaPencilAlt /> この内容でフィードバックを入力
                                </Button>
                            </Stack>
                        </Note>
                    )}
                    
                    {/* フィードバック入力 */}
                    <Stack spacing={0.5}>
                        <Stack direction="horizontal" alignItems="center" spacing={0.5}>
                            <Text weight="bold">フィードバックコメント</Text>
                            {isReviewed && <Text color="success">(レビュー済み)</Text>}
                        </Stack>
                        <TextArea
                            value={feedback}
                            onChange={e => setFeedback(e.target.value)}
                            rows={5}
                            width="full"
                            style={{
                                backgroundColor: hasUnsavedChanges ? '#fffbf0' : 'white'
                            }}
                        />
                        <Text size="s" color="grey">
                            ショートカット: {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+S (保存) / 
                            {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter (保存して次へ) / 
                            {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+←→ (前後の学生へ)
                        </Text>
                        
                        <Stack direction="horizontal" spacing={0.5}>
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
                            <Button
                                onClick={handleSaveAndNext}
                                appearance="secondary"
                            >
                                <FaSave /> 保存して次へ
                            </Button>
                            <Button onClick={goToPrev} disabled={!hasPrev} appearance="tertiary">
                                <FaChevronLeft /> 前の学生
                            </Button>
                            <Button onClick={goToNext} disabled={!hasNext} appearance="tertiary">
                                次の学生 <FaChevronRight />
                            </Button>
                        </Stack>
                    </Stack>
                </Stack>
            </div>
        </Container>
    );
};

export default StudentDetailPage;