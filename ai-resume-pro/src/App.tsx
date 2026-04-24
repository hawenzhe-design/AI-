import { useState, useEffect } from 'react';
import { Download, Sparkles, FileText, Target, User, GraduationCap, Briefcase, FolderGit2, Settings2, Plus, Trash2, Wand2, Search, Upload, Loader2, Undo2, Redo2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { ResumeData, initialResumeData, Education, Experience, Project, SkillSet, ResumeTheme, SectionVisibility } from './types';
import { optimizeText, diagnoseResume, optimizeFullResume, parseResumeMultimodal, parseJDMultimodal } from './services/gemini';

const cleanDescription = (text: string) => {
  if (!text) return '';
  return text.split('\n').map(line => {
    // Regex to match a marker at the start of a line (possibly after whitespace)
    // Markers: l, L, |, -, *, •
    const match = line.match(/^(\s*)([lL\|]|\-|\*|•)\s+(.*)/);
    if (match) {
      return `${match[1]}● ${match[3]}`;
    }
    return line;
  }).join('\n');
};

const HighlightedText = ({ text, path, onConfirm }: { text: string, path?: string, onConfirm?: (path: string) => void }) => {
  if (!text) return null;
  
  // Apply bullet point logic first
  const cleaned = cleanDescription(text);
  
  // Split by <opt> tags
  const parts = cleaned.split(/(<opt>|<\/opt>)/g);
  let isInsideOpt = false;
  
  return (
    <>
      {parts.map((part, i) => {
        if (part === '<opt>') {
          isInsideOpt = true;
          return null;
        }
        if (part === '</opt>') {
          isInsideOpt = false;
          return null;
        }
        const currentIsOpt = isInsideOpt;
        return (
          <span 
            key={i} 
            onClick={(e) => {
              if (currentIsOpt && path && onConfirm) {
                e.stopPropagation();
                onConfirm(path);
              }
            }}
            className={currentIsOpt ? 'bg-yellow-100 hover:bg-yellow-200 cursor-pointer transition-colors duration-200' : ''}
            title={currentIsOpt ? "点击确认此AI优化" : undefined}
          >
            {part}
          </span>
        );
      })}
    </>
  );
};

const EditableField = ({ 
  value, 
  onChange, 
  className = "", 
  path,
  onConfirm,
  placeholder = ""
}: { 
  value: string, 
  onChange: (v: string) => void, 
  className?: string,
  path?: string,
  onConfirm?: (path: string) => void,
  placeholder?: string
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  if (isEditing) {
    return (
      <textarea
        autoFocus
        value={localValue.replace(/<opt>/g, '').replace(/<\/opt>/g, '')}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          onChange(localValue || value);
        }}
        placeholder={placeholder}
        className={`w-full bg-white outline-none ring-2 ring-blue-500 rounded p-1 resize-none overflow-hidden ${className}`}
        style={{ height: 'auto', minHeight: '1.5em' }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = 'auto';
          target.style.height = target.scrollHeight + 'px';
        }}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      className={`cursor-text hover:bg-slate-50 transition-colors rounded group relative ${className}`}
    >
      <HighlightedText text={value} path={path} onConfirm={onConfirm} />
    </div>
  );
};

