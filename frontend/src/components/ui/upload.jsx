import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Progress } from './progress.jsx';

export function Upload({
  onFileSelect,
  accept = '.pdf,.png,.jpeg,.jpg,.xlsx,.xls',
  maxSizeMB = 10,
  className,
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const validateFile = (selectedFile) => {
    setError(null);
    if (!selectedFile) return false;

    
    const sizeInMB = selectedFile.size / (1024 * 1024);
    if (sizeInMB > maxSizeMB) {
      setError(`File size exceeds the limit of ${maxSizeMB}MB.`);
      return false;
    }

    
    const extension = `.${selectedFile.name.split('.').pop().toLowerCase()}`;
    const acceptedExtensions = accept.split(',').map((ext) => ext.trim().toLowerCase());
    if (!acceptedExtensions.includes(extension)) {
      setError(`Unsupported file type. Accepted: ${accept}`);
      return false;
    }

    return true;
  };

  const simulateUpload = (selectedFile) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          if (onFileSelect) {
            onFileSelect(selectedFile);
          }
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        simulateUpload(droppedFile);
      }
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
        simulateUpload(selectedFile);
      }
    }
  };

  const triggerInputClick = () => {
    fileInputRef.current.click();
  };

  const clearFile = (e) => {
    e.stopPropagation();
    setFile(null);
    setError(null);
    setUploadProgress(0);
    setIsUploading(false);
  };

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={handleChange}
      />

      {!file ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerInputClick}
          className={cn(
            'flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all duration-200 select-none bg-muted/10 border-border hover:bg-muted/20 hover:border-primary/50',
            isDragActive && 'border-primary bg-primary/5 scale-[0.99]'
          )}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1 text-center">
            Drag & drop your file here, or{' '}
            <span className="text-primary hover:underline">browse</span>
          </p>
          <p className="text-xs text-muted-foreground text-center">
            Supports PDF, PNG, JPG, XLS (Max {maxSizeMB}MB)
          </p>
          {error && (
            <div className="flex items-center gap-1.5 mt-3 text-red-500 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-xl p-4 bg-muted/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-xs">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>

            <button
              onClick={clearFile}
              className="p-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isUploading ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  Uploading and analyzing...
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-1.5" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-semibold bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">
              <CheckCircle className="w-4 h-4" />
              <span>Document successfully parsed & uploaded.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
