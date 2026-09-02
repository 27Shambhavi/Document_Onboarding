import React, { useCallback, useState } from 'react';
import { UploadCloud, File, AlertCircle, RefreshCw } from 'lucide-react';

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  accept: string[];
  maxSizeMb?: number;
  isLoading?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFileSelect,
  accept,
  maxSizeMb = 50,
  isLoading = false,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    setError(null);
    
    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!accept.includes(extension)) {
      setError(`Invalid file type. Only ${accept.join(', ')} are supported.`);
      return false;
    }

    // Check file size
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File is too large. Max allowed size is ${maxSizeMb}MB.`);
      return false;
    }

    return true;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    }
  }, [onFileSelect, accept, maxSizeMb]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    }
  }, [onFileSelect, accept, maxSizeMb]);

  const handleReset = () => {
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative rounded-lg border border-dashed p-8 text-center transition-all duration-300 sm:p-10 ${
          dragActive
            ? 'border-primary bg-primary/5 shadow-[0_18px_40px_-34px_hsl(var(--primary))]'
            : selectedFile
            ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_18px_40px_-34px_rgba(16,185,129,0.8)]'
            : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40'
        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept={accept.join(',')}
          onChange={handleChange}
          disabled={isLoading}
        />

        {!selectedFile ? (
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center cursor-pointer space-y-4"
          >
            <div className="app-icon h-16 w-16 transition-transform hover:scale-[1.03]">
              <UploadCloud className="h-8 w-8" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground sm:text-lg">
                Drag and drop your file here, or{' '}
                <span className="text-primary underline decoration-2 underline-offset-4 hover:text-primary/80">browse</span>
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Supports {accept.join(', ')} (Max {maxSizeMb}MB)
              </p>
            </div>
          </label>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-6">
            <div className="flex w-full max-w-lg items-center gap-4 truncate rounded-lg border border-border bg-muted px-5 py-4">
              <File className="h-8 w-8 text-primary flex-shrink-0" />
              <div className="text-left truncate">
                <p className="text-base font-semibold text-foreground truncate">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2.5 text-base text-primary font-semibold">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Uploading and processing candidate files...
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="app-button-secondary h-11"
                >
                  Change File
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--uncleared)]/25 bg-[var(--uncleared-soft)] px-5 py-4 text-sm leading-relaxed text-[var(--uncleared)]">
          <AlertCircle className="h-5 w-5 text-[var(--uncleared)] flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
