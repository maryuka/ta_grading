import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Container,
    Button,
    ListTable,
    Text,
    Stack,
    Loading,
    Message,
    Breadcrumbs
} from '@freee_jp/vibes';
import { FaEdit, FaFilter, FaSearch, FaClock, FaDownload } from 'react-icons/fa';

const StudentListPage = () => {
    const { assignmentId } = useParams();
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all'); // all, completed, needs-review, pending
    const [checkingAll, setCheckingAll] = useState(false);
    const [autoCheckStatus, setAutoCheckStatus] = useState(null);
    const [exporting, setExporting] = useState(false);

    // 課題名マッピング（backend/dataディレクトリ構造に合わせる）
    const assignmentNames = {
        'r_1_variable': '課題1: 変数',
    };

    const assignmentName = assignmentNames[assignmentId] || assignmentId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    useEffect(() => {
        // 課題IDを使って特定の課題の学生データを取得
        setLoading(true);
        const apiUrl = assignmentId === 'r_1_variable'
            ? `/api/assignments/${assignmentId}/students`
            : '/api/students';  // フォールバック

        axios.get(apiUrl)
            .then(res => {
                setStudents(res.data || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch students:', err);
                setStudents([]);
                setLoading(false);
            });

        // 自動チェックステータスを確認
        axios.get('/api/auto-check-status')
            .then(res => {
                setAutoCheckStatus(res.data);
            })
            .catch(err => {
                console.error('Failed to fetch auto-check status:', err);
            });
    }, [assignmentId]);

    // ステータスの判定
    const getStatus = (student) => {
        if (student['レビュー済み'] === '1') return 'completed';
        if (student.auto_feedback) return 'needs-review';
        return 'pending';
    };

    const getStatusDisplay = (status) => {
        switch (status) {
            case 'completed': return { text: 'レビュー済み', color: 'success' };
            case 'needs-review': return { text: '要確認', color: 'warning' };
            default: return { text: '未レビュー', color: 'grey' };
        }
    };

    // フィルタリング
    const filteredStudents = students.filter(student => {
        if (filterStatus === 'all') return true;
        return getStatus(student) === filterStatus;
    });

    // テーブルヘッダー
    const headers = [
        { value: 'ステータス', minWidth: 120 },
        { value: '学生ID', minWidth: 150 },
        { value: '学生名', minWidth: 200 },
        { value: 'フィードバック', minWidth: 150 },
        { value: 'アクション', minWidth: 120, alignCenter: true }
    ];

    // テーブル行データの作成
    const rows = filteredStudents.map((student) => {
        const status = getStatus(student);
        const statusDisplay = getStatusDisplay(status);

        return {
            cells: [
                {
                    value: (
                        <Text size="s" color={statusDisplay.color}>{statusDisplay.text}</Text>
                    )
                },
                {
                    value: student['広大ID']
                },
                {
                    value: student['フルネーム']
                },
                {
                    value: student['フィードバックコメント'] ?
                        <Text size="s" color="grey">入力済み</Text> :
                        <Text size="s" color="grey">-</Text>
                },
                {
                    value: (
                        <Button
                            small
                            appearance="primary"
                            onClick={() => navigate(`/assignments/${assignmentId}/students/${student['広大ID']}`)}
                        >
                            <FaEdit /> レビュー
                        </Button>
                    ),
                    alignCenter: true
                }
            ],
            onClick: () => navigate(`/assignments/${assignmentId}/students/${student['広大ID']}`)
        };
    });

    // 統計情報
    const stats = {
        total: students.length,
        completed: students.filter(s => getStatus(s) === 'completed').length,
        needsReview: students.filter(s => getStatus(s) === 'needs-review').length,
        pending: students.filter(s => getStatus(s) === 'pending').length
    };

    // 全学生自動チェック機能
    const handleAutoCheckAll = async () => {
        const confirmed = window.confirm(
            '全学生の自動チェックを実行します。\nレビュー済みの学生はスキップされます。\n続行しますか？'
        );
        if (!confirmed) return;

        setCheckingAll(true);

        try {
            const response = await axios.post('/api/auto-check-all');
            const result = response.data;

            // 学生リストを更新
            const apiUrl = assignmentId === 'r_1_variable'
                ? `/api/assignments/${assignmentId}/students`
                : '/api/students';
            const updatedStudents = await axios.get(apiUrl);
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
        }
    };

    // CSVエクスポート機能
    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await axios.get('/api/export/csv', {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `feedback_${assignmentName}_${new Date().toISOString().split('T')[0]}.csv`);
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

    if (loading) {
        return (
            <Container width="full">
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <Loading />
                </div>
            </Container>
        );
    }

    return (
        <Container width="full">
            <div style={{ padding: '20px', width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
                <Stack spacing={1.5}>
                    {/* パンくずリスト */}
                    <Breadcrumbs
                        links={[
                            { title: 'ホーム', url: '/' },
                            { title: assignmentName }
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
                            {assignmentName} - 学生一覧
                        </h1>
                        <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', marginLeft: 'auto' }}>
                            {autoCheckStatus && autoCheckStatus.checked ? (
                                <Button
                                    disabled={true}
                                    appearance="secondary"
                                >
                                    <span>✅ 自動チェック済み</span>
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleAutoCheckAll}
                                    disabled={checkingAll}
                                    appearance="primary"
                                >
                                    <span>{checkingAll ? '⏰ チェック中...' : '🔍 全学生を自動チェック'}</span>
                                </Button>
                            )}
                            <Button
                                onClick={handleExport}
                                disabled={exporting}
                                appearance="secondary"
                            >
                                <span>{exporting ? '⏰ エクスポート中...' : '📥 CSVダウンロード'}</span>
                            </Button>
                        </div>
                    </div>

                    {/* 統計情報 */}
                    <div style={{
                        background: '#f8f9fa',
                        padding: '15px',
                        borderRadius: '8px',
                        marginBottom: '20px'
                    }}>
                        <Stack direction="horizontal" spacing={2}>
                            <Text>総提出: <strong>{stats.total}件</strong></Text>
                            <Text color="success">✅ 完了: <strong>{stats.completed}件</strong></Text>
                            <Text color="warning">⚠️ 要確認: <strong>{stats.needsReview}件</strong></Text>
                            <Text>📝 未レビュー: <strong>{stats.pending}件</strong></Text>
                        </Stack>
                    </div>

                    {/* フィルター */}
                    <Stack direction="horizontal" spacing={0.5} alignItems="center">
                        <FaFilter />
                        <Text weight="bold">フィルター:</Text>
                        <Button
                            small
                            appearance={filterStatus === 'all' ? 'primary' : 'tertiary'}
                            onClick={() => setFilterStatus('all')}
                        >
                            すべて ({students.length})
                        </Button>
                        <Button
                            small
                            appearance={filterStatus === 'completed' ? 'primary' : 'tertiary'}
                            onClick={() => setFilterStatus('completed')}
                        >
                            レビュー済み ({stats.completed})
                        </Button>
                        <Button
                            small
                            appearance={filterStatus === 'needs-review' ? 'primary' : 'tertiary'}
                            onClick={() => setFilterStatus('needs-review')}
                        >
                            要確認 ({stats.needsReview})
                        </Button>
                        <Button
                            small
                            appearance={filterStatus === 'pending' ? 'primary' : 'tertiary'}
                            onClick={() => setFilterStatus('pending')}
                        >
                            未レビュー ({stats.pending})
                        </Button>
                    </Stack>

                    {/* テーブル */}
                    {filteredStudents.length > 0 ? (
                        <div style={{ width: '100%' }}>
                            <ListTable
                                headers={headers}
                                rows={rows}
                                fitContent={false}
                            />
                        </div>
                    ) : (
                        <Message type="info">
                            該当する学生が見つかりません。フィルターを変更してください。
                        </Message>
                    )}
                </Stack>
            </div>
        </Container>
    );
};

export default StudentListPage;