import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button, Container, Note } from '@freee_jp/vibes';
import { FaCloudUploadAlt, FaSpinner } from 'react-icons/fa';

const AssignmentUpload = () => {
    const navigate = useNavigate();
    const [assignmentName, setAssignmentName] = useState('');
    const [sourceFileName, setSourceFileName] = useState('');  // 例: assignment2
    const [csvFile, setCsvFile] = useState(null);
    const [zipFile, setZipFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    
    const csvInputRef = useRef(null);
    const zipInputRef = useRef(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => {
                if (file.name.endsWith('.csv')) {
                    setCsvFile(file);
                } else if (file.name.endsWith('.zip')) {
                    setZipFile(file);
                }
            });
        }
    };

    const handleFileSelect = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            if (type === 'csv') {
                setCsvFile(file);
            } else if (type === 'zip') {
                setZipFile(file);
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!assignmentName || !sourceFileName || !csvFile || !zipFile) {
            setUploadStatus({
                type: 'error',
                message: 'すべての項目を入力してください'
            });
            return;
        }

        setIsUploading(true);
        setUploadStatus(null);

        const formData = new FormData();
        formData.append('assignment_name', assignmentName);
        formData.append('source_file_name', sourceFileName);  // ファイル名のベース部分を送信
        formData.append('csv_file', csvFile);
        formData.append('zip_file', zipFile);

        try {
            const response = await axios.post('/api/assignments/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    setUploadStatus({
                        type: 'progress',
                        message: `アップロード中... ${percentCompleted}%`
                    });
                }
            });

            setUploadStatus({
                type: 'success',
                message: response.data.message
            });

            // 3秒後に課題ページへリダイレクト
            setTimeout(() => {
                navigate(`/assignments/${response.data.assignment_id}`);
            }, 3000);
        } catch (error) {
            setUploadStatus({
                type: 'error',
                message: error.response?.data?.error || 'アップロード中にエラーが発生しました'
            });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Container width="full">
            <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
                <h2>📤 新しい課題をアップロード</h2>
                
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                            課題名 <span style={{ color: 'red' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={assignmentName}
                            onChange={(e) => setAssignmentName(e.target.value)}
                            placeholder="例: 課題2: 配列"
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '14px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                backgroundColor: isUploading ? '#f5f5f5' : 'white'
                            }}
                            disabled={isUploading}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                            ソースファイル名（拡張子なし） <span style={{ color: 'red' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={sourceFileName}
                            onChange={(e) => setSourceFileName(e.target.value)}
                            placeholder="例: assignment2, hello, variable"
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '14px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                backgroundColor: isUploading ? '#f5f5f5' : 'white'
                            }}
                            disabled={isUploading}
                        />
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            学生が提出すべきファイル名のベース部分を入力（.cと-test-history.txtが自動的に追加されます）
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                            学生リストCSV <span style={{ color: 'red' }}>*</span>
                        </label>
                        <div 
                            style={{
                                border: '2px dashed #ccc',
                                borderRadius: '8px',
                                padding: '20px',
                                textAlign: 'center',
                                backgroundColor: csvFile ? '#f0f8ff' : '#f8f9fa',
                                cursor: 'pointer'
                            }}
                            onClick={() => csvInputRef.current.click()}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <input
                                ref={csvInputRef}
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleFileSelect(e, 'csv')}
                                style={{ display: 'none' }}
                                disabled={isUploading}
                            />
                            {csvFile ? (
                                <div>
                                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>📄</div>
                                    <p style={{ margin: '0', color: '#0066cc' }}>{csvFile.name}</p>
                                    <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
                                        {(csvFile.size / 1024).toFixed(2)} KB
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ fontSize: '24px', marginBottom: '10px', opacity: '0.5' }}>📄</div>
                                    <p style={{ margin: '0', color: '#666' }}>
                                        クリックまたはドロップしてCSVファイルを選択
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                            提出ファイルZIP <span style={{ color: 'red' }}>*</span>
                        </label>
                        <div 
                            style={{
                                border: '2px dashed #ccc',
                                borderRadius: '8px',
                                padding: '20px',
                                textAlign: 'center',
                                backgroundColor: zipFile ? '#f0f8ff' : '#f8f9fa',
                                cursor: 'pointer'
                            }}
                            onClick={() => zipInputRef.current.click()}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <input
                                ref={zipInputRef}
                                type="file"
                                accept=".zip"
                                onChange={(e) => handleFileSelect(e, 'zip')}
                                style={{ display: 'none' }}
                                disabled={isUploading}
                            />
                            {zipFile ? (
                                <div>
                                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>🗂️</div>
                                    <p style={{ margin: '0', color: '#0066cc' }}>{zipFile.name}</p>
                                    <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
                                        {(zipFile.size / (1024 * 1024)).toFixed(2)} MB
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ fontSize: '24px', marginBottom: '10px', opacity: '0.5' }}>🗂️</div>
                                    <p style={{ margin: '0', color: '#666' }}>
                                        クリックまたはドロップしてZIPファイルを選択
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {uploadStatus && (
                        <Note
                            type={uploadStatus.type === 'error' ? 'alert' : 
                                  uploadStatus.type === 'success' ? 'success' : 'info'}
                            mb={1}
                        >
                            {uploadStatus.message}
                        </Note>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                        <Button
                            type="submit"
                            appearance="primary"
                            disabled={isUploading || !assignmentName || !csvFile || !zipFile}
                        >
                            {isUploading ? (
                                <>
                                    <FaSpinner className="spin" style={{ marginRight: '8px' }} />
                                    アップロード中...
                                </>
                            ) : (
                                <>
                                    <FaCloudUploadAlt style={{ marginRight: '8px' }} />
                                    アップロード
                                </>
                            )}
                        </Button>
                        <Button
                            appearance="secondary"
                            onClick={() => navigate('/')}
                            disabled={isUploading}
                        >
                            キャンセル
                        </Button>
                    </div>
                </form>

                <div style={{ 
                    marginTop: '30px', 
                    padding: '15px', 
                    background: '#fff3cd', 
                    borderRadius: '8px', 
                    border: '1px solid #ffc107' 
                }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>
                        📋 ファイル形式について
                    </h4>
                    <ul style={{ margin: '0', paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
                        <li>
                            <strong>CSVファイル:</strong> 必須列: 広大ID, フルネーム, ステータス
                        </li>
                        <li>
                            <strong>ZIPファイル:</strong> 学生の提出ファイルをまとめたアーカイブ
                        </li>
                    </ul>
                </div>
            </div>

            <style jsx>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </Container>
    );
};

export default AssignmentUpload;