export default function App() {
  const [resume, setResume] = useState<ResumeData>(() => {
    const saved = localStorage.getItem('resume_data');
    const data = saved ? JSON.parse(saved) : initialResumeData;
    if (!data.theme) data.theme = initialResumeData.theme;
    if (!data.labels) data.labels = initialResumeData.labels;
    if (!data.sectionVisibility) data.sectionVisibility = initialResumeData.sectionVisibility;
    return data;
  });
  const [history, setHistory] = useState<ResumeData[]>([]);
  const [undoStack, setUndoStack] = useState<ResumeData[]>([]);
  const [redoStack, setRedoStack] = useState<ResumeData[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isParsingJD, setIsParsingJD] = useState(false);
  const [parsingStep, setParsingStep] = useState(0);
  const [jd, setJd] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [originalFileUrl, setOriginalFileUrl] = useState<string | null>(null);
  const [originalFileType, setOriginalFileType] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'structured' | 'original'>('structured');

  useEffect(() => {
    localStorage.setItem('resume_data', JSON.stringify(resume));
  }, [resume]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resume, undoStack, redoStack]);

  const pushToUndo = (data: ResumeData) => {
    setUndoStack(prev => [JSON.parse(JSON.stringify(data)), ...prev].slice(0, 50));
    setRedoStack([]);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[0];
    const rest = undoStack.slice(1);
    setRedoStack(prev => [JSON.parse(JSON.stringify(resume)), ...prev]);
    setUndoStack(rest);
    setResume(previous);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    const rest = redoStack.slice(1);
    setUndoStack(prev => [JSON.parse(JSON.stringify(resume)), ...prev]);
    setRedoStack(rest);
    setResume(next);
  };

  const updateResume = (update: ResumeData | ((prev: ResumeData) => ResumeData)) => {
    pushToUndo(resume);
    setResume(update);
  };

  const saveToHistory = (data: ResumeData) => {
    // Avoid duplicates
    if (history.length > 0 && JSON.stringify(history[0]) === JSON.stringify(data)) return;
    setHistory(prev => [JSON.parse(JSON.stringify(data)), ...prev].slice(0, 10));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Supported types: PDF and common images
    const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      alert('目前仅支持 PDF、PNG、JPG 或 WebP 格式的简历文件。');
      return;
    }

    setIsParsing(true);
    setParsingStep(0);
    try {
      pushToUndo(resume);
      saveToHistory(resume);
      // Read file as base64
      const base64WithHeader = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Data = base64WithHeader.split(',')[1];
      
      setParsingStep(1); // Moving to AI processing
      
      // Store original file URL for preview
      if (originalFileUrl) URL.revokeObjectURL(originalFileUrl);
      const url = URL.createObjectURL(file);
      setOriginalFileUrl(url);
      setOriginalFileType(file.type);
      setPreviewMode('original'); // Default to showing original after upload

      const parsedData = await parseResumeMultimodal(base64Data, file.type);
      
      setParsingStep(2); // Finalizing
      
      if (parsedData && parsedData.personalInfo) {
        updateResume({
          ...initialResumeData,
          ...parsedData,
          theme: resume.theme // Preserve current theme
        });
      } else {
        throw new Error('未能从该文件中提取到有效的简历信息，请尝试更换清晰的文件或手动填写。');
      }
    } catch (error: any) {
      console.error('Parsing failed:', error);
      alert(error.message || '解析失败，请重试或手动输入');
    } finally {
      setIsParsing(false);
      // Reset input to allow re-upload of same file
      e.target.value = '';
    }
  };

  const handleJDFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Supported types: common images
    const supportedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      alert('目前仅支持 PNG、JPG 或 WebP 格式的截图文件。');
      return;
    }

    setIsParsingJD(true);
    try {
      const base64WithHeader = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Data = base64WithHeader.split(',')[1];
      const extractedText = await parseJDMultimodal(base64Data, file.type);
      
      if (extractedText) {
        setJd(extractedText);
      } else {
        alert('未能从该截图中提取到文本，建议手动粘贴文字建议。');
      }
    } catch (error: any) {
      console.error('JD Parsing failed:', error);
      alert('解析失败，请尝试手动粘贴内容。');
    } finally {
      setIsParsingJD(false);
      e.target.value = '';
    }
  };

  const updateTheme = (field: keyof ResumeTheme, value: string) => {
    updateResume(prev => ({
      ...prev,
      theme: { ...prev.theme!, [field]: value }
    }));
  };

  const updatePersonalInfo = (field: string, value: string) => {
    updateResume(prev => ({
      ...prev,
      personalInfo: { ...prev.personalInfo, [field]: value }
    }));
  };

  const updateLabel = (field: keyof NonNullable<ResumeData['labels']>, value: string) => {
    updateResume(prev => ({
      ...prev,
      labels: { ...prev.labels!, [field]: value }
    }));
  };

  const toggleSectionVisibility = (section: keyof SectionVisibility) => {
    updateResume(prev => ({
      ...prev,
      sectionVisibility: {
        ...prev.sectionVisibility || initialResumeData.sectionVisibility!,
        [section]: !prev.sectionVisibility?.[section]
      }
    }));
  };

  const removeSection = (section: keyof SectionVisibility, field: keyof ResumeData) => {
    updateResume(prev => {
      const next = { ...prev };
      
      // Clear data
      if (field === 'personalInfo') {
        next.personalInfo = { ...next.personalInfo, summary: '' };
      } else if (Array.isArray((next as any)[field])) {
        (next as any)[field] = [];
      }
      
      // Update visibility - ensure state update is deep enough
      next.sectionVisibility = {
        ...(next.sectionVisibility || initialResumeData.sectionVisibility!),
        [section]: false
      };
      
      return next;
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updatePersonalInfo('photo', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePrint = () => {
    const resumeContent = document.getElementById('resume-content');
    if (!resumeContent) {
      if (previewMode === 'original') {
        setPreviewMode('structured');
        setTimeout(handlePrint, 300);
      }
      return;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(s => s.outerHTML)
        .join('');
      
      const title = `简历_${resume.personalInfo.name || '未命名'}`;
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            ${styles}
            <style>
              @import "tailwindcss";
              body { 
                background: white !important; 
                padding: 0 !important; 
                margin: 0 !important; 
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .resume-container { 
                box-shadow: none !important; 
                margin: 0 !important; 
                width: 210mm !important; 
                min-height: 297mm !important;
                padding: 15mm !important;
                border: none !important;
                box-sizing: border-box !important;
                background: white !important;
              }
              @media print {
                @page { 
                  size: A4 portrait; 
                  margin: 0; 
                }
                body { margin: 0 !important; }
                .no-print { display: none !important; }
                section { page-break-inside: avoid; margin-bottom: 2mm; }
                h2, h3 { page-break-after: avoid; }
              }
            </style>
          </head>
          <body>
            ${resumeContent.outerHTML}
            <script>
              window.onload = () => {
                setTimeout(() => {
                  window.print();
                }, 800);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  const handleFullOptimize = async () => {
    setIsOptimizing(true);
    try {
      saveToHistory(resume);
      const optimized = await optimizeFullResume(resume, jd);
      updateResume(optimized);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDiagnose = async () => {
    if (!jd) return;
    setIsDiagnosing(true);
    setShowDiagnosis(true);
    try {
      const res = await diagnoseResume(resume, jd);
      setDiagnosis(res);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const confirmAIChange = (path: string) => {
    const keys = path.split('.');
    updateResume(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      let target: any = newData;
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
      const lastKey = keys[keys.length - 1];
      if (typeof target[lastKey] === 'string') {
        target[lastKey] = target[lastKey].replace(/<opt>/g, '').replace(/<\/opt>/g, '');
      }
      return newData;
    });
  };

  const updateFieldInValue = (path: string, newValue: string) => {
    const keys = path.split('.');
    updateResume(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      let target: any = newData;
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
      const lastKey = keys[keys.length - 1];
      target[lastKey] = newValue;
      return newData;
    });
  };

  return (
    <div className="h-screen flex flex-row-reverse bg-slate-50 relative overflow-hidden font-sans">
      {/* Parsing Loading Overlay */}
      <AnimatePresence mode="wait">
        {isParsing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm no-print"
          >
            <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-xl border border-slate-100 max-w-[320px] w-full">
              <div className="relative">
                <Loader2 className="text-blue-600 animate-spin" size={48} />
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-600">
                  {parsingStep === 0 ? '20%' : parsingStep === 1 ? '60%' : '90%'}
                </div>
              </div>
              <div className="text-center">
                <h3 className="font-bold text-lg text-slate-900">
                  {parsingStep === 0 ? '正在上传文件...' : 
                   parsingStep === 1 ? 'AI 深度解析中...' : 
                   '正在排版生成...'}
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  {parsingStep === 0 ? '文件越大，上传时间越长' : 
                   parsingStep === 1 ? 'Gemini 正在提取每一个工作细节' : 
                   '即将完成，请稍后'}
                </p>
                <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: '0%' }}
                    animate={{ width: parsingStep === 0 ? '30%' : parsingStep === 1 ? '70%' : '100%' }}
                    className="h-full bg-blue-600 rounded-full"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - AI Sidekick */}
      <div className="w-[400px] flex-shrink-0 flex flex-col border-l border-slate-200 no-print bg-white h-full z-20">
        <div className="p-6 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-blue-600 text-lg">
            <Sparkles size={20} />
            <span>AI Resume Sidekick</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* File Operations */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Upload size={16} className="text-blue-600" />
              文件与数据管理
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-sm shadow-md shadow-blue-100">
                <Upload size={16} />
                <span>解析简历附件</span>
                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={isParsing} />
              </label>
              
              <div className="flex gap-2">
                <button 
                  onClick={handleFullOptimize}
                  disabled={isOptimizing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-all text-xs font-bold disabled:opacity-50 border border-indigo-100"
                >
                  <Wand2 size={14} />
                  <span>{isOptimizing ? '优化中...' : 'AI 智能润色'}</span>
                </button>
                <button 
                  onClick={() => {
                    if (confirm('确定要清空并填充示例数据吗？')) {
                      saveToHistory(resume);
                      const sample: ResumeData = {
                        personalInfo: {
                          name: "张小明",
                          email: "xiaoming.zhang@example.com",
                          phone: "138-1234-5678",
                          location: "上海",
                          link: "github.com/xiaoming",
                          summary: "具备 3 年前端开发经验的学习型工程师。擅长 React 生态栈，对性能优化和工程化有深入理解。具备良好的团队协作能力，曾主导过多个从 0 到 1 的项目开发。"
                        },
                        educations: [{
                          id: "1",
                          school: "上海交通大学",
                          degree: "本科",
                          major: "计算机科学与技术",
                          startDate: "2020.09",
                          endDate: "2024.06",
                          honors: "连续三年一等奖学金；校优秀毕业生",
                          gpa: "3.8/4.0"
                        }],
                        experiences: [{
                          id: "1",
                          company: "某知名互联网公司",
                          role: "前端开发实习生",
                          startDate: "2023.06",
                          endDate: "2023.09",
                          description: "负责公司核心产品的后台管理系统开发；优化了首屏加载速度，提升了 30% 的性能；协助团队完成了 React 18 的升级工作。"
                        }],
                        projects: [{
                          id: "1",
                          name: "个人博客系统",
                          role: "全栈开发",
                          startDate: "2022.10",
                          endDate: "2023.01",
                          description: "基于 Next.js 和 Tailwind CSS 开发的个人博客；实现了一套高性能的 Markdown 解析引擎；集成 Vercel 自动化部署流程。"
                        }],
                        skills: [{
                          id: "1",
                          category: "编程语言",
                          skills: "TypeScript, JavaScript, Python, Java"
                        }, {
                          id: "2",
                          category: "前端框架",
                          skills: "React, Next.js, Vue, Tailwind CSS"
                        }]
                      };
                      updateResume(sample);
                    }
                  }}
                  className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100 transition-all text-xs font-bold border border-slate-200"
                >
                  示例
                </button>
              </div>
            </div>
          </div>

          {/* AI JD Matcher */}
          <div className="space-y-3 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Target size={16} className="text-orange-600" />
              岗位匹配诊断
            </h3>
            <div className="bg-slate-50 p-4 rounded-xl space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">目标岗 JD</span>
                <label className="flex items-center gap-1 px-2 py-1 bg-white text-blue-600 rounded-md cursor-pointer hover:shadow-sm transition-all text-[10px] font-bold border border-blue-100">
                  <Upload size={12} />
                  <span>上传截图</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleJDFileUpload} disabled={isParsingJD} />
                </label>
              </div>
              <div className="relative">
                <textarea 
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="粘贴职位要求或点击上方按钮上传截图..."
                  className="w-full h-32 p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all font-mono text-[11px] leading-relaxed resize-none"
                />
                {isParsingJD && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 text-blue-600 animate-pulse">
                      <Loader2 className="animate-spin" size={14} />
                      <span className="font-bold text-xs">正在分析文本...</span>
                    </div>
                  </div>
                )}
              </div>
              <button 
                onClick={handleDiagnose}
                disabled={isDiagnosing || !jd || isParsingJD}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl hover:bg-black transition-all disabled:opacity-50 font-bold text-xs"
              >
                {isDiagnosing ? '深度诊断中...' : '生成匹配分析'}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="space-y-3 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Search size={16} className="text-slate-400" />
              历史版本
            </h3>
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-400 text-xs">
                  暂无历史记录
                </div>
              ) : (
                history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 transition-all group">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-slate-700">版本 {history.length - i}</span>
                      <span className="text-[10px] text-slate-400">
                        {h.personalInfo.name || '未命名'}
                      </span>
                    </div>
                    <button 
                      onClick={() => {
                        if (confirm('恢复到此版本？')) {
                          saveToHistory(resume);
                          updateResume(h);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold hover:bg-blue-100 transition-all"
                    >
                      恢复
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bottom appearance controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {(['sans', 'serif', 'mono'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => updateTheme('fontFamily', f)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md border transition-all ${resume.theme?.fontFamily === f ? 'border-blue-600 bg-white text-blue-600 shadow-sm' : 'border-slate-200 bg-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  {f === 'sans' ? '无衬线' : f === 'serif' ? '衬线' : '等宽'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="resume-preview-section" className="flex-1 bg-slate-100 overflow-y-auto h-full flex flex-col items-center transition-all p-8 shadow-inner">
        {!resume ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-slate-400" size={32} />
          </div>
        ) : (
          <div className="w-full max-w-[210mm] min-w-fit">
            {/* Top Control Bar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
              <div className="flex bg-white p-1 rounded-lg shadow-sm border border-slate-200">
                <button 
                  onClick={() => setPreviewMode('structured')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${previewMode === 'structured' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  标准 A4 预览
                </button>
                {originalFileUrl && (
                  <button 
                    onClick={() => setPreviewMode('original')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${previewMode === 'original' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    查看上传原件
                  </button>
                )}
              </div>

              <div className="flex items-center bg-white p-1.5 rounded-lg shadow-sm border border-slate-200 gap-1">
                <button 
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  className="p-2 text-slate-600 hover:bg-slate-50 rounded-md disabled:opacity-30 transition-all"
                  title="撤销 (Ctrl+Z)"
                >
                  <Undo2 size={18} />
                </button>
                <button 
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  className="p-2 text-slate-600 hover:bg-slate-50 rounded-md disabled:opacity-30 transition-all"
                  title="重做 (Ctrl+Y)"
                >
                  <Redo2 size={18} />
                </button>
              </div>
              
              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-black transition-all shadow-lg font-bold text-sm"
              >
                <Download size={18} />
                <span>导出 PDF</span>
              </button>
            </div>

          {previewMode === 'original' && originalFileUrl ? (
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-300 no-print flex items-center justify-center bg-slate-50" style={{ minHeight: 'calc(100vh - 180px)' }}>
              {originalFileType?.startsWith('image/') ? (
                <img 
                  src={originalFileUrl} 
                  alt="Original Resume" 
                  className="max-w-full h-auto shadow-lg"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex flex-col items-center gap-6 p-12 text-center">
                  <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                    <FileText size={40} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-800">PDF 原件预览受限</h3>
                    <p className="text-slate-500 max-w-md">由于浏览器安全策略，PDF 原件无法在当前小窗口直接显示。您可以点击下方按钮在新窗口查看，或切换至“标准 A4 预览”进行编辑预览。</p>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => window.open(originalFileUrl, '_blank')}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium shadow-md hover:bg-blue-700 transition"
                    >
                      在新窗口打开原件
                    </button>
                    <button 
                      onClick={() => setPreviewMode('structured')}
                      className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition"
                    >
                      使用标准 A4 预览
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              {showDiagnosis && diagnosis && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mb-8 p-6 bg-orange-50 border border-orange-200 rounded-xl no-print overflow-hidden relative"
            >
              <button 
                onClick={() => setShowDiagnosis(false)}
                className="absolute top-4 right-4 p-1 hover:bg-orange-100 rounded-full transition-colors"
              >
                <Plus size={20} className="rotate-45 text-orange-600" />
              </button>
              <div className="flex items-center gap-2 mb-4 text-orange-700 font-bold">
                <Target size={20} />
                <span>AI 诊断报告</span>
              </div>
              <div className="markdown-body text-sm prose prose-orange max-w-none prose-p:my-2">
                <Markdown>{diagnosis}</Markdown>
              </div>
            </motion.div>
          )}

          <div 
            className={`resume-container border-none flex flex-col gap-4 print:m-0 print:shadow-none shadow-2xl bg-white ${
              resume.theme?.fontFamily === 'serif' ? 'font-resume-serif' : 
              resume.theme?.fontFamily === 'mono' ? 'font-resume-mono' : 
              'font-resume-sans'
            }`} 
            style={{ 
              fontSize: '10.5pt',
              lineHeight: '1.6',
              width: '210mm',
              minHeight: '297mm',
              padding: '15mm',
              boxSizing: 'border-box',
              margin: '0 auto 40px auto',
              backgroundColor: 'white',
              position: 'relative',
              zIndex: 1
            }}
            id="resume-content"
          >
            {/* Resume Header - Classic Style */}
            <div className="relative pb-3 border-b border-slate-200">
              <div className="text-center space-y-1 px-8">
                <EditableField 
                  value={resume.personalInfo.name || '姓名'} 
                  onChange={(v) => updatePersonalInfo('name', v)} 
                  className="text-[22pt] font-extrabold tracking-tight text-slate-900 leading-tight block"
                />
                <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-[10.5pt] text-slate-700">
                  {/* Phone */}
                  {resume.personalInfo.phone && (
                    <div className="relative group/info flex items-center">
                      <button 
                        onClick={() => updatePersonalInfo('phone', '')}
                        className="absolute -left-4 top-1/2 -translate-y-1/2 no-print opacity-0 group-hover/info:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={10} />
                      </button>
                      <EditableField value={resume.personalInfo.phone} onChange={(v) => updatePersonalInfo('phone', v)} placeholder="电话" />
                    </div>
                  )}

                  {resume.personalInfo.phone && resume.personalInfo.email && <span className="text-slate-300">|</span>}

                  {/* Email */}
                  {resume.personalInfo.email && (
                    <div className="relative group/info flex items-center">
                      <button 
                        onClick={() => updatePersonalInfo('email', '')}
                        className="absolute -left-4 top-1/2 -translate-y-1/2 no-print opacity-0 group-hover/info:opacity-100 text-slate-300 hover:text-red-500 transition-all font-normal"
                      >
                        <Trash2 size={10} />
                      </button>
                      <EditableField value={resume.personalInfo.email} onChange={(v) => updatePersonalInfo('email', v)} placeholder="邮箱" />
                    </div>
                  )}

                  {(resume.personalInfo.phone || resume.personalInfo.email) && resume.personalInfo.location && <span className="text-slate-300">|</span>}

                  {/* Location */}
                  {resume.personalInfo.location && (
                    <div className="relative group/info flex items-center">
                      <button 
                        onClick={() => updatePersonalInfo('location', '')}
                        className="absolute -left-4 top-1/2 -translate-y-1/2 no-print opacity-0 group-hover/info:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={10} />
                      </button>
                      <EditableField value={resume.personalInfo.location} onChange={(v) => updatePersonalInfo('location', v)} placeholder="地区" />
                    </div>
                  )}

                  {(resume.personalInfo.phone || resume.personalInfo.email || resume.personalInfo.location) && resume.personalInfo.link && <span className="text-slate-300">|</span>}

                  {/* Link */}
                  {resume.personalInfo.link && (
                    <div className="relative group/info flex items-center">
                      <button 
                        onClick={() => updatePersonalInfo('link', '')}
                        className="absolute -left-4 top-1/2 -translate-y-1/2 no-print opacity-0 group-hover/info:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={10} />
                      </button>
                      <EditableField value={resume.personalInfo.link} onChange={(v) => updatePersonalInfo('link', v)} className="text-blue-600 font-medium" />
                    </div>
                  )}

                  {/* Quick Add Menu */}
                  <div className="no-print opacity-0 hover:opacity-100 transition-opacity ml-2">
                    <button 
                      className="p-1 bg-slate-50 border border-slate-200 rounded text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all"
                      title="添加联系信息"
                      onClick={() => {
                        const firstEmpty = (['phone', 'email', 'location', 'link'] as const).find(f => !resume.personalInfo[f]);
                        if (firstEmpty) updatePersonalInfo(firstEmpty, firstEmpty === 'link' ? '个人链接' : firstEmpty === 'phone' ? '电话' : firstEmpty === 'email' ? '邮箱' : '地区');
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Profile Photo - Absolute Positioned to keep header centered */}
              <div className="no-print-photo absolute right-0 top-0 group/photo shrink-0">
                <label className="cursor-pointer block relative">
                  {resume.personalInfo.photo ? (
                    <div className="relative">
                      <img 
                        src={resume.personalInfo.photo} 
                        alt="Profile" 
                        className="w-[22mm] h-[30mm] object-cover rounded shadow-sm border border-slate-100"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center rounded no-print">
                        <Upload className="text-white" size={16} />
                      </div>
                    </div>
                  ) : (
                    <div className="w-[22mm] h-[30mm] border-2 border-dashed border-slate-200 rounded flex flex-col items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-400 transition-all no-print bg-slate-50">
                      <User size={24} strokeWidth={1} />
                      <span className="text-[9px] mt-1">照片</span>
                    </div>
                  )}
                  <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                </label>
                {resume.personalInfo.photo && (
                  <button 
                    onClick={() => updatePersonalInfo('photo', '')}
                    className="absolute -top-2 -right-2 p-1 bg-white shadow-md rounded-full text-slate-400 hover:text-red-500 no-print opacity-0 group-hover/photo:opacity-100 transition-all z-20"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
            
            {/* Personal Summary */}
            {resume.sectionVisibility?.summary !== false && (resume.personalInfo.summary !== undefined && resume.personalInfo.summary !== null) && (
              <section className="space-y-1 relative group/section">
                <div className="flex items-center gap-2 mb-1">
                  <EditableField 
                    value={resume.labels?.summary || '自我评价'} 
                    onChange={(v) => updateLabel('summary', v)}
                    className="text-[12pt] font-bold text-slate-900 whitespace-nowrap"
                  />
                  <div className="flex-1 h-px bg-slate-900" />
                  <div className="flex items-center gap-1 no-print opacity-0 group-hover/section:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSection('summary', 'personalInfo');
                      }}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                      title="彻底移除此栏目"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <EditableField 
                  value={resume.personalInfo.summary || '点击添加自我评价...'} 
                  onChange={(v) => updatePersonalInfo('summary', v)} 
                  className="text-[10pt] text-slate-800 whitespace-pre-wrap leading-relaxed"
                  path="personalInfo.summary"
                  onConfirm={confirmAIChange}
                />
              </section>
            )}

            {/* Structured Content Loop */}
            <div className="flex flex-col gap-4">
              {/* Education */}
              {resume.sectionVisibility?.education !== false && (
                <section className="space-y-2 group/section relative">
                  <div className="flex items-center gap-2">
                    <EditableField 
                      value={resume.labels?.education || '教育背景'} 
                      onChange={(v) => updateLabel('education', v)}
                      className="text-[12pt] font-bold text-slate-900 whitespace-nowrap"
                    />
                    <div className="flex-1 h-px bg-slate-900" />
                    <div className="flex items-center gap-1 no-print opacity-0 group-hover/section:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection('education', 'educations');
                        }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                        title="彻底移除此栏目"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          const newItem: Education = {
                            id: Math.random().toString(36).substr(2, 9),
                            school: '学校名称',
                            degree: '学位',
                            major: '专业',
                            startDate: '20XX.XX',
                            endDate: '20XX.XX',
                            honors: '',
                            gpa: ''
                          };
                          updateResume(prev => ({ ...prev, educations: [...prev.educations, newItem] }));
                        }}
                        className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-all cursor-pointer"
                        title="添加教育信息"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                <div className="space-y-4">
                  {resume.educations.map((edu, index) => (
                    <div key={edu.id} className="relative group/item">
                      <button 
                        onClick={() => updateResume(prev => ({ ...prev, educations: prev.educations.filter(e => e.id !== edu.id) }))}
                        className="absolute -left-6 top-1 no-print opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex flex-col">
                        <div className="flex justify-between items-baseline font-bold text-[11pt] text-slate-900">
                          <EditableField 
                            value={edu.school} 
                            onChange={(v) => updateFieldInValue(`educations.${index}.school`, v)} 
                            className="flex-1"
                          />
                          <EditableField 
                            value={`${edu.startDate} - ${edu.endDate}`} 
                            onChange={(v) => {
                              const [start, end] = v.split(' - ');
                              updateResume(prev => {
                            const next = JSON.parse(JSON.stringify(prev));
                            next.educations[index].startDate = start || '';
                            next.educations[index].endDate = end || '';
                            return next;
                          });
                        }} 
                        className="text-[10pt] font-medium text-slate-600 text-right min-w-[120px]"
                      />
                    </div>
                    <div className="flex justify-between items-baseline text-slate-800 text-[10.5pt]">
                      <div className="flex items-center gap-1">
                        <EditableField value={edu.degree} onChange={(v) => updateFieldInValue(`educations.${index}.degree`, v)} />
                        <span>·</span>
                        <EditableField value={edu.major} onChange={(v) => updateFieldInValue(`educations.${index}.major`, v)} />
                      </div>
                      {edu.gpa && (
                        <EditableField value={`GPA: ${edu.gpa}`} onChange={(v) => updateFieldInValue(`educations.${index}.gpa`, v.replace('GPA: ', ''))} />
                      )}
                    </div>
                    <EditableField 
                      value={edu.honors || '点击添加荣誉亮点...'} 
                      onChange={(v) => updateFieldInValue(`educations.${index}.honors`, v)} 
                      className="text-[10pt] text-slate-600 mt-1"
                      path={`educations.${index}.honors`}
                      onConfirm={confirmAIChange}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

            {/* Work Experience */}
              {resume.sectionVisibility?.experience !== false && (
                <section className="space-y-3 group/section relative">
                  <div className="flex items-center gap-2">
                    <EditableField 
                      value={resume.labels?.experience || '工作经历'} 
                      onChange={(v) => updateLabel('experience', v)}
                      className="text-[12pt] font-bold text-slate-900 whitespace-nowrap"
                    />
                    <div className="flex-1 h-px bg-slate-900" />
                    <div className="flex items-center gap-1 no-print opacity-0 group-hover/section:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection('experience', 'experiences');
                        }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                        title="彻底移除此栏目"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          const newItem: Experience = {
                            id: Math.random().toString(36).substr(2, 9),
                            company: '企业名称',
                            role: '职位',
                            startDate: '20XX.XX',
                            endDate: '20XX.XX',
                            description: '描述内容...'
                          };
                          updateResume(prev => ({ ...prev, experiences: [...prev.experiences, newItem] }));
                        }}
                        className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-all cursor-pointer"
                        title="添加工作经历"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                <div className="space-y-5">
                  {resume.experiences.map((exp, index) => (
                    <div key={exp.id} className="relative group/item flex flex-col gap-1">
                      <button 
                        onClick={() => updateResume(prev => ({ ...prev, experiences: prev.experiences.filter(e => e.id !== exp.id) }))}
                        className="absolute -left-6 top-1 no-print opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex justify-between items-baseline">
                        <div className="flex items-center gap-2">
                          <EditableField value={exp.company} onChange={(v) => updateFieldInValue(`experiences.${index}.company`, v)} className="font-bold text-[11pt] text-slate-900" />
                          <span className="text-slate-300">|</span>
                          <EditableField value={exp.role} onChange={(v) => updateFieldInValue(`experiences.${index}.role`, v)} className="font-bold text-[10.5pt] text-slate-800" />
                        </div>
                        <EditableField 
                          value={`${exp.startDate} - ${exp.endDate}`} 
                          onChange={(v) => {
                            const [start, end] = v.split(' - ');
                            updateResume(prev => {
                              const next = JSON.parse(JSON.stringify(prev));
                              next.experiences[index].startDate = start || '';
                              next.experiences[index].endDate = end || '';
                              return next;
                            });
                          }} 
                          className="text-[10pt] font-medium text-slate-600 text-right min-w-[120px]"
                        />
                      </div>
                      <EditableField 
                        value={exp.description} 
                        onChange={(v) => updateFieldInValue(`experiences.${index}.description`, v)} 
                        className="text-[10.5pt] text-slate-800 whitespace-pre-wrap leading-relaxed"
                        path={`experiences.${index}.description`}
                        onConfirm={confirmAIChange}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Projects */}
              {resume.sectionVisibility?.projects !== false && (
                <section className="space-y-3 group/section relative">
                  <div className="flex items-center gap-2">
                    <EditableField 
                      value={resume.labels?.projects || '项目经历'} 
                      onChange={(v) => updateLabel('projects', v)}
                      className="text-[12pt] font-bold text-slate-900 whitespace-nowrap"
                    />
                    <div className="flex-1 h-px bg-slate-900" />
                    <div className="flex items-center gap-1 no-print opacity-0 group-hover/section:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection('projects', 'projects');
                        }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                        title="彻底移除此栏目"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          const newItem: Project = {
                            id: Math.random().toString(36).substr(2, 9),
                            name: '项目名称',
                            role: '负责内容',
                            startDate: '20XX.XX',
                            endDate: '20XX.XX',
                            description: '项目描述...'
                          };
                          updateResume(prev => ({ ...prev, projects: [...prev.projects, newItem] }));
                        }}
                        className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-all cursor-pointer"
                        title="添加项目"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                <div className="space-y-5">
                  {resume.projects.map((pro, index) => (
                    <div key={pro.id} className="relative group/item flex flex-col gap-1">
                      <button 
                        onClick={() => updateResume(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== pro.id) }))}
                        className="absolute -left-6 top-1 no-print opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex justify-between items-baseline">
                        <div className="flex items-center gap-2">
                          <EditableField value={pro.name} onChange={(v) => updateFieldInValue(`projects.${index}.name`, v)} className="font-bold text-[11pt] text-slate-900" />
                          <span className="text-slate-300">|</span>
                          <EditableField value={pro.role} onChange={(v) => updateFieldInValue(`projects.${index}.role`, v)} className="font-bold text-[10.5pt] text-slate-800" />
                        </div>
                        <EditableField 
                          value={`${pro.startDate} - ${pro.endDate}`} 
                          onChange={(v) => {
                            const [start, end] = v.split(' - ');
                            updateResume(prev => {
                              const next = JSON.parse(JSON.stringify(prev));
                              next.projects[index].startDate = start || '';
                              next.projects[index].endDate = end || '';
                              return next;
                            });
                          }} 
                          className="text-[10pt] font-medium text-slate-600 text-right min-w-[120px]"
                        />
                      </div>
                      <EditableField 
                        value={pro.description} 
                        onChange={(v) => updateFieldInValue(`projects.${index}.description`, v)} 
                        className="text-[10.5pt] text-slate-800 whitespace-pre-wrap leading-relaxed"
                        path={`projects.${index}.description`}
                        onConfirm={confirmAIChange}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Skills */}
              {resume.sectionVisibility?.skills !== false && (
                <section className="space-y-1.5 group/section relative">
                  <div className="flex items-center gap-2">
                    <EditableField 
                      value={resume.labels?.skills || '专业技能'} 
                      onChange={(v) => updateLabel('skills', v)}
                      className="text-[12pt] font-bold text-slate-900 whitespace-nowrap"
                    />
                    <div className="flex-1 h-px bg-slate-900" />
                    <div className="flex items-center gap-1 no-print opacity-0 group-hover/section:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection('skills', 'skills');
                        }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                        title="彻底移除此栏目"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          const newItem: SkillSet = {
                            id: Math.random().toString(36).substr(2, 9),
                            category: '类别',
                            skills: '技能点...'
                          };
                          updateResume(prev => ({ ...prev, skills: [...prev.skills, newItem] }));
                        }}
                        className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-all cursor-pointer"
                        title="添加专业技能"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                <div className="space-y-1 pt-1">
                  {resume.skills.map((skill, index) => (
                    <div key={skill.id} className="relative group/item text-[10.5pt] flex gap-2">
                      <button 
                        onClick={() => updateResume(prev => ({ ...prev, skills: prev.skills.filter(s => s.id !== skill.id) }))}
                        className="absolute -left-6 top-1 no-print opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                      <EditableField value={skill.category} onChange={(v) => updateFieldInValue(`skills.${index}.category`, v)} className="font-bold whitespace-nowrap min-w-[100px]" />
                      <EditableField 
                        value={skill.skills} 
                        onChange={(v) => updateFieldInValue(`skills.${index}.skills`, v)} 
                        className="text-slate-800 leading-relaxed flex-1"
                        path={`skills.${index}.skills`}
                        onConfirm={confirmAIChange}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
            </div>
            </div>

            {/* Column Management */}
            {Object.values(resume.sectionVisibility || {}).some(v => v === false) && (
              <div className="mt-8 pt-6 border-t border-slate-100 no-print">
                <h3 className="text-[10px] font-bold text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <Plus size={12} />
                  找回隐藏栏目
                </h3>
                <div className="flex flex-wrap gap-2">
                  {resume.sectionVisibility?.summary === false && (
                    <button 
                      onClick={() => toggleSectionVisibility('summary')}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-medium hover:bg-blue-100 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={12} /> 自我评价
                    </button>
                  )}
                  {resume.sectionVisibility?.education === false && (
                    <button 
                      onClick={() => toggleSectionVisibility('education')}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-medium hover:bg-blue-100 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={12} /> 教育背景
                    </button>
                  )}
                  {resume.sectionVisibility?.experience === false && (
                    <button 
                      onClick={() => toggleSectionVisibility('experience')}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-medium hover:bg-blue-100 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={12} /> 工作经历
                    </button>
                  )}
                  {resume.sectionVisibility?.projects === false && (
                    <button 
                      onClick={() => toggleSectionVisibility('projects')}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-medium hover:bg-blue-100 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={12} /> 项目经历
                    </button>
                  )}
                  {resume.sectionVisibility?.skills === false && (
                    <button 
                      onClick={() => toggleSectionVisibility('skills')}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-medium hover:bg-blue-100 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={12} /> 专业技能
                    </button>
                  )}
                </div>
              </div>
            )}

            {!resume.personalInfo.name && resume.educations.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 py-32 border-2 border-dashed border-slate-300 rounded-2xl no-print">
                <FileText size={48} strokeWidth={1} />
                <p>在右侧填写信息，这里将实时预览</p>
              </div>
            )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
}

