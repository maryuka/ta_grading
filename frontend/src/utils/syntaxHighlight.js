// Prism.jsを使用したC言語のシンタックスハイライト
import Prism from 'prismjs';
import 'prismjs/components/prism-c';

export const highlightCCode = (code, showWhitespace = false) => {
    if (!code) return '';
    
    let processedCode = code;
    
    // インデント文字を可視化
    if (showWhitespace) {
        // タブを可視化
        processedCode = processedCode.replace(/\t/g, '<span class="indent-tab">→   </span>');
        // 行頭のスペースを可視化（インデント部分のみ）
        processedCode = processedCode.replace(/^( +)/gm, (match) => {
            return match.replace(/ /g, '<span class="indent-space">·</span>');
        });
        // 行末の空白を強調
        processedCode = processedCode.replace(/( +)$/gm, (match) => {
            return '<span class="trailing-space">' + match + '</span>';
        });
    }
    
    // Prism.jsでC言語のコードをハイライト
    const highlighted = Prism.highlight(processedCode, Prism.languages.c, 'c');
    
    // showWhitespaceがtrueの場合、既にマークアップされた空白文字は保持
    if (showWhitespace) {
        return highlighted;
    }
    
    return highlighted;
};

// インデントの混在をチェック
export const checkIndentConsistency = (code) => {
    const lines = code.split('\n');
    let hasTab = false;
    let hasSpace = false;
    const mixedLines = [];
    
    lines.forEach((line, index) => {
        const leadingWhitespace = line.match(/^[\t ]*/)[0];
        if (leadingWhitespace.includes('\t')) hasTab = true;
        if (leadingWhitespace.includes(' ')) hasSpace = true;
        
        // タブとスペースが混在している行を記録
        if (leadingWhitespace.includes('\t') && leadingWhitespace.includes(' ')) {
            mixedLines.push(index + 1);
        }
    });
    
    return {
        consistent: !(hasTab && hasSpace),
        hasTab,
        hasSpace,
        mixedLines
    };
};